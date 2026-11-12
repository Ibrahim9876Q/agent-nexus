import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Store, id } from '../src/db/store.ts';
import { Engine } from '../src/engine.ts';
import { git } from '../src/integrations/git.ts';
import {
  usagePressure,
  recoveryCandidate,
  stricterApproval,
  saveUsageCheckpoint,
} from '../src/usage-recovery.ts';
import { saveAttachment } from '../src/attachments.ts';
import { CodexConnection } from '../src/providers/codex.ts';
import { workSummary } from '../src/work-summary.ts';
const delay = () => new Promise((r) => setTimeout(r, 15));
async function waitFor(fn: () => boolean) {
  for (let i = 0; i < 200 && !fn(); i++) await delay();
  assert.ok(fn());
}
const png =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
async function setup(
  protocol = false,
  hooks: ConstructorParameters<typeof Engine>[2] = {},
) {
  const root = await mkdtemp(join(tmpdir(), 'nexus-recovery-'));
  const folder = join(root, 'repo');
  await mkdir(folder);
  const store = new Store(':memory:');
  const engine = new Engine(store, root, {
    ...hooks,
    ...(protocol
      ? {
          connectionFactory: (home) =>
            new CodexConnection(home, process.execPath, [
              resolve('tests/fixtures/app-server.cjs'),
            ]),
        }
      : {}),
  });
  const repo = await engine.addRepo(folder, 'Recovery repo');
  const account = engine.addAccount({
    name: 'First',
    provider: protocol ? 'codex' : 'mock',
  });
  if (protocol) {
    await engine.login(account.id);
    await waitFor(() => store.get('accounts', account.id).status === 'ready');
    await engine.verify(account.id);
  }
  const project = engine.addProject(repo.id, 'Recovery', 'Test resumable work');
  store.put('projects', { ...project, coordinatorAccountId: account.id });
  const chat = engine.createChat(project.id);
  return { root, store, engine, account, project, chat, folder };
}

test('images are stored privately, scoped to a chat, and forwarded as localImage through the Codex protocol', async () => {
  const { root, store, engine, account, project, chat } = await setup(true);
  try {
    const image = await saveAttachment(store, root, {
      projectId: project.id,
      chatId: chat.id,
      name: '../../sample.png',
      base64: png,
    });
    assert.equal(image.name, 'sample.png');
    assert.equal(image.mime, 'image/png');
    assert.equal((await readFile(image.path)).toString('base64'), png);
    assert.ok(!JSON.stringify(engine.snapshot()).includes(png));
    await assert.rejects(
      saveAttachment(store, root, {
        projectId: project.id,
        chatId: chat.id,
        name: 'bad.svg',
        base64: Buffer.from('<svg/>').toString('base64'),
      }),
      /PNG/,
    );
    await assert.rejects(
      saveAttachment(store, root, {
        projectId: project.id,
        chatId: chat.id,
        name: 'bad.png',
        base64: '%%%=',
      }),
      /encoding/,
    );
    const other = engine.createChat(project.id);
    await assert.rejects(
      engine.command({
        projectId: project.id,
        chatId: other.id,
        text: 'Wrong chat',
        attachmentIds: [image.id],
      }),
      /another chat/,
    );
    const command = await engine.command({
      projectId: project.id,
      chatId: chat.id,
      attachmentIds: [image.id],
    });
    const taskId = command.taskIds![0];
    await engine.tick();
    await waitFor(() => store.get('tasks', taskId).status === 'completed');
    const params = JSON.parse(
      await readFile(
        join(store.get('tasks', taskId).worktree!, 'runtime-params.json'),
        'utf8',
      ),
    );
    assert.deepEqual(params.turn.input[1], {
      type: 'localImage',
      path: image.path,
    });
    assert.match(params.turn.input[0].text, /review the attached images/);
    const current = store.get('accounts', account.id);
    store.put('accounts', {
      ...current,
      models: current.models!.map((m) => ({ ...m, inputModalities: ['text'] })),
    });
    const rejected = await engine.command({
      projectId: project.id,
      chatId: chat.id,
      text: 'Review',
      attachmentIds: [image.id],
    });
    assert.match(rejected.reply!.error!, /does not support images/);
  } finally {
    await engine.stop();
    store.close();
  }
});

test('95% checkpoint waits for the running writer to stop, preserves files and index, and hands off with stable task identity', async () => {
  let release!: (value: string) => void;
  let starts = 0;
  const { root, store, engine, account, project, chat } = await setup(false, {
    execute: async (task, agent) => {
      starts++;
      if (starts === 1) {
        await writeFile(join(task.worktree!, 'unfinished.txt'), 'saved work');
        return new Promise<string>((r) => {
          release = r;
        });
      }
      assert.equal(
        await readFile(join(task.worktree!, 'unfinished.txt'), 'utf8'),
        'saved work',
      );
      assert.ok(task.handoffContext);
      assert.equal(agent.threadId, undefined);
      return 'Continued by the second account';
    },
  });
  try {
    const alternate = engine.addAccount({ name: 'Second', provider: 'mock' });
    store.put('accounts', {
      ...store.get('accounts', alternate.id),
      approvalMode: 'full',
    });
    const command = await engine.command({
      projectId: project.id,
      chatId: chat.id,
      text: 'Write something',
    });
    const taskId = command.taskIds![0];
    await engine.tick();
    await waitFor(() => !!release);
    const task = store.get('tasks', taskId);
    const beforeIndex = await git(task.worktree!, 'diff', '--cached');
    const beforeHead = await git(task.worktree!, 'rev-parse', 'HEAD');
    store.put('tasks', { ...task, reasoningSummary: 'DO_NOT_COPY_REASONING' });
    store.put('accounts', {
      ...account,
      capacity: { primary: { usedPercent: 95 }, observedAt: Date.now() },
    });
    await engine.tick();
    assert.equal(starts, 1);
    assert.equal(store.get('agents', task.agentId).accountId, account.id);
    assert.equal(store.get('tasks', taskId).quotaRecovery?.state, 'stopping');
    assert.equal(
      store.all('events').filter((e) => e.type === 'usage.checkpoint.saved')
        .length,
      0,
    );
    release('Partial report');
    await waitFor(() => store.get('tasks', taskId).status === 'blocked');
    await engine.tick();
    await waitFor(() => store.get('tasks', taskId).status === 'completed');
    const resumed = store.get('tasks', taskId);
    assert.equal(store.get('agents', resumed.agentId).accountId, alternate.id);
    assert.equal(resumed.worktree, task.worktree);
    assert.equal(resumed.approvalCeiling, 'ask');
    assert.equal(starts, 2);
    assert.equal(await git(task.worktree!, 'diff', '--cached'), beforeIndex);
    assert.equal(await git(task.worktree!, 'rev-parse', 'HEAD'), beforeHead);
    const raw = await readFile(resumed.handoffContext!, 'utf8');
    assert.doesNotMatch(raw, /DO_NOT_COPY_REASONING|threadId|auth\.json/);
    const manifest = JSON.parse(raw);
    assert.equal(
      await git(task.worktree!, 'show', manifest.gitCommit + ':unfinished.txt'),
      'saved work',
    );
    assert.equal(manifest.commands[0].text, 'Write something');
    assert.equal(
      store.get('commands', command.id).reply?.text,
      'Continued by the second account',
    );
    assert.equal(
      workSummary([resumed], store.all('agents'), store.all('accounts'))
        .accountsUsed,
      2,
    );
    assert.ok(resumed.handoffContext!.startsWith(join(root, 'handoffs')));
  } finally {
    release?.('Stopped');
    await engine.stop();
    store.close();
  }
});

test('quota waits for fresh capacity, honors Stop and manual pause, and resumes automatically without another account', async () => {
  let starts = 0;
  const { store, engine, account, project, chat } = await setup(false, {
    execute: async () => {
      starts++;
      return 'Resumed';
    },
  });
  try {
    store.put('accounts', {
      ...account,
      capacity: { primary: { usedPercent: 100, resetsAt: 1 }, observedAt: 1 },
    });
    const command = await engine.command({
      projectId: project.id,
      chatId: chat.id,
      text: 'Wait for capacity',
    });
    const taskId = command.taskIds![0];
    await engine.tick();
    assert.equal(starts, 0);
    assert.ok(store.get('tasks', taskId).quotaRecovery?.checkpoint);
    await engine.pause(project.id, true);
    store.put('accounts', {
      ...account,
      capacity: { primary: { usedPercent: 10 }, observedAt: Date.now() },
    });
    await engine.tick();
    assert.equal(starts, 0);
    await engine.pause(project.id, false);
    await engine.tick();
    await waitFor(() => starts === 1);
    await waitFor(() => store.get('tasks', taskId).status === 'completed');
    store.put('accounts', {
      ...account,
      capacity: { secondary: { usedPercent: 96 }, observedAt: Date.now() },
    });
    const second = await engine.command({
      projectId: project.id,
      chatId: chat.id,
      text: 'Another request',
    });
    await engine.tick();
    assert.ok(store.get('tasks', second.taskIds![0]).quotaRecovery);
    await engine.stopChat(chat.id);
    store.put('accounts', {
      ...account,
      capacity: { secondary: { usedPercent: 0 }, observedAt: Date.now() },
    });
    await engine.tick();
    assert.equal(starts, 1);
    assert.equal(
      store.get('tasks', second.taskIds![0]).quotaRecovery,
      undefined,
    );
  } finally {
    await engine.stop();
    store.close();
  }
});

test('usage errors become resumable waits and a different Codex account starts a fresh thread with capped permissions', async () => {
  const { store, engine, account, project, chat } = await setup(true);
  try {
    const alternate = engine.addAccount({ name: 'Second', provider: 'codex' });
    await engine.login(alternate.id);
    await waitFor(() => store.get('accounts', alternate.id).status === 'ready');
    await engine.verify(alternate.id);
    store.put('accounts', {
      ...store.get('accounts', alternate.id),
      approvalMode: 'full',
    });
    const refresh = engine.refreshCapacity.bind(engine);
    engine.refreshCapacity = async (key) =>
      key === account.id ? store.get('accounts', key) : refresh(key);
    const command = await engine.command({
      projectId: project.id,
      chatId: chat.id,
      text: 'EXERCISE_USAGE_LIMIT',
    });
    const taskId = command.taskIds![0];
    await engine.tick();
    await waitFor(() => !!store.get('tasks', taskId).quotaRecovery);
    assert.notEqual(store.get('tasks', taskId).status, 'failed');
    const oldThread = store.get(
      'agents',
      store.get('tasks', taskId).agentId,
    ).threadId;
    await engine.tick();
    await waitFor(() => store.get('tasks', taskId).status === 'completed');
    const task = store.get('tasks', taskId);
    const newAgent = store.get('agents', task.agentId);
    assert.equal(newAgent.accountId, alternate.id);
    assert.notEqual(newAgent.threadId, oldThread);
    const params = JSON.parse(
      await readFile(join(task.worktree!, 'runtime-params.json'), 'utf8'),
    );
    assert.equal(params.thread.threadId, undefined);
    assert.equal(params.thread.approvalPolicy, 'untrusted');
    assert.equal(params.thread.sandbox, 'workspace-write');
    assert.match(
      params.turn.input[0].text,
      /Read the local public context manifest/,
    );
    assert.doesNotMatch(
      await readFile(task.handoffContext!, 'utf8'),
      /RAW_REASONING_MUST_NOT_PERSIST/,
    );
  } finally {
    await engine.stop();
    store.close();
  }
});

test('recovery selection respects both windows, drain, provider, and approval restrictions', async () => {
  const { store, engine, account } = await setup();
  try {
    const second = engine.addAccount({ name: 'Second', provider: 'mock' });
    assert.equal(
      usagePressure({
        ...account,
        capacity: { secondary: { usedPercent: 95 }, observedAt: 1 },
      }),
      true,
    );
    assert.equal(
      recoveryCandidate(account, [{ ...second, enabled: false }]),
      undefined,
    );
    assert.equal(
      recoveryCandidate(account, [{ ...second, provider: 'codex' }]),
      undefined,
    );
    assert.equal(
      recoveryCandidate(account, [
        {
          ...second,
          capacity: { primary: { usedPercent: 99 }, observedAt: 1 },
        },
      ]),
      undefined,
    );
    assert.equal(stricterApproval('ask', 'full'), 'ask');
    assert.equal(stricterApproval('full', 'auto'), 'auto');
  } finally {
    await engine.stop();
    store.close();
  }
});

test('live 95% notifications stop a Codex turn before a fresh account continues with its images', async () => {
  const { root, store, engine, account, project, chat } = await setup(true);
  try {
    const alternate = engine.addAccount({ name: 'Second', provider: 'codex' });
    await engine.login(alternate.id);
    await waitFor(() => store.get('accounts', alternate.id).status === 'ready');
    await engine.verify(alternate.id);
    const refresh = engine.refreshCapacity.bind(engine);
    engine.refreshCapacity = async (key) =>
      key === account.id ? store.get('accounts', key) : refresh(key);
    const image = await saveAttachment(store, root, {
      projectId: project.id,
      chatId: chat.id,
      name: 'context.png',
      base64: png,
    });
    const command = await engine.command({
      projectId: project.id,
      chatId: chat.id,
      text: 'EXERCISE_QUOTA',
      attachmentIds: [image.id],
    });
    const taskId = command.taskIds![0];
    await engine.tick();
    await waitFor(
      () =>
        store.get('accounts', account.id).capacity?.primary?.usedPercent === 95,
    );
    assert.equal(store.get('tasks', taskId).status, 'running');
    const oldThread = store.get(
      'agents',
      store.get('tasks', taskId).agentId,
    ).threadId;
    await engine.tick();
    await waitFor(
      () => store.get('tasks', taskId).quotaRecovery?.state === 'waiting',
    );
    assert.equal(
      store.get('agents', store.get('tasks', taskId).agentId).accountId,
      account.id,
    );
    await engine.tick();
    await waitFor(() => store.get('tasks', taskId).status === 'completed');
    const task = store.get('tasks', taskId);
    assert.equal(store.get('agents', task.agentId).accountId, alternate.id);
    assert.notEqual(store.get('agents', task.agentId).threadId, oldThread);
    const params = JSON.parse(
      await readFile(join(task.worktree!, 'runtime-params.json'), 'utf8'),
    );
    assert.deepEqual(params.turn.input[1], {
      type: 'localImage',
      path: image.path,
    });
    assert.equal(
      JSON.parse(await readFile(task.handoffContext!, 'utf8')).attachments[0]
        .id,
      image.id,
    );
  } finally {
    await engine.stop();
    store.close();
  }
});

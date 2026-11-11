import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Store, id } from '../src/db/store.ts';
import { Engine } from '../src/engine.ts';
import { CodexConnection } from '../src/providers/codex.ts';
import { runtimeSettings } from '../src/runtime-settings.ts';
import { commandTasks, workSummary } from '../src/work-summary.ts';
import { responseUpdate } from '../src/response-stream.ts';
import type { Task, TokenUsage } from '../src/types.ts';

const delay = (ms = 20) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn: () => boolean) {
  for (let i = 0; i < 150 && !fn(); i++) await delay();
  assert.ok(fn(), 'Expected runtime state was not reached');
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'nexus-chat-fixture-'));
  const store = new Store(':memory:');
  const engine = new Engine(store, root, {
    connectionFactory: (home) =>
      new CodexConnection(home, process.execPath, [
        resolve('tests/fixtures/app-server.cjs'),
      ]),
  });
  engine.git.worktree = async (_repo, taskId) => {
    const path = join(root, taskId);
    await mkdir(path);
    return { path, branch: 'fixture/' + taskId };
  };
  const account = engine.addAccount({
    name: 'Protocol fixture',
    provider: 'codex',
  });
  await engine.login(account.id);
  await waitFor(() => store.get('accounts', account.id).status === 'ready');
  await engine.verify(account.id);
  const repo = store.put('repos', {
    id: id(),
    name: 'Fixture repo',
    path: root,
  });
  const project = engine.addProject(
    repo.id,
    'Fixture chat',
    'Protocol fixture workspace',
  );
  store.put('projects', { ...project, coordinatorAccountId: account.id });
  return { store, engine, account, project };
}

test('runtime model pages, account settings, natural chat, phases and per-turn usage work through subprocess RPC', async () => {
  const { store, engine, account, project } = await fixture();
  try {
    assert.deepEqual(
      store.get('accounts', account.id).models?.map((m) => m.model),
      ['fixture-model-a', 'fixture-model-b'],
    );
    await assert.rejects(
      engine.updateSettings(account.id, { model: 'invented-model' }),
      /reported/,
    );
    await assert.rejects(
      engine.updateSettings(account.id, {
        model: 'fixture-model-a',
        effort: 'ultra',
      }),
      /does not support/,
    );
    await engine.updateSettings(account.id, {
      model: 'fixture-model-b',
      effort: 'ultra',
      approvalMode: 'auto',
    });
    const other = engine.addAccount({ name: 'Other', provider: 'codex' });
    assert.equal(store.get('accounts', other.id).model, undefined);
    const first = await engine.command({ projectId: project.id, text: 'hi' });
    assert.equal(first.mode, 'chat');
    assert.equal(store.all('tasks').length, 1);
    const task = store.get('tasks', first.taskIds![0]);
    assert.equal(task.prompt, 'hi');
    await engine.tick();
    await waitFor(() => store.get('tasks', task.id).status === 'completed');
    const completed = store.get('tasks', task.id);
    const params = JSON.parse(
      await readFile(join(completed.worktree!, 'runtime-params.json'), 'utf8'),
    );
    assert.equal(params.thread.model, 'fixture-model-b');
    assert.equal(params.thread.approvalsReviewer, 'auto_review');
    assert.equal(params.thread.approvalPolicy, 'on-request');
    assert.equal(params.thread.sandbox, 'workspace-write');
    assert.equal(params.turn.effort, 'ultra');
    assert.equal(params.turn.summary, 'concise');
    assert.match(params.turn.input[0].text, /^hi\n/);
    assert.doesNotMatch(
      params.turn.input[0].text,
      /Inspect this repository|Use nexus_team/,
    );
    assert.match(
      params.thread.developerInstructions,
      /answer directly without repository inspection/,
    );
    assert.equal(
      completed.output,
      'Protocol fixture completed host tool call.',
    );
    assert.equal(completed.reasoningSummary, 'Public fixture summary.');
    assert.ok(completed.responseItems?.some((i) => i.phase === 'commentary'));
    assert.doesNotMatch(
      JSON.stringify(completed),
      /RAW_REASONING_MUST_NOT_PERSIST/,
    );
    const firstSummary = workSummary(
      commandTasks(first, store.all('tasks')),
      store.all('agents'),
      store.all('accounts'),
    );
    assert.equal(firstSummary.accountsUsed, 1);
    assert.equal(firstSummary.tokens, 200);
    assert.equal(firstSummary.usageComplete, true);

    await engine.updateSettings(account.id, {
      model: 'fixture-model-a',
      effort: 'low',
      approvalMode: 'ask',
    });
    const second = await engine.command({
      projectId: project.id,
      text: 'Explain the result',
    });
    assert.deepEqual(second.targets, first.targets);
    assert.equal(
      store.all('agents').length,
      1,
      'Chat reuses its coordinator instead of consuming a worker slot per message',
    );
    const next = store.get('tasks', second.taskIds![0]);
    assert.equal(next.worktree, completed.worktree);
    await delay(800);
    await engine.tick();
    await waitFor(() => store.get('tasks', next.id).status === 'completed');
    const nextParams = JSON.parse(
      await readFile(join(next.worktree!, 'runtime-params.json'), 'utf8'),
    );
    assert.equal(nextParams.thread.model, 'fixture-model-a');
    assert.equal(nextParams.thread.approvalPolicy, 'untrusted');
    assert.equal(nextParams.turn.effort, 'low');
    assert.equal(
      workSummary(
        commandTasks(second, store.all('tasks')),
        store.all('agents'),
        store.all('accounts'),
      ).tokens,
      200,
    );
    assert.equal(store.get('tasks', completed.id).output, completed.output);
    await engine.updateSettings(account.id, { model: null, effort: null });
    const reset = store.get('accounts', account.id);
    assert.equal(
      runtimeSettings(reset, { permissions: 'workspace-write' }).model,
      'fixture-model-a',
    );
  } finally {
    await engine.stop();
    store.close();
  }
});

test('approval modes preserve read-only boundaries; full access alone accepts an execution request', async () => {
  for (const mode of ['ask', 'auto', 'full'] as const) {
    const { store, engine, account, project } = await fixture();
    try {
      await engine.updateSettings(account.id, { approvalMode: mode });
      const a = engine.addAgent(account.id, project.id, 'worker');
      assert.equal(
        runtimeSettings(
          { ...account, approvalMode: 'full' },
          { ...a, permissions: 'read-only' },
        ).sandbox,
        'read-only',
      );
      const task = engine.addTask(
        a.id,
        'Approval fixture',
        'EXERCISE_APPROVAL',
      );
      await engine.tick();
      if (mode !== 'full') {
        await waitFor(() =>
          store.all('approvals').some((a) => a.status === 'pending'),
        );
        engine.resolveApproval(store.all('approvals')[0].id, true);
      }
      await waitFor(() => store.get('tasks', task.id).status === 'completed');
      const finished = store.get('tasks', task.id);
      const params = JSON.parse(
        await readFile(join(finished.worktree!, 'runtime-params.json'), 'utf8'),
      );
      const decision = JSON.parse(
        await readFile(
          join(finished.worktree!, 'approval-decision.json'),
          'utf8',
        ),
      );
      assert.equal(decision.decision, 'accept');
      assert.equal(
        params.thread.approvalsReviewer,
        mode === 'auto' ? 'auto_review' : 'user',
      );
      assert.equal(
        params.thread.sandbox,
        mode === 'full' ? 'danger-full-access' : 'workspace-write',
      );
      assert.equal(store.all('approvals').length, mode === 'full' ? 0 : 1);
    } finally {
      await engine.stop();
      store.close();
    }
  }
});

test('coordinator waits for planned accounts, receives evidence and records assignments', async () => {
  const store = new Store(':memory:');
  let workerAccountId = '';
  const engine = new Engine(store, tmpdir(), {
    execute: async (task, agent, e) => {
      if (agent.role !== 'coordinator') return 'Worker evidence';
      if (task.attempts === 1) {
        e.plan(agent.id, {
          tasks: [
            {
              key: 'job',
              accountId: workerAccountId,
              role: 'developer',
              title: 'Implement request',
              prompt: 'Do the requested work',
              dependencies: [],
            },
          ],
        });
        return 'Work assigned';
      }
      const inbox = e.bus.inbox(agent.id);
      assert.ok(
        inbox.some((m) =>
          JSON.stringify(m.payload).includes('Worker evidence'),
        ),
      );
      for (const m of inbox) e.bus.ack(agent.id, m.id);
      return 'Work complete';
    },
  });
  engine.git.worktree = async (_, taskId) => ({
    path: join(tmpdir(), taskId),
    branch: taskId,
  });
  try {
    const coordinator = engine.addAccount({
      name: 'Coordinator',
      provider: 'mock',
    });
    workerAccountId = engine.addAccount({
      name: 'Worker',
      provider: 'mock',
    }).id;
    const repo = store.put('repos', { id: id(), name: 'Repo', path: tmpdir() });
    const project = engine.addProject(repo.id, 'P', 'Test workspace');
    store.put('projects', { ...project, coordinatorAccountId: coordinator.id });
    const command = await engine.command({
      projectId: project.id,
      text: 'Implement a feature',
    });
    for (let i = 0; i < 12; i++) {
      await engine.tick();
      await delay();
    }
    const tasks = commandTasks(command, store.all('tasks'));
    assert.equal(tasks.length, 2);
    assert.ok(tasks.every((t) => t.status === 'completed'));
    assert.equal(
      store.get('tasks', command.taskIds![0]).output,
      'Work complete',
    );
    const summary = workSummary(
      tasks,
      store.all('agents'),
      store.all('accounts'),
    );
    assert.equal(summary.accountsUsed, 2);
    assert.equal(
      summary.hasUsage,
      false,
      'Missing provider usage is not represented as zero tokens',
    );
  } finally {
    await engine.stop();
    store.close();
  }
});

test('stream completion replaces deltas, progress stays separate, and unknown usage stays unknown', () => {
  let task = { id: 'task' } as Task;
  task = responseUpdate(task, 'item/started', {
    item: {
      id: 'progress',
      type: 'agentMessage',
      phase: 'commentary',
      text: '',
    },
  });
  task = responseUpdate(task, 'item/agentMessage/delta', {
    itemId: 'progress',
    delta: 'Working…',
  });
  assert.equal(task.output, '');
  task = responseUpdate(task, 'item/agentMessage/delta', {
    itemId: 'final',
    delta: 'Draft',
  });
  task = responseUpdate(task, 'item/completed', {
    item: {
      id: 'final',
      type: 'agentMessage',
      phase: 'final_answer',
      text: 'Final answer',
    },
  });
  assert.equal(task.output, 'Final answer');
  task = responseUpdate(task, 'item/reasoning/summaryTextDelta', {
    itemId: 'reason',
    summaryIndex: 0,
    delta: 'Public draft',
  });
  task = responseUpdate(task, 'item/completed', {
    item: {
      id: 'reason',
      type: 'reasoning',
      summary: ['Public final summary'],
      content: ['private content'],
    },
  });
  assert.equal(task.reasoningSummary, 'Public final summary');
  assert.doesNotMatch(JSON.stringify(task), /private content|Public draft/);
  assert.equal(
    responseUpdate(task, 'item/reasoning/textDelta', { delta: 'private' }),
    task,
  );
  const usage: TokenUsage = {
    totalTokens: 100,
    inputTokens: 80,
    cachedInputTokens: 0,
    outputTokens: 20,
    reasoningOutputTokens: 5,
  };
  task = responseUpdate(task, 'thread/tokenUsage/updated', {
    turnId: 'unknown-baseline',
    tokenUsage: { total: usage, last: usage },
  });
  assert.equal(task.usageByTurn, undefined);
});

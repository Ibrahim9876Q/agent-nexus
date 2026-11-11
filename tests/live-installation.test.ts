import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import { Store, id } from '../src/db/store.ts';
import { Engine } from '../src/engine.ts';
import { CodexConnection } from '../src/providers/codex.ts';
import { runtimeConfig } from '../src/runtime-mode.ts';
import { resolveCodex } from '../src/providers/resolve-codex.ts';
import { createNexusServer } from '../src/server.ts';
import { git } from '../src/integrations/git.ts';
const delay = () => new Promise((r) => setTimeout(r, 20));
test('live and mock installations have separate default locations', () => {
  const live = runtimeConfig({}, tmpdir()),
    mock = runtimeConfig({ NEXUS_MOCK_INSTALLATION: '1' }, tmpdir());
  assert.equal(live.mock, false);
  assert.notEqual(live.dataDir, mock.dataDir);
});
test('live server starts empty and refuses simulation and mock accounts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nexus-live-'));
  const app = await createNexusServer(root, 0, { mock: false });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const a = app.server.address();
  if (!a || typeof a === 'string') throw new Error('No listener');
  const base = `http://127.0.0.1:${a.port}`;
  try {
    const { token } = await (await fetch(base + '/api/session')).json();
    const headers = {
      'X-Nexus-Token': token,
      'Content-Type': 'application/json',
    };
    const state = await (await fetch(base + '/api/state', { headers })).json();
    assert.equal(state.installation, 'live');
    for (const key of [
      'accounts',
      'projects',
      'agents',
      'tasks',
      'commands',
      'messages',
    ])
      assert.deepEqual(state[key], []);
    assert.equal(
      (await fetch(base + '/api/demo', { method: 'POST', headers })).status,
      404,
    );
    assert.equal(
      (
        await fetch(base + '/api/accounts', {
          method: 'POST',
          headers,
          body: JSON.stringify({ name: 'Not live', provider: 'mock' }),
        })
      ).status,
      400,
    );
    assert.equal(app.store.all('accounts').length, 0);
    const folder = await mkdtemp(join(tmpdir(), 'nexus-empty-project-'));
    const added = await fetch(base + '/api/repos', {
      method: 'POST',
      headers,
      body: JSON.stringify({ name: 'New project', path: folder }),
    });
    assert.equal(added.status, 200);
    const repo = await added.json();
    assert.equal(await git(folder, 'rev-list', '--count', 'HEAD'), '1');
    const account = app.store.put('accounts', {
      id: id(),
      name: 'Real',
      provider: 'codex',
      status: 'ready',
      concurrency: 2,
      nativeLimit: 0,
      maxDepth: 3,
      maxAgents: 12,
    });
    const opened = await fetch(base + '/api/projects', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        repoId: repo.id,
        name: 'Empty workspace',
        accountId: account.id,
      }),
    });
    assert.equal(opened.status, 200);
    assert.equal(app.store.all('tasks').length, 0);
    assert.equal(app.store.all('agents').length, 0);
  } finally {
    await app.close();
  }
});
test('Codex provider path runs through subprocess RPC, login, host tools, streamed output and completion', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nexus-protocol-')),
    store = new Store(':memory:');
  const engine = new Engine(store, root, {
    connectionFactory: (home) =>
      new CodexConnection(home, process.execPath, [
        resolve('tests/fixtures/app-server.cjs'),
      ]),
  });
  engine.git.worktree = async (_repo, taskId) => {
    const folder = join(root, taskId);
    await mkdir(folder);
    return { path: folder, branch: 'test/' + taskId };
  };
  try {
    const account = engine.addAccount({
      name: 'RPC fixture account',
      provider: 'codex',
    });
    assert.equal((await engine.verify(account.id)).status, 'signed-out');
    await engine.login(account.id);
    for (
      let i = 0;
      i < 100 && store.get('accounts', account.id).status !== 'ready';
      i++
    )
      await delay();
    assert.equal(store.get('accounts', account.id).status, 'ready');
    assert.equal(
      store.get('accounts', account.id).capacity?.primary?.usedPercent,
      23,
    );
    const repo = store.put('repos', {
        id: id(),
        name: 'Test repository',
        path: root,
      }),
      p = engine.addProject(repo.id, 'Protocol test', 'Test adapter'),
      agent = engine.addAgent(account.id, p.id, 'developer'),
      task = engine.addTask(
        agent.id,
        'Exercise real provider code',
        'Execute host tools',
      );
    await engine.tick();
    for (
      let i = 0;
      i < 100 && store.get('tasks', task.id).status === 'running';
      i++
    )
      await delay();
    const finished = store.get('tasks', task.id);
    assert.equal(finished.status, 'completed');
    assert.equal(finished.activity?.[0].label, 'node --version');
    assert.match(finished.output!, /Protocol fixture/);
    assert.match(
      await readFile(join(finished.worktree!, 'protocol-evidence.txt'), 'utf8'),
      /wire-protocol test fixture/,
    );
    assert.ok(store.get('agents', agent.id).threadId);
    await engine.logout(account.id);
    assert.equal(store.get('accounts', account.id).status, 'signed-out');
  } finally {
    await engine.stop();
    store.close();
  }
});
test('native executable resolver rejects wrappers and finds installed Windows binary', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nexus-native-'));
  await writeFile(join(root, 'codex.exe'), 'fixture');
  assert.equal(resolveCodex({ PATH: root }, 'win32'), join(root, 'codex.exe'));
  assert.throws(
    () => resolveCodex({ NEXUS_CODEX_BIN: join(root, 'codex.cmd') }, 'win32'),
    /native/,
  );
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store, id } from '../src/db/store.ts';
import { Engine } from '../src/engine.ts';
import {
  executeMock,
  seedSimulation,
  waitForSimulation,
} from '../src/simulation.ts';
import { git } from '../src/integrations/git.ts';
import { Knowledge } from '../src/integrations/knowledge.ts';

function setup() {
  const store = new Store(':memory:');
  const engine = new Engine(store, join(tmpdir(), id()));
  const account = engine.addAccount({ name: 'Test', provider: 'mock' });
  const repo = store.put('repos', {
    id: id(),
    name: 'Fixture',
    path: tmpdir(),
  });
  const project = engine.addProject(repo.id, 'Test project', 'Test objective');
  const parent = engine.addAgent(
    account.id,
    project.id,
    'coordinator',
    undefined,
    'read-only',
  );
  return { store, engine, account, project, parent };
}
test('delegation preserves account, project, permission and lineage recursively', async () => {
  const { store, engine, account, project, parent } = setup();
  const child = engine.delegate(
    parent.id,
    'research',
    'Research',
    'Inspect code',
  );
  const grandchild = engine.delegate(
    child.agent.id,
    'review',
    'Review',
    'Review findings',
  );
  assert.equal(grandchild.agent.depth, 2);
  assert.equal(grandchild.agent.accountId, account.id);
  assert.equal(grandchild.agent.projectId, project.id);
  assert.equal(grandchild.agent.permissions, 'read-only');
  assert.equal(grandchild.agent.parentId, child.agent.id);
  assert.equal(grandchild.agent.kind, 'worker-delegation');
  const great = engine.delegate(grandchild.agent.id, 'helper', 'Help', 'Help');
  assert.throws(
    () => engine.delegate(great.agent.id, 'too-deep', 'Help', 'Help'),
    /depth/,
  );
  const other = engine.addAccount({ name: 'Other', provider: 'mock' });
  assert.throws(
    () => engine.addAgent(other.id, project.id, 'bad', parent.id),
    /cannot change/,
  );
  await engine.stop();
  store.close();
});
test('worker caps reject delegation atomically without orphaned tasks', async () => {
  const { store, engine, account, parent } = setup();
  store.put('accounts', { ...account, maxAgents: 1 });
  assert.throws(
    () => engine.delegate(parent.id, 'helper', 'Help', 'Help'),
    /limit/,
  );
  assert.equal(store.all('agents').length, 1);
  assert.equal(store.all('tasks').length, 0);
  await engine.stop();
  store.close();
});
test('messages persist, deduplicate, retry and require recipient acknowledgment', async () => {
  const { store, engine, parent } = setup();
  const child = engine.delegate(parent.id, 'helper', 'Help', 'Help').agent;
  const m = engine.bus.send(
    parent.id,
    child.id,
    'DISCOVERY',
    'contract',
    'same-key',
  );
  assert.equal(
    engine.bus.send(parent.id, child.id, 'DISCOVERY', 'retry', 'same-key').id,
    m.id,
  );
  await engine.bus.pump(async () => false, 100);
  assert.equal(store.get('deliveries', m.id).status, 'queued');
  await engine.bus.pump(async () => true, 2000);
  assert.equal(store.get('deliveries', m.id).status, 'delivered');
  assert.throws(() => engine.bus.ack(parent.id, m.id), /identity/);
  engine.bus.ack(child.id, m.id);
  assert.equal(store.get('deliveries', m.id).status, 'acknowledged');
  const timeout = engine.bus.send(
    parent.id,
    child.id,
    'HELP_REQUEST',
    'expired',
  );
  await engine.bus.pump(async () => false, Date.now() + 86400001);
  assert.equal(store.get('deliveries', timeout.id).status, 'expired');
  await engine.stop();
  store.close();
});
test('cross-project messaging and dependencies are denied', async () => {
  const { store, engine, account, parent } = setup();
  const repo = store.put('repos', { id: id(), name: 'Second', path: tmpdir() });
  const other = engine.addProject(
    repo.id,
    'Second project',
    'Separate objective',
  );
  const peer = engine.addAgent(account.id, other.id, 'peer');
  assert.throws(
    () => engine.bus.send(parent.id, peer.id, 'DISCOVERY', 'secret'),
    /Cross-project/,
  );
  const t = engine.addTask(peer.id, 'Other task', 'Other task');
  assert.throws(
    () => engine.addTask(parent.id, 'Task', 'Task', [t.id]),
    /Cross-project/,
  );
  await engine.stop();
  store.close();
});
test('planner rejects cycles, missing dependencies and mixed providers without partial state', async () => {
  const { store, engine, account, parent } = setup();
  const t = (key: string, dependencies: string[]) => ({
    key,
    dependencies,
    accountId: account.id,
    role: 'developer',
    title: key,
    prompt: key,
  });
  assert.throws(
    () => engine.plan(parent.id, { tasks: [t('a', ['b']), t('b', ['a'])] }),
    /cycle/,
  );
  assert.throws(
    () => engine.plan(parent.id, { tasks: [t('a', ['missing'])] }),
    /Unknown/,
  );
  const real = engine.addAccount({ name: 'Real', provider: 'codex' });
  assert.throws(
    () =>
      engine.plan(parent.id, {
        tasks: [{ ...t('a', []), accountId: real.id }],
      }),
    /mix/,
  );
  assert.equal(store.all('tasks').length, 0);
  const tasks = engine.plan(parent.id, {
    tasks: [t('second', ['first']), t('first', [])],
  });
  assert.equal(tasks.length, 2);
  assert.equal(tasks[1].dependencies[0], tasks[0].id);
  await engine.stop();
  store.close();
});
test('unknown tools and spoofed delegation fields cannot grant permissions', async () => {
  const { store, engine, parent } = setup();
  await assert.rejects(
    engine.tool(parent.id, 'nexus_delegate', {
      role: 'helper',
      title: 'Help',
      prompt: 'Help',
      permissions: 'workspace-write',
    }),
  );
  await assert.rejects(
    engine.tool(parent.id, 'grant_permissions', {}),
    /Unknown/,
  );
  await engine.stop();
  store.close();
});
test('restart preserves records and marks in-flight work interrupted', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nexus-restart-')),
    db = join(root, 'test.db');
  let store = new Store(db);
  let engine = new Engine(store, root);
  const a = engine.addAccount({ name: 'A', provider: 'mock' });
  const r = store.put('repos', { id: id(), name: 'R', path: root });
  const p = engine.addProject(r.id, 'P', 'Objective');
  const worker = engine.addAgent(a.id, p.id, 'worker');
  const task = engine.addTask(worker.id, 'T', 'Prompt');
  store.put('tasks', { ...task, status: 'running' });
  store.close();
  store = new Store(db);
  engine = new Engine(store, root);
  assert.equal(store.get('tasks', task.id).status, 'interrupted');
  assert.equal(store.get('projects', p.id).status, 'paused');
  engine.retry(task.id);
  assert.equal(store.get('tasks', task.id).status, 'pending');
  await engine.stop();
  store.close();
});
test('knowledge stores immutable project-scoped notes and rejects common credential formats', async () => {
  const root = await mkdtemp(join(tmpdir(), 'nexus-knowledge-')),
    k = new Knowledge(root),
    project = id();
  await k.add(project, 'API contract', 'GET /api/greeting returns a message.');
  assert.equal((await k.search(project, 'greeting')).length, 1);
  assert.equal((await k.search(id(), 'greeting')).length, 0);
  await assert.rejects(
    k.add(project, 'Secret', 'Bearer abcdefghijklmnop'),
    /credential/,
  );
  await assert.rejects(k.search('../../', ''), /Invalid/);
});
test(
  'mandatory three-account E2E: real worktrees, messages, autonomous child, review and integration',
  { timeout: 60000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'nexus-e2e-')),
      store = new Store(join(root, 'test.db')),
      engine = new Engine(store, root, { execute: executeMock });
    try {
      const { project, accounts, repo } = await seedSimulation(engine);
      const original = await git(repo.path, 'rev-parse', 'main');
      const tasks = await waitForSimulation(engine, project.id);
      assert.equal(accounts.length, 3);
      assert.equal(tasks.length, 5);
      assert.ok(tasks.every((t) => t.status === 'completed'));
      assert.equal(new Set(tasks.map((t) => t.worktree)).size, 5);
      const child = store.all('agents').find((a) => a.parentId)!;
      assert.equal(child.kind, 'worker-delegation');
      assert.equal(child.accountId, accounts[1].id);
      const types = store.all('messages').map((m) => m.type);
      for (const type of [
        'NEED_DEPENDENCY',
        'DECISION_RESOLVED',
        'DEPENDENCY_READY',
        'REVIEW_RESULT',
        'TASK_COMPLETED',
      ])
        assert.ok(types.includes(type));
      assert.ok(
        store.all('deliveries').every((d) => d.status === 'acknowledged'),
      );
      assert.equal(await git(repo.path, 'rev-parse', 'main'), original);
      const review = tasks.find(
        (t) => store.get('agents', t.agentId).role === 'reviewer',
      )!;
      assert.match(review.output!, /1 integration test passed/);
      assert.match(
        await readFile(join(review.worktree!, 'frontend.mjs'), 'utf8'),
        /renderGreeting/,
      );
    } finally {
      await engine.stop();
      store.close();
    }
  },
);
test(
  'two repositories execute concurrently with isolated task and message state',
  { timeout: 60000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'nexus-multi-')),
      store = new Store(join(root, 'test.db')),
      engine = new Engine(store, root, { execute: executeMock });
    try {
      const one = await seedSimulation(engine),
        two = await seedSimulation(engine);
      const results = await Promise.all([
        waitForSimulation(engine, one.project.id),
        waitForSimulation(engine, two.project.id),
      ]);
      assert.equal(results.flat().length, 10);
      assert.notEqual(one.repo.id, two.repo.id);
      for (const m of store.all('messages')) {
        assert.equal(store.get('agents', m.sender).projectId, m.projectId);
        assert.equal(store.get('agents', m.recipient).projectId, m.projectId);
        assert.equal(store.get('projects', m.projectId).repoId, m.repoId);
      }
    } finally {
      await engine.stop();
      store.close();
    }
  },
);

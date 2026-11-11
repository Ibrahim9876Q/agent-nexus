import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store, id } from '../src/db/store.ts';
import { Engine } from '../src/engine.ts';
const wait = () => new Promise((r) => setTimeout(r, 10));
test('scheduler enforces per-account/global limits and project pause', async () => {
  const store = new Store(':memory:');
  const releases: (() => void)[] = [];
  let active = 0,
    max = 0;
  const engine = new Engine(store, tmpdir(), {
    execute: async () => {
      active++;
      max = Math.max(active, max);
      await new Promise<void>((r) => releases.push(r));
      active--;
      return 'done';
    },
  });
  engine.git.worktree = async (_repo, taskId) => ({
    path: join(tmpdir(), taskId),
    branch: 'test/' + taskId,
  });
  const account = engine.addAccount({
    name: 'One slot',
    provider: 'mock',
    concurrency: 1,
  });
  const repo = store.put('repos', { id: id(), name: 'R', path: tmpdir() });
  const project = engine.addProject(repo.id, 'P', 'Objective');
  for (let i = 0; i < 3; i++) {
    const a = engine.addAgent(account.id, project.id, 'worker');
    engine.addTask(a.id, 'Task ' + i, 'Work');
  }
  await engine.pause(project.id, true);
  await engine.tick();
  assert.equal(
    store.all('tasks').filter((t) => t.status === 'running').length,
    0,
  );
  await engine.pause(project.id, false);
  await engine.tick();
  await wait();
  assert.equal(active, 1);
  assert.equal(
    store.all('tasks').filter((t) => t.status === 'pending').length,
    2,
  );
  releases.shift()!();
  await wait();
  await engine.tick();
  await wait();
  assert.equal(active, 1);
  assert.equal(max, 1);
  releases.shift()!();
  await wait();
  await engine.tick();
  await wait();
  releases.shift()!();
  await wait();
  assert.ok(store.all('tasks').every((t) => t.status === 'completed'));
  await engine.stop();
  store.close();
});
test('parent waits for its child result and automatically resumes to acknowledge it', async () => {
  const store = new Store(':memory:');
  const engine = new Engine(store, tmpdir(), {
    execute: async (task, agent, e) => {
      if (agent.parentId) return 'Child evidence';
      if (task.attempts === 1) {
        e.delegate(agent.id, 'helper', 'Help', 'Help');
        return 'Waiting for review';
      }
      for (const m of e.bus.inbox(agent.id)) e.bus.ack(agent.id, m.id);
      return 'Child result reviewed';
    },
  });
  engine.git.worktree = async (_repo, taskId) => ({
    path: join(tmpdir(), taskId),
    branch: 'test/' + taskId,
  });
  const account = engine.addAccount({ name: 'A', provider: 'mock' });
  const repo = store.put('repos', { id: id(), name: 'R', path: tmpdir() });
  const project = engine.addProject(repo.id, 'P', 'Objective');
  const a = engine.addAgent(account.id, project.id, 'parent');
  const task = engine.addTask(a.id, 'Parent task', 'Delegate help');
  await engine.tick();
  await wait();
  assert.equal(store.get('tasks', task.id).status, 'blocked');
  for (
    let i = 0;
    i < 10 && store.get('tasks', task.id).status !== 'completed';
    i++
  ) {
    await engine.tick();
    await wait();
  }
  assert.equal(store.get('tasks', task.id).status, 'completed');
  assert.equal(store.get('tasks', task.id).attempts, 2);
  assert.equal(store.all('deliveries')[0].status, 'acknowledged');
  await engine.stop();
  store.close();
});

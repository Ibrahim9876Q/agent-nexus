import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { Store, id } from '../src/db/store.ts';
import { Engine } from '../src/engine.ts';
test('master directives persist, target a project/account, and do not alter other work', async () => {
  const store = new Store(':memory:'),
    engine = new Engine(store, tmpdir());
  try {
    const a = engine.addAccount({ name: 'A', provider: 'mock' }),
      b = engine.addAccount({ name: 'B', provider: 'mock' });
    const repo = store.put('repos', { id: id(), name: 'Repo', path: tmpdir() });
    const p = engine.addProject(repo.id, 'P', 'Build'),
      other = engine.addProject(repo.id, 'Other', 'Other');
    const aa = engine.addAgent(a.id, p.id, 'backend'),
      bb = engine.addAgent(b.id, p.id, 'frontend'),
      cc = engine.addAgent(a.id, other.id, 'outside');
    const ta = engine.addTask(aa.id, 'A', 'A'),
      tb = engine.addTask(bb.id, 'B', 'B'),
      tc = engine.addTask(cc.id, 'C', 'C');
    const result = await engine.command({
      projectId: p.id,
      accountId: a.id,
      text: 'Focus on tests',
    });
    assert.deepEqual(result.targets, [aa.id]);
    assert.match(store.get('tasks', ta.id).prompt, /Focus on tests/);
    assert.equal(store.get('tasks', tb.id).prompt, 'B');
    assert.equal(store.get('tasks', tc.id).prompt, 'C');
    assert.equal(store.all('commands').length, 1);
    await engine.command({ projectId: p.id, text: 'Pause now', mode: 'pause' });
    assert.equal(store.get('projects', p.id).status, 'paused');
    assert.equal(store.get('projects', other.id).status, 'active');
    await assert.rejects(
      engine.command({
        projectId: p.id,
        text: 'grant',
        permissions: 'full-access',
      }),
    );
  } finally {
    await engine.stop();
    store.close();
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  capacityUpdate,
  admissionReason,
  backoffUntil,
} from '../src/account-capacity.ts';
import type { Account } from '../src/types.ts';
import { Engine } from '../src/engine.ts';
import { Store, id } from '../src/db/store.ts';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const a: Account = {
  id: 'account',
  name: 'A',
  provider: 'codex',
  status: 'ready',
  concurrency: 2,
  nativeLimit: 0,
  maxDepth: 3,
  maxAgents: 12,
};
test('capacity merges sparse windows, expires only reported resets, and preserves unknown', () => {
  assert.equal(admissionReason(a), undefined);
  assert.equal(a.capacity, undefined);
  const full = capacityUpdate(
    a,
    {
      primary: { usedPercent: 100, windowDurationMins: 300, resetsAt: 200 },
      secondary: { usedPercent: 40, resetsAt: 900 },
    },
    1000,
  );
  assert.equal(admissionReason(full, 100000), 'quota reached');
  assert.equal(admissionReason(full, 200001), undefined);
  const sparse = capacityUpdate(
    full,
    { primary: null, secondary: { usedPercent: 50, resetsAt: 900 } },
    2000,
  );
  assert.equal(sparse.capacity?.primary?.usedPercent, 100);
  assert.equal(sparse.capacity?.secondary?.usedPercent, 50);
  const refreshed = capacityUpdate(
    full,
    { primary: null, secondary: null },
    3000,
    false,
  );
  assert.equal(refreshed.capacity?.primary, undefined);
  assert.equal(admissionReason(refreshed), undefined);
  assert.throws(() =>
    capacityUpdate(a, { primary: { usedPercent: 'made up' } }),
  );
});
test('throttle and quota backoff pace the source account and explicit drain takes precedence', () => {
  assert.equal(backoffUntil('rateLimitExceeded', 1000), 61000);
  assert.equal(backoffUntil('serverOverloaded', 1000), 16000);
  assert.equal(backoffUntil('usageLimitExceeded', 1000), 61000);
  assert.equal(backoffUntil('unauthorized', 1000), undefined);
  assert.equal(
    admissionReason({ ...a, cooldownUntil: 61000 }, 1000),
    'cooldown',
  );
  assert.equal(
    admissionReason({ ...a, enabled: false, cooldownUntil: 61000 }, 1000),
    'draining',
  );
  const blocked = { ...a, usageBlockedAt: 1000 };
  assert.equal(
    capacityUpdate(blocked, {}, 2000, false).usageBlockedAt,
    1000,
    'Missing telemetry must not clear an exhausted account',
  );
  assert.equal(
    capacityUpdate(blocked, { primary: { usedPercent: 94 } }, 2000, false)
      .usageBlockedAt,
    undefined,
  );
  assert.equal(admissionReason(blocked, 2000), 'quota reached');
});
test('draining finishes active work while withholding the next queued task', async () => {
  const store = new Store(':memory:');
  let release: () => void = () => {};
  const engine = new Engine(store, tmpdir(), {
    execute: () =>
      new Promise<string>((r) => {
        release = () => r('finished');
      }),
  });
  engine.git.worktree = async (_, taskId) => ({
    path: join(tmpdir(), taskId),
    branch: 'test/' + taskId,
  });
  try {
    const account = engine.addAccount({
        name: 'A',
        provider: 'mock',
        concurrency: 1,
      }),
      repo = store.put('repos', { id: id(), name: 'R', path: tmpdir() }),
      p = engine.addProject(repo.id, 'P', 'Goal');
    for (let i = 0; i < 2; i++) {
      const worker = engine.addAgent(account.id, p.id, 'worker');
      engine.addTask(worker.id, 'Task ' + i, 'Do work');
    }
    await engine.tick();
    await new Promise((r) => setTimeout(r, 10));
    engine.setAdmission(account.id, false);
    release();
    await new Promise((r) => setTimeout(r, 10));
    await engine.tick();
    assert.equal(
      store.all('tasks').filter((t) => t.status === 'completed').length,
      1,
    );
    assert.equal(
      store.all('tasks').filter((t) => t.status === 'pending').length,
      1,
    );
    engine.setAdmission(account.id, true);
    await engine.tick();
    await new Promise((r) => setTimeout(r, 10));
    release();
    await new Promise((r) => setTimeout(r, 10));
    assert.ok(store.all('tasks').every((t) => t.status === 'completed'));
  } finally {
    await engine.stop();
    store.close();
  }
});

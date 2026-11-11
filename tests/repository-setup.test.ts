import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { GitService, git } from '../src/integrations/git.ts';
import { Store, id } from '../src/db/store.ts';
import { Engine } from '../src/engine.ts';

// Each test file runs in its own process. Do not depend on or change the
// developer's global Git identity/configuration.
const root = await mkdtemp(join(tmpdir(), 'nexus-folder-setup-'));
process.env.GIT_CONFIG_GLOBAL = join(root, 'absent-global-config');
process.env.GIT_CONFIG_NOSYSTEM = '1';

test('adding a new Desktop folder initializes it once and allows worktrees without Git identity setup', async () => {
  const folder = join(root, 'Desktop', 'New project');
  await mkdir(folder, { recursive: true });
  const store = new Store(':memory:');
  const engine = new Engine(store, join(root, 'runtime'));
  try {
    const [first, second] = await Promise.all([
      engine.addRepo(folder, 'New project'),
      engine.addRepo(folder, 'New project'),
    ]);
    assert.equal(first.id, second.id);
    assert.equal(store.all('repos').length, 1);
    assert.equal(await git(folder, 'rev-list', '--count', 'HEAD'), '1');
    assert.equal(await git(folder, 'branch', '--show-current'), 'main');
    assert.equal(
      await git(folder, 'log', '-1', '--format=%an <%ae>'),
      'Agent Nexus <agent-nexus@localhost>',
    );
    assert.equal(await git(folder, 'status', '--porcelain'), '');
    const worktree = await engine.git.worktree(folder, id());
    assert.equal(
      await git(worktree.path, 'rev-parse', 'HEAD'),
      await git(folder, 'rev-parse', 'HEAD'),
    );
    await assert.rejects(stat(process.env.GIT_CONFIG_GLOBAL!), {
      code: 'ENOENT',
    });
  } finally {
    await engine.stop();
    store.close();
  }
});

test('opening an existing repository preserves history, staged changes, untracked files and configuration', async () => {
  const folder = join(root, 'existing');
  await mkdir(folder);
  const service = new GitService(join(root, 'worktrees'));
  await service.prepare(folder);
  await writeFile(join(folder, 'tracked.txt'), 'original');
  await service.commit(folder, 'Existing work');
  await writeFile(join(folder, 'tracked.txt'), 'uncommitted changes');
  await writeFile(join(folder, 'staged.txt'), 'staged changes');
  await git(folder, 'add', 'staged.txt');
  await writeFile(join(folder, 'untracked.txt'), 'untracked data');
  const snapshot = async () => ({
    head: await git(folder, 'rev-parse', 'HEAD'),
    status: await git(folder, 'status', '--porcelain'),
    staged: await git(folder, 'diff', '--cached'),
    config: await readFile(join(folder, '.git', 'config'), 'utf8'),
  });
  const before = await snapshot();
  assert.equal(await service.prepare(folder), resolve(folder));
  assert.deepEqual(await snapshot(), before);
  assert.equal(
    await readFile(join(folder, 'tracked.txt'), 'utf8'),
    'uncommitted changes',
  );
  assert.equal(
    await readFile(join(folder, 'untracked.txt'), 'utf8'),
    'untracked data',
  );
});

test('empty repositories with no commits keep their chosen branch and configured identity', async () => {
  const folder = join(root, 'unborn');
  await mkdir(folder);
  await git(folder, 'init', '-b', 'my-branch');
  await git(folder, 'config', '--local', 'user.name', 'Project Author');
  await git(folder, 'config', '--local', 'user.email', 'author@example.test');
  const service = new GitService(join(root, 'worktrees'));
  await service.prepare(folder);
  assert.equal(await git(folder, 'branch', '--show-current'), 'my-branch');
  assert.equal(
    await git(folder, 'log', '-1', '--format=%an <%ae>'),
    'Project Author <author@example.test>',
  );
});

test('subfolders, populated non-repositories and missing paths are rejected without initializing them', async () => {
  const service = new GitService(join(root, 'worktrees'));
  const parent = join(root, 'parent-repository');
  await mkdir(parent);
  await service.prepare(parent);
  const nested = join(parent, 'subfolder');
  await mkdir(nested);
  await assert.rejects(service.prepare(nested), /repository root/);
  await assert.rejects(stat(join(nested, '.git')), { code: 'ENOENT' });
  const populated = join(root, 'not-a-repo');
  await mkdir(populated);
  await writeFile(join(populated, 'keep.txt'), 'keep this file');
  await assert.rejects(service.prepare(populated), /contains files/);
  await assert.rejects(stat(join(populated, '.git')), { code: 'ENOENT' });
  assert.equal(
    await readFile(join(populated, 'keep.txt'), 'utf8'),
    'keep this file',
  );
  const missing = join(root, 'missing');
  await assert.rejects(service.prepare(missing), { code: 'ENOENT' });
  await assert.rejects(stat(missing), { code: 'ENOENT' });
  await git(populated, 'init', '-b', 'main');
  await git(populated, 'add', 'keep.txt');
  const staged = await git(populated, 'ls-files', '--stage');
  await assert.rejects(service.prepare(populated), /no commits/);
  assert.equal(await git(populated, 'ls-files', '--stage'), staged);
});

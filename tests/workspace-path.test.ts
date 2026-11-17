import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { workspacePath } = createRequire(import.meta.url)(
  '../desktop/workspace-path.cjs',
);
const dbIn = (directory: string) => {
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'nexus.db'), '');
  return directory;
};

test('a legacy source workspace follows the user across restarts, checkouts and the portable app', () => {
  const folder = mkdtempSync(join(tmpdir(), 'nexus-data-'));
  const userData = join(folder, 'profile');
  const root = join(folder, 'original');
  const replacement = join(folder, 'another-checkout');
  const legacy = dbIn(join(root, '.nexus', 'live'));
  const options = { userData, root, packaged: false, env: {} };
  assert.equal(workspacePath(options), legacy);
  assert.equal(workspacePath({ ...options, root: replacement }), legacy);
  assert.equal(
    workspacePath({ ...options, root: replacement, packaged: true }),
    legacy,
  );
  assert.equal(
    workspacePath({
      ...options,
      env: { NEXUS_MOCK_INSTALLATION: '1', NEXUS_DATA_DIR: legacy },
    }),
    join(root, '.nexus', 'mock-installation'),
  );
  assert.equal(
    workspacePath({ ...options, env: { NEXUS_DATA_DIR: replacement } }),
    replacement,
  );

  const moved = join(root, 'moved');
  renameSync(legacy, moved);
  assert.throws(() => workspacePath(options), /Saved workspace not found/);
  assert.equal(
    workspacePath({ ...options, env: { NEXUS_DATA_DIR: moved } }),
    moved,
  );
});

test('fresh launchers share one app-data default and local portable builds can discover the checkout', () => {
  const folder = mkdtempSync(join(tmpdir(), 'nexus-data-'));
  const root = join(folder, 'checkout');
  const userData = join(folder, 'profile');
  const options = { userData, root, packaged: false, env: {} };
  const shared = dbIn(join(userData, 'workspace-live'));
  assert.equal(workspacePath(options), shared);
  assert.equal(workspacePath({ ...options, packaged: true }), shared);

  const legacy = dbIn(join(root, '.nexus', 'live'));
  assert.equal(
    workspacePath({
      ...options,
      root: folder,
      packaged: true,
      env: { PORTABLE_EXECUTABLE_DIR: join(root, 'release-desktop') },
    }),
    legacy,
  );
});

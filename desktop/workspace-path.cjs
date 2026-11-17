const {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} = require('node:fs');
const { isAbsolute, join, resolve } = require('node:path');

function workspacePath({ userData, root, packaged, env = process.env }) {
  if (env.NEXUS_MOCK_INSTALLATION === '1')
    return packaged
      ? join(userData, 'workspace-mock')
      : join(root, '.nexus', 'mock-installation');
  if (env.NEXUS_DATA_DIR) return resolve(env.NEXUS_DATA_DIR);

  const shared = join(userData, 'workspace-live');
  const locator = join(userData, 'live-workspace.json');
  const hasWorkspace = (directory) => existsSync(join(directory, 'nexus.db'));
  let raw;
  try {
    raw = readFileSync(locator, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (raw !== undefined) {
    const { directory } = JSON.parse(raw);
    if (typeof directory !== 'string' || !isAbsolute(directory))
      throw new Error('The saved live workspace location is invalid.');
    if (!hasWorkspace(directory))
      throw new Error(
        `Saved workspace not found at ${directory}. Restore the folder or set NEXUS_DATA_DIR to its current location.`,
      );
    return directory;
  }

  const candidates =
    packaged && env.PORTABLE_EXECUTABLE_DIR
      ? [
          env.PORTABLE_EXECUTABLE_DIR,
          resolve(env.PORTABLE_EXECUTABLE_DIR, '..'),
        ]
      : packaged
        ? []
        : [root];
  const legacy = candidates
    .map((directory) => join(directory, '.nexus', 'live'))
    .find(hasWorkspace);
  if (!legacy) return shared;
  // Keep the original directory so persisted worktree and attachment paths remain valid.
  // The desktop single-instance lock covers this write.
  mkdirSync(userData, { recursive: true });
  writeFileSync(locator, JSON.stringify({ directory: legacy }), { flag: 'wx' });
  return legacy;
}

module.exports = { workspacePath };

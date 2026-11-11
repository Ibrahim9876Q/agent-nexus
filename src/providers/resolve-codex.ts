import { existsSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';

export function resolveCodex(
  env: NodeJS.ProcessEnv = process.env,
  platform = process.platform,
): string {
  if (env.NEXUS_CODEX_BIN) {
    if (
      platform === 'win32' &&
      extname(env.NEXUS_CODEX_BIN).toLowerCase() !== '.exe'
    )
      throw new Error(
        'NEXUS_CODEX_BIN must point to native codex.exe, not a PowerShell or CMD wrapper.',
      );
    if (!existsSync(env.NEXUS_CODEX_BIN))
      throw new Error(
        'Configured Codex executable does not exist. Check NEXUS_CODEX_BIN.',
      );
    return env.NEXUS_CODEX_BIN;
  }
  if (platform !== 'win32') return 'codex';
  for (const folder of (env.PATH || env.Path || '')
    .split(';')
    .filter(Boolean)) {
    const path = join(folder.replace(/^"|"$/g, ''), 'codex.exe');
    if (existsSync(path)) return path;
  }
  const appBin = join(env.LOCALAPPDATA || '', 'OpenAI', 'Codex', 'bin');
  if (existsSync(appBin))
    for (const version of readdirSync(appBin).reverse()) {
      const path = join(appBin, version, 'codex.exe');
      if (existsSync(path)) return path;
    }
  const npmRoot = join(env.APPDATA || '', 'npm', 'node_modules', '@openai');
  function search(folder: string, depth: number): string | undefined {
    if (!depth || !existsSync(folder)) return;
    for (const e of readdirSync(folder, { withFileTypes: true })) {
      if (e.isSymbolicLink()) continue;
      const path = join(folder, e.name);
      if (e.isFile() && e.name === 'codex.exe') return path;
      if (e.isDirectory()) {
        const found = search(path, depth - 1);
        if (found) return found;
      }
    }
  }
  const found = search(npmRoot, 9);
  if (found) return found;
  throw new Error(
    'Native Codex was not found. Install the official Codex CLI, or set NEXUS_CODEX_BIN to codex.exe.',
  );
}

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..'),
  out = path.join(root, '.nexus', 'desktop-runtime');
fs.mkdirSync(out, { recursive: true });
for (const folder of ['src', 'dist'])
  fs.cpSync(path.join(root, folder), path.join(out, folder), {
    recursive: true,
  });
const p = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
fs.writeFileSync(
  path.join(out, 'package.json'),
  JSON.stringify(
    {
      name: 'nexus-runtime',
      version: '0.2.0',
      type: 'module',
      dependencies: {
        express: p.dependencies.express,
        ws: p.dependencies.ws,
        zod: p.dependencies.zod,
        tsx: p.devDependencies.tsx,
      },
    },
    null,
    2,
  ),
);
// Invoke npm's JS entry directly; no interpolated shell command.
execFileSync(
  process.execPath,
  [
    process.env.npm_execpath,
    'install',
    '--omit=dev',
    '--no-audit',
    '--no-fund',
  ],
  { cwd: out, stdio: 'inherit', windowsHide: true },
);

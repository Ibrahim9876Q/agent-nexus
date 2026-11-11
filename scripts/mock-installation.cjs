// Explicit, isolated simulation launch. Never changes the live installation.
const { spawn } = require('node:child_process');
const electron = require('electron');
const path = require('node:path');
const child = spawn(electron, [path.resolve(__dirname, '..')], {
  env: { ...process.env, NEXUS_MOCK_INSTALLATION: '1' },
  stdio: 'inherit',
  windowsHide: true,
});
child.on('exit', (code) => process.exit(code || 0));
child.on('error', (error) => {
  console.error(error.message);
  process.exit(1);
});

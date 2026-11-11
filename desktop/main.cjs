const { app, BrowserWindow, shell, dialog } = require('electron');
const { fork } = require('node:child_process');
const path = require('node:path');
let worker,
  window,
  quitting = false;
app.setName('Agent Nexus');
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    window?.show();
    window?.focus();
  });
  app.whenReady().then(() => {
    const root = app.isPackaged
      ? path.join(process.resourcesPath, 'app-runtime')
      : path.resolve(__dirname, '..');
    worker = fork(path.join(root, 'src/server.ts'), [], {
      execPath: 'node',
      execArgv: ['--import', 'tsx'],
      cwd: root,
      env: {
        ...process.env,
        NEXUS_PORT: '0',
        NEXUS_DATA_DIR: app.isPackaged
          ? path.join(app.getPath('userData'), 'workspace')
          : path.join(root, '.nexus'),
      },
      silent: true,
    });
    worker.on('error', (e) =>
      dialog.showErrorBox(
        'Nexus could not start',
        e.message + '\nInstall Node.js 24 or newer.',
      ),
    );
    worker.stderr.on('data', () => {});
    worker.stdout.on('data', () => {});
    const startup = setTimeout(() => {
      dialog.showErrorBox(
        'Nexus startup timed out',
        'Check Node.js 24 is installed and available on PATH.',
      );
      app.quit();
    }, 30000);
    worker.on('message', (msg) => {
      if (msg.type !== 'ready') return;
      clearTimeout(startup);
      const origin = `http://127.0.0.1:${msg.port}`;
      window = new BrowserWindow({
        width: 1480,
        height: 960,
        minWidth: 900,
        minHeight: 640,
        backgroundColor: '#1e1e1e',
        title: 'Agent Nexus',
        autoHideMenuBar: true,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });
      const external = (url) => {
        try {
          const u = new URL(url);
          if (
            u.protocol === 'https:' &&
            [
              'auth.openai.com',
              'auth0.openai.com',
              'chatgpt.com',
              'github.com',
            ].includes(u.hostname)
          )
            void shell.openExternal(url);
        } catch {}
      };
      window.webContents.setWindowOpenHandler(({ url }) => {
        external(url);
        return { action: 'deny' };
      });
      window.webContents.on('will-navigate', (e, url) => {
        if (!url.startsWith(origin + '/')) {
          e.preventDefault();
          external(url);
        }
      });
      window.webContents.session.on('will-download', (e) => e.preventDefault());
      window.loadURL(origin);
      window.on('closed', () => app.quit());
    });
    worker.on('exit', (code) => {
      if (!quitting) {
        clearTimeout(startup);
        dialog.showErrorBox(
          'Nexus backend stopped',
          `The local server exited (${code}). Restart Nexus to recover interrupted work.`,
        );
        app.quit();
      }
    });
  });
  app.on('before-quit', () => {
    quitting = true;
    worker?.kill();
  });
  app.on('window-all-closed', () => app.quit());
}

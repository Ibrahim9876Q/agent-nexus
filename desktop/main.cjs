const { app, BrowserWindow, shell, dialog, ipcMain } = require('electron');
const { fork } = require('node:child_process');
const path = require('node:path');
let worker,
  window,
  quitting = false;
app.setName('Agent Nexus');
if (process.env.NEXUS_MOCK_INSTALLATION === '1')
  app.setPath(
    'userData',
    path.join(app.getPath('userData'), 'mock-installation-shell'),
  );
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => {
    window?.show();
    window?.focus();
  });
  app.whenReady().then(() => {
    const mock = process.env.NEXUS_MOCK_INSTALLATION === '1';
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
          ? path.join(
              app.getPath('userData'),
              mock ? 'workspace-mock' : 'workspace-live',
            )
          : path.join(root, '.nexus', mock ? 'mock-installation' : 'live'),
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
        backgroundColor: '#070d16',
        ...(process.platform === 'win32'
          ? {
              titleBarStyle: 'hidden',
              titleBarOverlay: {
                color: '#070d16',
                symbolColor: '#c1ddf3',
                height: 52,
              },
            }
          : {}),
        title: 'Agent Nexus',
        autoHideMenuBar: true,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          preload: path.join(__dirname, 'preload.cjs'),
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
      ipcMain.handle('nexus:choose-repository', async (event) => {
        if (
          event.sender !== window.webContents ||
          event.sender.getURL().split('/').slice(0, 3).join('/') !== origin
        )
          throw new Error('Untrusted window');
        const result = await dialog.showOpenDialog(window, {
          properties: ['openDirectory'],
          title: 'Open a Git repository',
        });
        return result.canceled ? null : result.filePaths[0];
      });
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
    if (worker?.connected) worker.send({ type: 'shutdown' });
    else worker?.kill();
  });
  process.on('SIGTERM', () => app.quit());
  app.on('window-all-closed', () => app.quit());
}

const { app, BrowserWindow, shell, dialog, ipcMain } = require('electron');
const { fork } = require('node:child_process');
const path = require('node:path');
const { externalLink, trustedPage, viewUrl } = require('./navigation.cjs');
const { workspacePath } = require('./workspace-path.cjs');
const windows = new Set();
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
    const existing = window || windows.values().next().value;
    existing?.show();
    existing?.focus();
  });
  app.whenReady().then(() => {
    const root = app.isPackaged
      ? path.join(process.resourcesPath, 'app-runtime')
      : path.resolve(__dirname, '..');
    let dataDir;
    try {
      dataDir = workspacePath({
        userData: app.getPath('userData'),
        root,
        packaged: app.isPackaged,
      });
    } catch (error) {
      dialog.showErrorBox('Could not open the Nexus workspace', error.message);
      app.quit();
      return;
    }
    worker = fork(path.join(root, 'src/server.ts'), [], {
      execPath: 'node',
      execArgv: ['--import', 'tsx'],
      cwd: root,
      env: {
        ...process.env,
        NEXUS_PORT: '0',
        NEXUS_DATA_DIR: dataDir,
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
      const popouts = new Map();
      const createWindow = (url, view) => {
        const pane = new BrowserWindow({
          width: view ? 720 : 1480,
          height: view ? 780 : 960,
          minWidth: 360,
          minHeight: 380,
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
          title: view ? `Agent Nexus · ${view}` : 'Agent Nexus',
          autoHideMenuBar: true,
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            preload: path.join(__dirname, 'preload.cjs'),
          },
        });
        windows.add(pane);
        pane.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
        pane.webContents.on('will-frame-navigate', (event) => {
          if (!event.isMainFrame || !trustedPage(event.url, origin))
            event.preventDefault();
        });
        pane.webContents.on('will-redirect', (event) => {
          if (!event.isMainFrame || !trustedPage(event.url, origin))
            event.preventDefault();
        });
        pane.on('closed', () => {
          windows.delete(pane);
          if (window === pane) window = undefined;
          if (view) popouts.delete(url);
        });
        void pane.loadURL(url).catch((error) => {
          if (!pane.isDestroyed())
            dialog.showErrorBox('Could not open Nexus', error.message);
        });
        return pane;
      };
      const owner = (event) => {
        const pane = BrowserWindow.fromWebContents(event.sender);
        if (
          !pane ||
          !windows.has(pane) ||
          !event.senderFrame ||
          event.senderFrame !== event.sender.mainFrame ||
          !trustedPage(event.senderFrame.url, origin)
        )
          throw new Error('Untrusted window');
        return pane;
      };
      ipcMain.handle('nexus:choose-repository', async (event) => {
        const result = await dialog.showOpenDialog(owner(event), {
          properties: ['openDirectory'],
          title: 'Choose a project folder',
        });
        return result.canceled ? null : result.filePaths[0];
      });
      ipcMain.handle('nexus:open-link', async (event, value) => {
        owner(event);
        const url = externalLink(value, origin);
        if (!url)
          throw new Error('Only external HTTP and HTTPS links can be opened.');
        await shell.openExternal(url);
      });
      ipcMain.handle('nexus:open-view', (event, selection) => {
        owner(event);
        const url = viewUrl(origin, selection);
        const prior = popouts.get(url);
        if (prior) {
          prior.show();
          prior.focus();
        } else popouts.set(url, createWindow(url, selection.view));
      });
      window = createWindow(origin);
      window.webContents.session.on('will-download', (e) => e.preventDefault());
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

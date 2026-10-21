const { app, dialog, BrowserWindow, Notification, Tray, Menu, shell, clipboard, nativeImage, utilityProcess } = require('electron');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');

// CoursePlex Media Server: a headless tray app. The Next.js server is bound to
// 0.0.0.0 so any browser on the local network can open the web UI.

const SERVER_PORT = Number(process.env.PORT) || 32433;

let tray = null;
let serverProcess = null;
let serverStatus = 'starting'; // starting | running | error

// Helper to display dialogs on top in Windows even when CoursePlex has no open windows.
async function showForegroundMessageBox(options) {
  let dummy = null;
  try {
    dummy = new BrowserWindow({
      width: 1,
      height: 1,
      show: false,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
    });
    dummy.setVisibleOnAllWorkspaces(true);
    return await dialog.showMessageBox(dummy, options);
  } catch (_) {
    return await dialog.showMessageBox(options);
  } finally {
    if (dummy && !dummy.isDestroyed()) {
      dummy.destroy();
    }
  }
}

function showNotification(title, body) {
  try {
    if (Notification.isSupported()) {
      new Notification({ title, body, icon: path.join(__dirname, 'tray.png') }).show();
    }
  } catch (_) {}
}

function getStandaloneDir() {
  if (!app.isPackaged) {
    const devStandalone = path.join(__dirname, '..', 'standalone');
    if (fs.existsSync(devStandalone)) return devStandalone;
    return path.join(__dirname, '..', '.next', 'standalone');
  }
  const candidates = [
    path.join(process.resourcesPath, 'app', 'standalone'),
    path.join(process.resourcesPath, 'app.asar.unpacked', 'standalone'),
    path.join(process.resourcesPath, 'app', '.next', 'standalone'),
    path.join(app.getAppPath(), 'standalone'),
  ];
  return candidates.find((p) => fs.existsSync(p)) || path.join(app.getAppPath(), '.next', 'standalone');
}

function getLanUrls() {
  const urls = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) urls.push(`http://${ni.address}:${SERVER_PORT}`);
    }
  }
  return urls;
}

function waitForServer(timeout = 30000, getExit = () => null) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const exit = getExit();
      if (exit) return reject(new Error(`Server exited during startup (code ${exit.code}).\n${exit.logs}`));
      const req = http.get(`http://127.0.0.1:${SERVER_PORT}/api/local/info`, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - start > timeout) reject(new Error('Timed out waiting for the server to start.'));
        else setTimeout(attempt, 350);
      });
      req.setTimeout(1000, () => req.destroy());
    };
    attempt();
  });
}

async function startServer() {
  const standaloneDir = getStandaloneDir();
  const serverPath = path.join(standaloneDir, 'server.js');
  if (!fs.existsSync(serverPath)) throw new Error(`Server bundle not found at ${serverPath}`);

  const logs = [];
  let exited = null;
  const onOut = (d) => {
    logs.push(d.toString());
    if (logs.length > 60) logs.shift();
  };
  const env = {
    ...process.env,
    COURSEPLEX_USER_DATA: app.getPath('userData'),
    PORT: String(SERVER_PORT),
    HOSTNAME: '0.0.0.0',
    NODE_ENV: 'production',
  };

  try {
    serverProcess = utilityProcess.fork(serverPath, [], { cwd: standaloneDir, env, stdio: 'pipe' });
  } catch {
    serverProcess = spawn(process.execPath, [serverPath], {
      cwd: standaloneDir,
      env: { ...env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }
  serverProcess.stdout?.on('data', onOut);
  serverProcess.stderr?.on('data', onOut);
  serverProcess.on('exit', (code) => {
    exited = { code, logs: logs.join('') };
    serverProcess = null;
    if (serverStatus === 'running') {
      serverStatus = 'error';
      refreshTray();
    }
  });

  await waitForServer(30000, () => exited);
}

function openWeb() {
  shell.openExternal(`http://localhost:${SERVER_PORT}`);
}

async function pickFolder() {
  const result = await dialog.showOpenDialog({
    title: 'Select Courses Folder',
    properties: ['openDirectory'],
  });
  if (result.canceled || !result.filePaths[0]) return;
  try {
    const res = await fetch(`http://127.0.0.1:${SERVER_PORT}/api/local/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coursesDir: result.filePaths[0] }),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Failed to set folder');
    openWeb();
  } catch (err) {
    dialog.showErrorBox('CoursePlex', err.message || String(err));
  }
}

function refreshTray() {
  if (!tray) return;
  const lan = getLanUrls();
  const statusLabel =
    serverStatus === 'running'
      ? 'CoursePlex Server: Running'
      : serverStatus === 'starting'
        ? 'CoursePlex Server: Starting...'
        : 'CoursePlex Server: Stopped (error)';

  const template = [
    { label: statusLabel, enabled: false },
    ...lan.map((url) => ({
      label: `Network: ${url}`,
      click: () => clipboard.writeText(url),
    })),
    { type: 'separator' },
    { label: 'Open CoursePlex', enabled: serverStatus === 'running', click: openWeb },
    {
      label: 'Copy Network URL',
      enabled: lan.length > 0,
      click: () => clipboard.writeText(lan[0]),
    },
    { label: 'Select Courses Folder...', enabled: serverStatus === 'running', click: pickFolder },
    { type: 'separator' },
    {
      label: 'Launch at Login',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
    },
    {
      label: 'Check for Updates...',
      click: async () => {
        showNotification('CoursePlex', 'Checking for updates...');
        if (!app.isPackaged) {
          showForegroundMessageBox({
            type: 'info',
            title: 'CoursePlex',
            message: 'Auto-updates are only active in the packaged app.',
            buttons: ['Check GitHub Releases', 'Dismiss'],
            defaultId: 0,
            cancelId: 1,
          }).then(({ response }) => {
            if (response === 0) {
              shell.openExternal('https://github.com/Dudeque/courseplex/releases/latest');
            }
          });
          return;
        }

        try {
          isCheckingForUpdate = true;
          const { autoUpdater } = require('electron-updater');
          await autoUpdater.checkForUpdates();
        } catch (err) {
          isCheckingForUpdate = false;
          showForegroundMessageBox({
            type: 'error',
            title: 'Update Check Failed',
            message: 'Unable to check for updates.',
            detail: err?.message || String(err),
            buttons: ['Open Releases Page', 'Dismiss'],
            defaultId: 0,
            cancelId: 1,
          }).then(({ response }) => {
            if (response === 0) {
              shell.openExternal('https://github.com/Dudeque/courseplex/releases/latest');
            }
          });
        }
      },
    },
    { type: 'separator' },
    { label: `Quit CoursePlex Server (v${app.getVersion()})`, role: 'quit' },
  ];
  tray.setContextMenu(Menu.buildFromTemplate(template));
  tray.setToolTip(statusLabel);
}

let isCheckingForUpdate = false;

function setupAutoUpdater() {
  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    console.log('Checking for updates...');
  });

  autoUpdater.on('update-available', (info) => {
    showNotification('CoursePlex Update Available', `Downloading version ${info.version}...`);
  });

  autoUpdater.on('update-not-available', (info) => {
    if (isCheckingForUpdate) {
      isCheckingForUpdate = false;
      showForegroundMessageBox({
        type: 'info',
        title: 'CoursePlex',
        message: `You are on the latest version (v${app.getVersion()}).`,
        buttons: ['OK'],
      });
    }
  });

  autoUpdater.on('error', (err) => {
    console.warn('Auto-updater:', err ? err.message : err);
    if (isCheckingForUpdate) {
      isCheckingForUpdate = false;
      showForegroundMessageBox({
        type: 'error',
        title: 'Update Check Failed',
        message: 'Could not check for updates.',
        detail: err?.message || String(err),
        buttons: ['Open Releases Page', 'Dismiss'],
        defaultId: 0,
        cancelId: 1,
      }).then(({ response }) => {
        if (response === 0) {
          shell.openExternal('https://github.com/Dudeque/courseplex/releases/latest');
        }
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    isCheckingForUpdate = false;
    showForegroundMessageBox({
      type: 'info',
      title: 'Update Ready',
      message: `CoursePlex v${info.version} has been downloaded.`,
      detail: 'Restart now to install the update?',
      buttons: ['Restart and Install', 'Later'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });

  setTimeout(() => autoUpdater.checkForUpdatesAndNotify().catch(() => {}), 4000);
}

function stopServer() {
  if (serverProcess) {
    try {
      serverProcess.kill();
    } catch (_) {}
    serverProcess = null;
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (serverStatus === 'running') openWeb();
  });

  app.whenReady().then(async () => {
    if (process.platform === 'win32') {
      app.setAppUserModelId('com.courseplex.app');
    }
    if (process.platform === 'darwin') app.dock?.hide();

    const icon = nativeImage.createFromPath(path.join(__dirname, 'tray.png'));
    tray = new Tray(icon.resize({ width: 18, height: 18 }));
    tray.on('click', () => serverStatus === 'running' && openWeb());
    refreshTray();

    try {
      if (app.isPackaged) {
        await startServer();
      } else {
        // Dev: the Next dev server is started separately (pnpm dev -- -H 0.0.0.0 -p 32433)
        await waitForServer(15000);
      }
      serverStatus = 'running';
      refreshTray();
      // Network interfaces can change (Wi-Fi reconnects); keep the menu fresh.
      setInterval(refreshTray, 30000);
      if (app.isPackaged) {
        setupAutoUpdater();
        openWeb();
      }
    } catch (err) {
      serverStatus = 'error';
      refreshTray();
      dialog.showErrorBox('CoursePlex Server Launch Failed', err?.message || String(err));
    }
  });

  // Tray app: keep running when there are no windows.
  app.on('window-all-closed', (e) => e.preventDefault());
  app.on('before-quit', stopServer);
}

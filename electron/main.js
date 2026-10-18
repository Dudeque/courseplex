const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('node:path');
const { spawn } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');

let mainWindow = null;
let serverProcess = null;

const DEFAULT_PORT = 3000;
let activePort = process.env.PORT || DEFAULT_PORT;

function getStandaloneDir() {
  if (!app.isPackaged) {
    return path.join(__dirname, '..', '.next', 'standalone');
  }

  // 1. Electron-builder with asar: true and asarUnpack
  const unpackedPath = path.join(process.resourcesPath, 'app.asar.unpacked', '.next', 'standalone');
  if (fs.existsSync(unpackedPath)) {
    return unpackedPath;
  }

  // 2. Electron-builder with asar: false
  const appPath = path.join(process.resourcesPath, 'app', '.next', 'standalone');
  if (fs.existsSync(appPath)) {
    return appPath;
  }

  // 3. Fallback to appPath
  return path.join(app.getAppPath(), '.next', 'standalone');
}

function checkServerReady(port, timeout = 20000) {
  const startTime = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const req = http.get(`http://127.0.0.1:${port}/api/local/courses`, (res) => {
        resolve(true);
      });
      req.on('error', () => {
        if (Date.now() - startTime > timeout) {
          reject(new Error(`Timed out waiting for CoursePlex local server on port ${port}`));
        } else {
          setTimeout(check, 350);
        }
      });
      req.setTimeout(1000, () => {
        req.destroy();
      });
      req.end();
    };
    check();
  });
}

async function detectDevPort(timeoutMs = 15000) {
  if (process.env.ELECTRON_START_URL) return null;
  if (process.env.PORT) return parseInt(process.env.PORT, 10);

  const startTime = Date.now();
  const candidatePorts = [3000, 3001, 3002];

  while (Date.now() - startTime < timeoutMs) {
    for (const port of candidatePorts) {
      const found = await new Promise((resolve) => {
        const req = http.get(`http://127.0.0.1:${port}/api/local/courses`, (res) => {
          resolve(res.statusCode === 200 || res.statusCode === 400);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(400, () => {
          req.destroy();
          resolve(false);
        });
      });
      if (found) {
        return port;
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  return DEFAULT_PORT;
}

async function startProductionServer() {
  const standaloneDir = getStandaloneDir();
  const serverPath = path.join(standaloneDir, 'server.js');

  console.log('[Main] Looking for Next.js standalone at:', serverPath);

  if (!fs.existsSync(serverPath)) {
    throw new Error(`Next.js standalone server not found at: ${serverPath}`);
  }

  activePort = 38420;

  // Use process.execPath with ELECTRON_RUN_AS_NODE=1 to run server.js with embedded Node
  serverProcess = spawn(process.execPath, [serverPath], {
    cwd: standaloneDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      PORT: activePort.toString(),
      HOSTNAME: '127.0.0.1',
      NODE_ENV: 'production',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  serverProcess.stdout?.on('data', (d) => {
    console.log(`[Next.js stdout]: ${d.toString().trim()}`);
  });

  serverProcess.stderr?.on('data', (d) => {
    console.error(`[Next.js stderr]: ${d.toString().trim()}`);
  });

  serverProcess.on('error', (err) => {
    console.error('[Next.js server process error]:', err);
  });

  serverProcess.on('exit', (code, signal) => {
    console.warn(`[Next.js server exited]: code=${code}, signal=${signal}`);
  });

  await checkServerReady(activePort, 20000);
  console.log('[Main] Next.js backend server successfully started on port:', activePort);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#0a0c14',
    title: 'CoursePlex',
    autoHideMenuBar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  });

  // Native File dialog handler
  ipcMain.handle('dialog:selectDirectory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select Courses Folder',
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  ipcMain.handle('window:close', () => mainWindow?.close());

  // F12 DevTools toggle shortcut
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' && input.type === 'keyDown') {
      mainWindow.webContents.toggleDevTools();
    }
  });

  // Handle load failure to avoid a black screen
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('Failed to load page:', validatedURL, errorCode, errorDescription);
    if (errorCode === -3) return; // net::ERR_ABORTED

    const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <title>CoursePlex - Connection Error</title>
    <style>
      body { background: #0a0c14; color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
      .card { background: #111422; border: 1px solid rgba(255,255,255,0.1); border-radius: 24px; padding: 36px; max-width: 520px; text-align: center; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.7); }
      .icon { width: 48px; height: 48px; margin: 0 auto 16px; background: rgba(239, 68, 68, 0.15); border-radius: 14px; display: flex; align-items: center; justify-content: center; color: #f87171; font-size: 24px; font-weight: bold; }
      h2 { margin: 0 0 8px 0; font-size: 20px; color: #ffffff; }
      p { font-size: 13px; color: #9ca3af; line-height: 1.6; margin: 0 0 16px 0; }
      .details { background: #07090e; padding: 12px 16px; border-radius: 12px; font-family: monospace; font-size: 11px; color: #cbd5e1; margin-bottom: 24px; word-break: break-all; border: 1px solid rgba(255,255,255,0.05); }
      .btn { background: #6366f1; color: white; border: none; padding: 12px 24px; border-radius: 12px; font-size: 13px; font-weight: bold; cursor: pointer; transition: 0.2s; }
      .btn:hover { background: #4f46e5; }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="icon">!</div>
      <h2>Connection Error</h2>
      <p>CoursePlex could not connect to the local server engine.</p>
      <div class="details">${validatedURL}<br><span style="color: #f87171;">(${errorDescription})</span></div>
      <button class="btn" onclick="window.location.href='${validatedURL}'">Retry Connection</button>
    </div>
  </body>
</html>`;
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  });

  // Menu bar
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Select Courses Folder...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              title: 'Select Courses Folder',
              properties: ['openDirectory'],
            });
            if (!result.canceled && result.filePaths.length > 0) {
              mainWindow.webContents.send('menu:directorySelected', result.filePaths[0]);
            }
          },
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Check for Updates...',
          click: async () => {
            if (!app.isPackaged) {
              dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'Check for Updates',
                message: 'Auto-updates are active in the packaged app.',
                detail: `Current development version: ${app.getVersion()}`,
              });
              return;
            }
            try {
              const { autoUpdater } = require('electron-updater');
              const res = await autoUpdater.checkForUpdates();
              if (!res || !res.updateInfo || res.updateInfo.version === app.getVersion()) {
                dialog.showMessageBox(mainWindow, {
                  type: 'info',
                  title: 'CoursePlex is Up to Date',
                  message: `You are running the latest version (${app.getVersion()}).`,
                });
              }
            } catch (err) {
              dialog.showErrorBox('Update Check Failed', err ? err.message : 'Unknown error');
            }
          },
        },
        { type: 'separator' },
        {
          label: 'About CoursePlex',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About CoursePlex',
              message: `CoursePlex Desktop v${app.getVersion()}`,
              detail: 'Personal Netflix & Plex for local video courses.\nZero-cloud architecture • 100% Local.',
            });
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  const startUrl = process.env.ELECTRON_START_URL || `http://127.0.0.1:${activePort}`;
  mainWindow.loadURL(startUrl);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function setupAutoUpdater() {
  const { autoUpdater } = require('electron-updater');
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-downloaded', (info) => {
    if (!mainWindow) return;
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
      title: 'Update Ready - CoursePlex',
      message: `A new version of CoursePlex (${info.version}) has been downloaded!`,
      detail: 'Restart CoursePlex now to complete the update.',
    }).then((res) => {
      if (res.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });

  autoUpdater.on('error', (err) => {
    console.warn('Auto-updater background check:', err ? err.message : err);
  });
}

app.whenReady().then(async () => {
  if (app.isPackaged) {
    try {
      await startProductionServer();
    } catch (err) {
      console.error('Error launching backend server in packaged app:', err);
      dialog.showErrorBox(
        'CoursePlex Server Launch Failed',
        `Could not start the background Next.js server:\n\n${err?.message || err}\n\nPlease try running CoursePlex again or report this error.`
      );
    }
  } else {
    // In dev mode, probe for active dev server port
    try {
      const devPort = await detectDevPort();
      if (devPort) {
        activePort = devPort;
        console.log('[Main] Connected to active dev server on port:', activePort);
      }
    } catch (err) {
      console.warn('[Main] Dev port detection warning:', err);
    }
  }

  createWindow();

  if (app.isPackaged) {
    setupAutoUpdater();
    const { autoUpdater } = require('electron-updater');
    setTimeout(() => {
      autoUpdater.checkForUpdatesAndNotify().catch(() => {});
    }, 4000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
});

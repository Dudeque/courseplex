const { app, BrowserWindow, ipcMain, dialog, Menu, utilityProcess } = require('electron');
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
    const devStandalone = path.join(__dirname, '..', 'standalone');
    if (fs.existsSync(devStandalone)) return devStandalone;
    return path.join(__dirname, '..', '.next', 'standalone');
  }

  // 1. Packaged with asar: false (resources/app/standalone)
  const appStandalone = path.join(process.resourcesPath, 'app', 'standalone');
  if (fs.existsSync(appStandalone)) {
    return appStandalone;
  }

  // 2. Packaged with asarUnpack (resources/app.asar.unpacked/standalone)
  const unpackedStandalone = path.join(process.resourcesPath, 'app.asar.unpacked', 'standalone');
  if (fs.existsSync(unpackedStandalone)) {
    return unpackedStandalone;
  }

  // 3. Fallbacks
  const dotNextApp = path.join(process.resourcesPath, 'app', '.next', 'standalone');
  if (fs.existsSync(dotNextApp)) {
    return dotNextApp;
  }

  const inAppPath = path.join(app.getAppPath(), 'standalone');
  if (fs.existsSync(inAppPath)) {
    return inAppPath;
  }

  return path.join(app.getAppPath(), '.next', 'standalone');
}

function checkServerReady(port, timeout = 25000, getStatus = null) {
  const startTime = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (getStatus) {
        const { serverExited, exitCode, serverLogs } = getStatus();
        if (serverExited) {
          const detail = serverLogs.join('').trim() || 'No logs captured from server process.';
          return reject(new Error(`Next.js server crashed during startup (Exit code: ${exitCode}).\n\nError details:\n${detail}`));
        }
      }

      const req = http.get(`http://127.0.0.1:${port}/api/local/courses`, (res) => {
        resolve(true);
      });

      req.on('error', () => {
        if (Date.now() - startTime > timeout) {
          const logs = getStatus ? getStatus().serverLogs.join('').trim() : '';
          reject(new Error(`Timed out waiting for CoursePlex local server on port ${port}.\n\nServer process logs:\n${logs || 'No output detected.'}`));
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

  console.log('[Main] Looking for Next.js standalone server at:', serverPath);

  if (!fs.existsSync(serverPath)) {
    const dirContent = fs.existsSync(standaloneDir) ? fs.readdirSync(standaloneDir).join(', ') : 'Directory does not exist';
    throw new Error(`Next.js standalone server not found at: ${serverPath}\nDir contents: [${dirContent}]`);
  }

  activePort = 38420;

  const serverLogs = [];
  let serverExited = false;
  let exitCode = null;

  const handleOutput = (chunk, isErr = false) => {
    const text = chunk.toString();
    serverLogs.push(isErr ? `[STDERR] ${text}` : text);
    if (serverLogs.length > 80) serverLogs.shift();
    if (isErr) {
      console.error('[Server Output]:', text.trim());
    } else {
      console.log('[Server Output]:', text.trim());
    }
  };

  // Launch background server
  try {
    const serverEnv = {
      ...process.env,
      COURSEPLEX_USER_DATA: app.getPath('userData'),
      PORT: activePort.toString(),
      HOSTNAME: '127.0.0.1',
      NODE_ENV: 'production',
    };

    if (utilityProcess && typeof utilityProcess.fork === 'function') {
      console.log('[Main] Starting background Next.js server via utilityProcess...');
      serverProcess = utilityProcess.fork(serverPath, [], {
        cwd: standaloneDir,
        env: serverEnv,
        stdio: 'pipe',
      });

      serverProcess.stdout?.on('data', (d) => handleOutput(d, false));
      serverProcess.stderr?.on('data', (d) => handleOutput(d, true));

      serverProcess.on('exit', (code) => {
        console.warn(`[Main] Server process exited with code ${code}`);
        serverExited = true;
        exitCode = code;
      });
    } else {
      throw new Error('utilityProcess not supported');
    }
  } catch (launchErr) {
    console.log('[Main] Falling back to child_process.spawn...', launchErr.message);
    serverProcess = spawn(process.execPath, [serverPath], {
      cwd: standaloneDir,
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        COURSEPLEX_USER_DATA: app.getPath('userData'),
        PORT: activePort.toString(),
        HOSTNAME: '127.0.0.1',
        NODE_ENV: 'production',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    serverProcess.stdout?.on('data', (d) => handleOutput(d, false));
    serverProcess.stderr?.on('data', (d) => handleOutput(d, true));

    serverProcess.on('exit', (code) => {
      console.warn(`[Main] Spawned server process exited with code ${code}`);
      serverExited = true;
      exitCode = code;
    });
  }

  await checkServerReady(activePort, 25000, () => ({ serverExited, exitCode, serverLogs }));
  console.log('[Main] Next.js backend server successfully listening on port:', activePort);
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
              const msg = err ? err.message : 'Unknown error';
              if (msg.includes('404')) {
                dialog.showErrorBox(
                  'Update Check Failed (404 Not Found)',
                  'GitHub releases returned 404 Not Found.\n\nBecause the repository is currently Private, GitHub conceals release downloads from unauthenticated apps.\n\nSetting the Dudeque/courseplex repository to Public will allow seamless automatic updates.'
                );
              } else {
                dialog.showErrorBox('Update Check Failed', msg);
              }
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

function registerIpcHandlers() {
  ipcMain.handle('dialog:selectDirectory', async (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender) || mainWindow || BrowserWindow.getFocusedWindow();
      if (win && !win.isDestroyed()) {
        win.focus();
      }
      const result = await dialog.showOpenDialog(win, {
        title: 'Select Courses Folder',
        properties: ['openDirectory'],
      });
      console.log('[Main] dialog:selectDirectory result:', result);
      if (result.canceled || result.filePaths.length === 0) {
        return null;
      }
      return result.filePaths[0];
    } catch (err) {
      console.error('[Main] Error in dialog:selectDirectory:', err);
      return null;
    }
  });

  ipcMain.handle('window:minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
    win?.minimize();
  });

  ipcMain.handle('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
    if (win?.isMaximized()) {
      win.unmaximize();
    } else {
      win?.maximize();
    }
  });

  ipcMain.handle('window:close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
    win?.close();
  });
}

app.whenReady().then(async () => {
  registerIpcHandlers();

  if (app.isPackaged) {
    try {
      await startProductionServer();
    } catch (err) {
      console.error('Error launching backend server in packaged app:', err);
      dialog.showErrorBox(
        'CoursePlex Server Launch Failed',
        `Could not start the background Next.js server:\n\n${err?.message || err}\n\nPlease try running CoursePlex again or report this error.`
      );
      return;
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
    try {
      serverProcess.kill();
    } catch (_) {}
    serverProcess = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (serverProcess) {
    try {
      serverProcess.kill();
    } catch (_) {}
    serverProcess = null;
  }
});

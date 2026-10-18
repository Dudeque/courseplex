const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('node:path');
const { spawn } = require('node:child_process');
const http = require('node:http');

let mainWindow = null;
let serverProcess = null;

const DEFAULT_PORT = 3000;
let activePort = process.env.PORT || DEFAULT_PORT;

function checkServerReady(port, timeout = 15000) {
  const startTime = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const req = http.get(`http://localhost:${port}/`, (res) => {
        resolve(true);
      });
      req.on('error', () => {
        if (Date.now() - startTime > timeout) {
          reject(new Error('Server start timed out'));
        } else {
          setTimeout(check, 300);
        }
      });
      req.end();
    };
    check();
  });
}

async function startProductionServer() {
  const standaloneDir = path.join(app.getAppPath(), '.next', 'standalone');
  const serverPath = path.join(standaloneDir, 'server.js');

  const fs = require('node:fs');
  if (!fs.existsSync(serverPath)) {
    console.error('Next.js standalone server not found at:', serverPath);
    return;
  }

  activePort = 38420;
  serverProcess = spawn(process.execPath, [serverPath], {
    cwd: standaloneDir,
    env: {
      ...process.env,
      PORT: activePort.toString(),
      HOSTNAME: '127.0.0.1',
      NODE_ENV: 'production',
    },
    stdio: 'ignore',
  });

  serverProcess.on('error', (err) => {
    console.error('Failed to start Next.js backend server:', err);
  });

  await checkServerReady(activePort);
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

  const startUrl = process.env.ELECTRON_START_URL || `http://localhost:${activePort}`;
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

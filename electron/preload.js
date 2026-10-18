const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
  onDirectorySelected: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const subscription = (_event, dirPath) => callback(dirPath);
    ipcRenderer.on('menu:directorySelected', subscription);
    return () => ipcRenderer.removeListener('menu:directorySelected', subscription);
  },
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
});


const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('autoPrintNative', {
  system: {
    info: () => ipcRenderer.invoke('system:info'),
  },
  files: {
    choose: () => ipcRenderer.invoke('files:choose'),
    stat: (filePath) => ipcRenderer.invoke('files:stat', filePath),
    register: (filePath) => ipcRenderer.invoke('files:register', filePath),
  },
  printers: {
    list: () => ipcRenderer.invoke('printers:list'),
    openQueue: (name) => ipcRenderer.invoke('printer:open', name),
  },
});

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('autoPrintNative', {
  system: {
    info: () => ipcRenderer.invoke('system:info'),
  },
  files: {
    choose: () => ipcRenderer.invoke('files:choose'),
    stat: (filePath) => ipcRenderer.invoke('files:stat', filePath),
    register: (filePath) => ipcRenderer.invoke('files:register', filePath),
    resolve: (localFileId) => ipcRenderer.invoke('files:resolve', localFileId),
    open: (filePath) => ipcRenderer.invoke('files:open', filePath),
    importRemote: (input) => ipcRenderer.invoke('files:importRemote', input),
    download: (input) => ipcRenderer.invoke('files:download', input),
  },
  print: {
    enqueue: (input) => ipcRenderer.invoke('print:enqueue', input),
    createTestDocument: () => ipcRenderer.invoke('print:test-document'),
    queue: () => ipcRenderer.invoke('print:queue'),
  },
  printers: {
    list: () => ipcRenderer.invoke('printers:list'),
    openQueue: (name) => ipcRenderer.invoke('printer:open', name),
  },
});

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mapleDesktop', {
  toggleCompact: value => ipcRenderer.invoke('desktop:compact', Boolean(value)),
  onCompactChange: callback => ipcRenderer.on('desktop:compact-changed', (_event, value) => callback(Boolean(value))),
  speak: (words, rate) => ipcRenderer.invoke('desktop:voice', String(words), Number(rate) || 1)
});

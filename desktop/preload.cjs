const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mapleDesktop', {
  platform: process.platform,
  toggleCompact: value => ipcRenderer.invoke('desktop:compact', Boolean(value)),
  onCompactChange: callback => ipcRenderer.on('desktop:compact-changed', (_event, value) => callback(Boolean(value))),
  speak: (words, rate, voice) => ipcRenderer.invoke('desktop:voice', String(words), Number(rate) || 1, voice ? String(voice) : undefined),
  voices: () => ipcRenderer.invoke('desktop:voices'),
  installVoice: name => ipcRenderer.invoke('desktop:install-voice', String(name))
});

// Gaming Mode: Maple Route is often stopped hard (the game or Gaming Mode restarting), before the
// browser has written its storage. Restore the saved copy before the app reads its progress.
if (process.argv.includes('--maple-deck')) {
  try {
    const saved = ipcRenderer.sendSync('deck:storage-load');
    if (saved && typeof saved === 'object') for (const [key, value] of Object.entries(saved))
      if (key.startsWith('maple-route') && typeof value === 'string' && window.localStorage.getItem(key) !== value) window.localStorage.setItem(key, value);
  } catch { /* nothing saved yet */ }
}
if (process.argv.includes('--maple-deck')) contextBridge.exposeInMainWorld('mapleDeck', {
  saveStorage: values => ipcRenderer.send('deck:storage-save', values),
  startCapture: () => ipcRenderer.invoke('deck:start-capture'),
  stopCapture: () => ipcRenderer.invoke('deck:stop-capture'),
  frame: () => ipcRenderer.invoke('deck:frame'),
  status: () => ipcRenderer.invoke('deck:status'),
  onStatus: callback => ipcRenderer.on('deck:status', (_event, status) => callback(status)),
  publish: snapshot => ipcRenderer.send('deck:publish', snapshot),
  publishOverlay: snapshot => ipcRenderer.send('deck:overlay-update', snapshot),
  publishSummary: summary => ipcRenderer.send('deck:summary', summary),
  onPhoneStart: callback => ipcRenderer.on('deck:phone-start', callback),
  onNextStep: callback => ipcRenderer.on('deck:next-step', callback),
  onUndo: callback => ipcRenderer.on('deck:undo', callback),
  onMapRecover: callback => ipcRenderer.on('deck:map-recover', (_event, mapId) => callback(mapId)),
  onPhoneStop: callback => ipcRenderer.on('deck:phone-stop', callback),
  onPhoneOverlay: callback => ipcRenderer.on('deck:phone-overlay', (_event, enabled) => callback(enabled)),
  onPhoneAction: callback => ipcRenderer.on('deck:phone-action', (_event, action) => callback(action))
});

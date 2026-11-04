const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (c) => ipcRenderer.invoke('config:save', c),
  start: () => ipcRenderer.invoke('bot:start'),
  stop: () => ipcRenderer.invoke('bot:stop'),
  resetHistory: () => ipcRenderer.invoke('bot:reset'),
  logout: () => ipcRenderer.invoke('bot:logout'),
  onEvent: (cb) => ipcRenderer.on('bot:event', (_e, d) => cb(d)),
});

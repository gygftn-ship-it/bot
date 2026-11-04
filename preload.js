const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (c) => ipcRenderer.invoke('config:save', c),
  start: () => ipcRenderer.invoke('bot:start'),
  stop: () => ipcRenderer.invoke('bot:stop'),
  resetHistory: () => ipcRenderer.invoke('bot:reset'),
  logout: () => ipcRenderer.invoke('bot:logout'),
  listModels: (cle) => ipcRenderer.invoke('models:list', cle),
  testAI: (cfg) => ipcRenderer.invoke('ai:test', cfg),
  openFolder: () => ipcRenderer.invoke('folder:open'),
  onEvent: (cb) => ipcRenderer.on('bot:event', (_e, d) => cb(d)),
});

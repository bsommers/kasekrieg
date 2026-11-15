// KÄSEKRIEG desktop preload (sandboxed). Exposes a tiny, optional `window.desktop` API.
// The game must never require it: it is plain web code and runs unchanged in a browser.
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  platform: process.platform,
  arch: process.arch,
  versions: { electron: process.versions.electron, chrome: process.versions.chrome },
  toggleFullscreen: () => ipcRenderer.invoke('desktop:toggle-fullscreen'),
  quit: () => ipcRenderer.invoke('desktop:quit'),
});

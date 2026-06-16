const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pokeapi", {
  onCursor: (cb) => ipcRenderer.on("cursor", (_e, p) => cb(p)),
  onConfig: (cb) => ipcRenderer.on("config", (_e, patch) => cb(patch)),
  onPack: (cb) => ipcRenderer.on("pack", (_e, key) => cb(key)),
  onEnabled: (cb) => ipcRenderer.on("enabled", (_e, on) => cb(on)),
  onInit: (cb) => ipcRenderer.on("init", (_e, s) => cb(s)),
  loadPack: (key) => ipcRenderer.invoke("overlay:loadPack", key),
});

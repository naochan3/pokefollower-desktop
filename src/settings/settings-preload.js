const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("settingsApi", {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (patch) => ipcRenderer.send("settings:set", patch),
  listPacks: () => ipcRenderer.invoke("packs:list"),
  getSearchMetadata: () => ipcRenderer.invoke("packs:search-metadata"),
  testCompanionNotification: () => ipcRenderer.invoke("companion:test-notification"),
  startWorkWatch: () => ipcRenderer.invoke("work-watch:start"),
  stopWorkWatch: () => ipcRenderer.invoke("work-watch:stop"),
  resetWorkWatch: () => ipcRenderer.invoke("work-watch:reset"),
  nextFavorite: () => ipcRenderer.invoke("favorites:next"),
  addFavorite: (packKey) => ipcRenderer.invoke("favorites:add", packKey),
  removeFavorite: (packKey) => ipcRenderer.invoke("favorites:remove", packKey),
});

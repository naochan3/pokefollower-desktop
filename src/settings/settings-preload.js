const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("settingsApi", {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (patch) => ipcRenderer.send("settings:set", patch),
  listPacks: () => ipcRenderer.invoke("packs:list"),
  testCompanionNotification: () => ipcRenderer.invoke("companion:test-notification"),
});

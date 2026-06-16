const { contextBridge, ipcRenderer } = require("electron");

// 描画役のオーバーレイは「メタ（画像プリロード用）」と「毎フレームの描画指示」だけ受け取る。
contextBridge.exposeInMainWorld("pokeapi", {
  onMeta: (cb) => ipcRenderer.on("meta", (_e, m) => cb(m)),
  onFrame: (cb) => ipcRenderer.on("frame", (_e, f) => cb(f)),
});

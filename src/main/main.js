const { app, BrowserWindow, protocol, net, screen, ipcMain } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { makePackReader } = require("./pack-reader.js");

const ROOT = path.join(__dirname, "..", ".."); // assets/ の親（プロジェクトルート）
const packReader = makePackReader(ROOT);

let overlayWin = null;

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

function registerAppProtocol() {
  protocol.handle("app", (request) => {
    const url = new URL(request.url);             // app://bundle/assets/...
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const filePath = path.join(ROOT, rel);
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function createOverlay() {
  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.workArea;
  overlayWin = new BrowserWindow({
    x, y, width, height,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, "..", "overlay", "overlay-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  overlayWin.setIgnoreMouseEvents(true, { forward: true });
  overlayWin.setAlwaysOnTop(true, "screen-saver");
  overlayWin.loadFile(path.join(__dirname, "..", "overlay", "overlay.html"));
  return overlayWin;
}

ipcMain.handle("overlay:loadPack", (_e, key) => packReader.readPackMeta(key));

app.whenReady().then(() => {
  registerAppProtocol();
  createOverlay();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

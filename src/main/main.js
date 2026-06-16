const { app, BrowserWindow, protocol, net, screen, ipcMain, Tray, Menu, nativeImage } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { makePackReader } = require("./pack-reader.js");
const { startCursorTracker } = require("./cursor-tracker.js");
const { createSettingsStore } = require("./settings-store.js");

const ROOT = path.join(__dirname, "..", ".."); // assets/ の親（プロジェクトルート）
const packReader = makePackReader(ROOT);

let overlayWin = null;
let settingsStore = null;
let settingsWin = null;
let tray = null;

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
  overlayWin.webContents.on("did-finish-load", () => {
    overlayWin.webContents.send("init", settingsStore.getAll());
  });
  return overlayWin;
}

function getSettingsWin() {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.focus(); return settingsWin; }
  settingsWin = new BrowserWindow({
    width: 400, height: 560, resizable: false, title: "PokéFollower 設定",
    webPreferences: {
      preload: path.join(__dirname, "..", "settings", "settings-preload.js"),
      contextIsolation: true, nodeIntegration: false,
    },
  });
  settingsWin.setMenuBarVisibility(false);
  settingsWin.loadFile(path.join(__dirname, "..", "settings", "settings.html"));
  return settingsWin;
}

function buildTray() {
  const icon = nativeImage.createFromPath(path.join(ROOT, "assets", "icons", "pokeball-32.png"));
  tray = new Tray(icon);
  tray.setToolTip("PokéFollower");
  refreshTrayMenu();
  tray.on("double-click", () => getSettingsWin());
}

function refreshTrayMenu() {
  const enabled = settingsStore.get("enabled");
  const menu = Menu.buildFromTemplate([
    { label: "設定を開く", click: () => getSettingsWin() },
    { type: "separator" },
    {
      label: "有効", type: "checkbox", checked: enabled,
      click: (item) => {
        const next = settingsStore.set({ enabled: item.checked });
        if (overlayWin && !overlayWin.isDestroyed()) overlayWin.webContents.send("enabled", next.enabled);
        refreshTrayMenu();
      },
    },
    { type: "separator" },
    { label: "終了", click: () => { app.isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

ipcMain.handle("overlay:loadPack", (_e, key) => packReader.readPackMeta(key));

ipcMain.handle("settings:get", () => settingsStore.getAll());
ipcMain.handle("packs:list", () => packReader.readIndex());
ipcMain.on("settings:set", (_e, patch) => {
  const next = settingsStore.set(patch);
  if (overlayWin && !overlayWin.isDestroyed()) {
    if ("scale" in patch || "offset" in patch || "lerp" in patch) {
      overlayWin.webContents.send("config", {
        vcp1_scale: next.scale, vcp1_offset: next.offset, vcp1_lerp: next.lerp,
      });
    }
    if ("pack" in patch) overlayWin.webContents.send("pack", next.pack);
    if ("enabled" in patch) overlayWin.webContents.send("enabled", next.enabled);
  }
});

app.whenReady().then(() => {
  settingsStore = createSettingsStore(path.join(app.getPath("userData"), "settings.json"));
  registerAppProtocol();
  createOverlay();

  startCursorTracker(
    () => (overlayWin ? overlayWin.getBounds() : null),
    (localPoint) => {
      if (overlayWin && !overlayWin.isDestroyed()) {
        overlayWin.webContents.send("cursor", localPoint);
      }
    }
  );

  buildTray();
});

app.on("window-all-closed", () => {
  // トレイ常駐のため終了しない（「終了」メニューでのみ quit）
});

const { app, BrowserWindow, protocol, net, screen, ipcMain, Tray, Menu, nativeImage } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const fs = require("node:fs");
const { makePackReader } = require("./pack-reader.js");
const { createSettingsStore } = require("./settings-store.js");
const { createFollowerSim } = require("./follower-sim.js");

const ROOT = path.join(__dirname, "..", ".."); // assets/ の親（プロジェクトルート）
const packReader = makePackReader(ROOT);
const sim = createFollowerSim();

let overlays = [];        // [{ win, bounds }] モニターごとに1枚
let settingsStore = null;
let settingsWin = null;
let tray = null;
let currentMeta = null;
let enabled = false;
let simTimer = null;
let lastStepTs = 0;

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

function registerAppProtocol() {
  protocol.handle("app", (request) => {
    const url = new URL(request.url);             // app://bundle/assets/...
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const filePath = path.join(ROOT, rel);
    if (!fs.existsSync(filePath)) return new Response(null, { status: 404 });
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

// --- オーバーレイ（モニターごとに常設。各窓は描画役） ---
function createOverlayWindow(display) {
  const { x, y, width, height } = display.bounds;
  const win = new BrowserWindow({
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
  win.setIgnoreMouseEvents(true, { forward: true });
  win.setAlwaysOnTop(true, "screen-saver");
  win.loadFile(path.join(__dirname, "..", "overlay", "overlay.html"));
  win.webContents.on("did-finish-load", () => {
    if (currentMeta && !win.isDestroyed()) win.webContents.send("meta", currentMeta);
  });
  return win;
}

function buildOverlays() {
  for (const o of overlays) { if (o.win && !o.win.isDestroyed()) o.win.destroy(); }
  overlays = screen.getAllDisplays().map((d) => ({ win: createOverlayWindow(d), bounds: d.bounds }));
}

function loadPackIntoSim(packKey) {
  const { resolvedKey, meta } = packReader.readPackMeta(packKey);
  currentMeta = meta;
  sim.setMeta(meta);
  for (const o of overlays) {
    if (o.win && !o.win.isDestroyed()) o.win.webContents.send("meta", meta);
  }
  return resolvedKey;
}

// ポケモンのグローバル座標を、各モニター窓のローカル座標に変換して配信
function broadcastFrame(render) {
  for (const o of overlays) {
    if (!o.win || o.win.isDestroyed()) continue;
    if (!render) { o.win.webContents.send("frame", { visible: false }); continue; }
    o.win.webContents.send("frame", {
      visible: true,
      x: render.x - o.bounds.x,
      y: render.y - o.bounds.y,
      state: render.state,
      frame: render.frame,
      row: render.row,
      scale: render.scale,
    });
  }
}

function startSimLoop() {
  if (simTimer) return;
  lastStepTs = Date.now();
  simTimer = setInterval(() => {
    const now = Date.now();
    const dt = now - lastStepTs;
    lastStepTs = now;
    const cursor = screen.getCursorScreenPoint(); // グローバル座標
    sim.updateCursor(cursor.x, cursor.y, now);
    if (!enabled) { broadcastFrame(null); return; }
    broadcastFrame(sim.step(dt, now));
  }, 16);
}

function setEnabled(on) {
  enabled = !!on;
  if (enabled) {
    const c = screen.getCursorScreenPoint();
    sim.resetTo(c.x, c.y, Date.now()); // 有効化時はカーソル位置へ出現
  } else {
    broadcastFrame(null);
  }
}

function getSettingsWin() {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.focus(); return settingsWin; }
  settingsWin = new BrowserWindow({
    width: 400, height: 720, resizable: false, title: "PokéFollower 設定",
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
  const menu = Menu.buildFromTemplate([
    { label: "設定を開く", click: () => getSettingsWin() },
    { type: "separator" },
    {
      label: "有効", type: "checkbox", checked: enabled,
      click: (item) => {
        settingsStore.set({ enabled: item.checked });
        setEnabled(item.checked);
        refreshTrayMenu();
      },
    },
    {
      label: "自動起動", type: "checkbox",
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => {
        app.setLoginItemSettings({ openAtLogin: item.checked });
        refreshTrayMenu();
      },
    },
    { type: "separator" },
    { label: "終了", click: () => { app.isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}

ipcMain.handle("settings:get", () => settingsStore.getAll());
ipcMain.handle("packs:list", () => packReader.readPackList());
ipcMain.on("settings:set", (_e, patch) => {
  const next = settingsStore.set(patch);
  if ("scale" in patch || "offset" in patch || "lerp" in patch) {
    sim.setConfig({ vcp1_scale: next.scale, vcp1_offset: next.offset, vcp1_lerp: next.lerp });
  }
  if ("pack" in patch) {
    try {
      const resolved = loadPackIntoSim(next.pack);
      if (resolved !== next.pack) settingsStore.set({ pack: resolved });
    } catch (_) { /* 解決失敗時は据え置き */ }
  }
  if ("enabled" in patch) { setEnabled(next.enabled); refreshTrayMenu(); }
});

// 二重起動を禁止（複数インスタンスが同時にカーソルを追って競合するのを防ぐ）。
const gotSingleInstanceLock = app.requestSingleInstanceLock();

app.whenReady().then(() => {
  if (!gotSingleInstanceLock) { app.quit(); return; }
  settingsStore = createSettingsStore(path.join(app.getPath("userData"), "settings.json"));
  const s = settingsStore.getAll();
  // 自動起動はインストール版のみ登録（開発起動でRunキーにゴミをためないようisPackagedで限定）
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true });

  registerAppProtocol();
  sim.setConfig({ vcp1_scale: s.scale, vcp1_offset: s.offset, vcp1_lerp: s.lerp });
  try { loadPackIntoSim(s.pack); }
  catch (_) { try { loadPackIntoSim("retro/gen-1/009-blastoise"); } catch (_e) { /* noop */ } }

  buildOverlays();
  // ディスプレイ構成が変わったら窓を作り直す（グローバル座標のシムはそのまま）
  screen.on("display-added", buildOverlays);
  screen.on("display-removed", buildOverlays);
  screen.on("display-metrics-changed", buildOverlays);

  startSimLoop();
  setEnabled(s.enabled);
  buildTray();
});

app.on("window-all-closed", () => {
  // トレイ常駐のため終了しない（「終了」メニューでのみ quit）
});

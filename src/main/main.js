const { app, BrowserWindow, protocol, net, screen, ipcMain, Tray, Menu, nativeImage, powerMonitor } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const fs = require("node:fs");
const { makePackReader } = require("./pack-reader.js");
const { createSettingsStore } = require("./settings-store.js");
const { createFollowerSim } = require("./follower-sim.js");
const { frameForOverlay, frameKey } = require("./frame-routing.js");
const { getForegroundInfo } = require("./fullscreen-detect.js");
const { isFullscreenForeground } = require("./fullscreen-policy.js");
const { resolveAppProtocolPath } = require("./app-protocol-path.js");
const { getSimIntervalMs } = require("./sim-loop-config.js");
const { applySettingsPatch } = require("./settings-patch.js");

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
let simIntervalMs = null;
let fullscreenTimer = null;
let lastStepTs = 0;
let fullscreenActive = false; // 前面に全画面アプリ（ゲーム等）があるか

const TRAY_ICON_SIZE_PX = 28;
const DISPLAY_REBUILD_DEBOUNCE_MS = 250;
const FULLSCREEN_POLL_INTERVAL_MS = 600;
function checkFullscreen() {
  fullscreenActive = isFullscreenForeground(getForegroundInfo(), screen.getAllDisplays());
}

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

function registerAppProtocol() {
  protocol.handle("app", (request) => {
    const filePath = resolveAppProtocolPath(ROOT, request.url);
    if (!filePath) return new Response(null, { status: 403 });
    if (!fs.existsSync(filePath)) return new Response(null, { status: 404 });
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function getUserDataPath() {
  if (process.env.POKEFOLLOWER_ALLOW_TEST_USER_DATA === "1" && process.env.POKEFOLLOWER_TEST_USER_DATA_DIR) {
    const tempRoot = process.env.TEMP || process.env.TMPDIR || process.env.TMP;
    const testUserDataPath = path.resolve(process.env.POKEFOLLOWER_TEST_USER_DATA_DIR);
    const testRoot = tempRoot ? path.resolve(tempRoot) : "";
    if (testRoot && testUserDataPath.startsWith(testRoot + path.sep)) return testUserDataPath;
  }
  if (!app.isPackaged && process.env.PF_DEV_USER_DATA_DIR) return process.env.PF_DEV_USER_DATA_DIR;
  return app.getPath("userData");
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
      sandbox: true,
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
  overlays = screen.getAllDisplays().map((d) => ({ win: createOverlayWindow(d), bounds: d.bounds, visible: false, lastFrameKey: "hidden" }));
}

let displayRebuildTimer = null;
function scheduleBuildOverlays() {
  if (displayRebuildTimer) clearTimeout(displayRebuildTimer);
  displayRebuildTimer = setTimeout(() => {
    displayRebuildTimer = null;
    buildOverlays();
  }, DISPLAY_REBUILD_DEBOUNCE_MS);
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
    const frame = frameForOverlay(render, o.bounds, currentMeta);
    if (!frame.visible) {
      if (o.visible) {
        o.win.webContents.send("frame", frame);
        o.visible = false;
        o.lastFrameKey = "hidden";
      }
      continue;
    }
    const nextFrameKey = frameKey(frame);
    if (o.visible && o.lastFrameKey === nextFrameKey) continue;
    o.win.webContents.send("frame", frame);
    o.visible = true;
    o.lastFrameKey = nextFrameKey;
  }
}

function readBatteryState() {
  try { return powerMonitor.isOnBatteryPower(); }
  catch (_) { return false; }
}

function runSimFrame() {
  const now = Date.now();
  const dt = now - lastStepTs;
  lastStepTs = now;
  if (!enabled || fullscreenActive) { broadcastFrame(null); return; }
  const cursor = screen.getCursorScreenPoint(); // グローバル座標
  sim.updateCursor(cursor.x, cursor.y, now);
  broadcastFrame(sim.step(dt, now));
}

function startSimLoop() {
  if (simTimer) return;
  lastStepTs = Date.now();
  simIntervalMs = getSimIntervalMs({ isOnBattery: readBatteryState() });
  simTimer = setInterval(runSimFrame, simIntervalMs);
}

function refreshSimLoopInterval() {
  const next = getSimIntervalMs({ isOnBattery: readBatteryState() });
  if (!simTimer || next === simIntervalMs) return;
  clearInterval(simTimer);
  simTimer = null;
  startSimLoop();
}

function startFullscreenPolling() {
  if (fullscreenTimer) return;
  checkFullscreen();
  fullscreenTimer = setInterval(checkFullscreen, FULLSCREEN_POLL_INTERVAL_MS);
}

function stopFullscreenPolling() {
  if (!fullscreenTimer) return;
  clearInterval(fullscreenTimer);
  fullscreenTimer = null;
  fullscreenActive = false;
}

function setEnabled(on) {
  enabled = !!on;
  if (enabled) {
    startFullscreenPolling();
    const c = screen.getCursorScreenPoint();
    sim.resetTo(c.x, c.y, Date.now()); // 有効化時はカーソル位置へ出現
  } else {
    stopFullscreenPolling();
    broadcastFrame(null);
  }
}

function getSettingsWin() {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.focus(); return settingsWin; }
  settingsWin = new BrowserWindow({
    width: 400, height: 720, resizable: false, title: "PokéFollower 設定",
    webPreferences: {
      preload: path.join(__dirname, "..", "settings", "settings-preload.js"),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
  settingsWin.setMenuBarVisibility(false);
  settingsWin.loadFile(path.join(__dirname, "..", "settings", "settings.html"));
  return settingsWin;
}

function buildTray() {
  const icon = nativeImage
    .createFromPath(path.join(ROOT, "assets", "icons", "pokeball-32.png"))
    .resize({ width: TRAY_ICON_SIZE_PX, height: TRAY_ICON_SIZE_PX });
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
  applySettingsPatch(patch, { settingsStore, sim, loadPackIntoSim, setEnabled, refreshTrayMenu });
});

// 二重起動を禁止（複数インスタンスが同時にカーソルを追って競合するのを防ぐ）。
const gotSingleInstanceLock = app.requestSingleInstanceLock();

app.whenReady().then(() => {
  if (!gotSingleInstanceLock) { app.quit(); return; }
  settingsStore = createSettingsStore(path.join(getUserDataPath(), "settings.json"));
  const s = settingsStore.getAll();
  // 自動起動はインストール版のみ登録（開発起動でRunキーにゴミをためないようisPackagedで限定）
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true });

  registerAppProtocol();
  sim.setConfig({ vcp1_scale: s.scale, vcp1_offset: s.offset, vcp1_lerp: s.lerp });
  try { loadPackIntoSim(s.pack); }
  catch (_) { try { loadPackIntoSim("retro/gen-1/009-blastoise"); } catch (_e) { /* noop */ } }

  buildOverlays();
  // ディスプレイ構成が変わったら窓を作り直す（グローバル座標のシムはそのまま）
  screen.on("display-added", scheduleBuildOverlays);
  screen.on("display-removed", scheduleBuildOverlays);
  screen.on("display-metrics-changed", scheduleBuildOverlays);
  powerMonitor.on("on-ac", refreshSimLoopInterval);
  powerMonitor.on("on-battery", refreshSimLoopInterval);

  startSimLoop();
  setEnabled(s.enabled);
  buildTray();
});

app.on("window-all-closed", () => {
  // トレイ常駐のため終了しない（「終了」メニューでのみ quit）
});

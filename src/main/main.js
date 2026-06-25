const { app, BrowserWindow, protocol, net, screen, ipcMain, Tray, Menu, nativeImage, powerMonitor, session } = require("electron");
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
const { createNotificationCompanion } = require("./notification-companion.js");
const { createCodexNotificationWatcher } = require("./codex-notification-watcher.js");
const { defaultNotificationQueuePath } = require("./notification-queue.js");
const { createWorkWatchSession } = require("./work-watch.js");
const { reactionModeForForeground } = require("./app-reactions.js");
const { addFavoritePack, nextFavoritePack, removeFavoritePack } = require("./favorite-rotation.js");
const { exportCodexPet } = require("./codex-pet-export.js");

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
let lastRender = null;
let fullscreenActive = false; // 前面に全画面アプリ（ゲーム等）があるか
let fullscreenCheckInFlight = false;
let lastForegroundInfo = null;
let currentReactionMode = "normal";
let notificationCompanion = null;
let codexNotificationWatcher = null;
let workWatchSession = null;
let workWatchTimer = null;
let favoriteRotationTimer = null;

const TRAY_ICON_SIZE_PX = 28;
const DISPLAY_REBUILD_DEBOUNCE_MS = 250;
const FULLSCREEN_POLL_INTERVAL_MS = process.platform === "win32" ? 600 : 2000;

function applyFullscreenInfo(info) {
  lastForegroundInfo = info || null;
  if (info && Number.isFinite(info.x) && Number.isFinite(info.y) && Number.isFinite(info.w) && Number.isFinite(info.h)) {
    sim.setRestSurfaces([{ kind: "window", x: info.x, y: info.y, width: info.w, height: info.h }]);
  } else {
    sim.setRestSurfaces([]);
  }
  const nextFullscreenActive = isFullscreenForeground(info, screen.getAllDisplays());
  if (nextFullscreenActive === fullscreenActive) return;
  fullscreenActive = nextFullscreenActive;
  if (fullscreenActive) {
    stopSimLoop({ hide: true });
  } else if (enabled) {
    lastStepTs = Date.now();
    startSimLoop();
    runSimFrame();
  }
}

function workWatchPhase() {
  if (!workWatchSession) return "idle";
  const state = workWatchSession.snapshot();
  if (!state.running) return "idle";
  return state.phase;
}

function syncReactionMode() {
  if (!settingsStore) return;
  const recentlyActive = settingsStore.get("avoidCursor") && (() => {
    try { return powerMonitor.getSystemIdleTime() <= 1; }
    catch (_) { return false; }
  })();
  const nextMode = reactionModeForForeground(lastForegroundInfo, {
    enabled: !!settingsStore.get("appReactionsEnabled"),
    workWatchPhase: workWatchPhase(),
    recentlyActive,
  });
  if (nextMode === currentReactionMode) return;
  currentReactionMode = nextMode;
  sim.setConfig({ vcp1_reactionMode: currentReactionMode });
}

function checkFullscreen() {
  if (fullscreenCheckInFlight) return;
  const info = getForegroundInfo();
  if (!info || typeof info.then !== "function") {
    applyFullscreenInfo(info);
    return;
  }
  fullscreenCheckInFlight = true;
  info
    .then((resolvedInfo) => {
      applyFullscreenInfo(resolvedInfo);
    })
    .finally(() => {
      fullscreenCheckInFlight = false;
    });
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

function registerPermissionGuards() {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  session.defaultSession.setPermissionCheckHandler(() => false);
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

function hardenRendererNavigation(win) {
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event) => {
    event.preventDefault();
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
      sandbox: true,
    },
  });
  // 透過窓は生成時にプライマリ表示のサイズへ潰されることがある（スケール混在のマルチモニタで顕著）。
  // 生成後に明示 setBounds して担当ディスプレイ全体を確実に覆う。
  win.setBounds({ x, y, width, height });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.setAlwaysOnTop(true, "screen-saver");
  hardenRendererNavigation(win);
  win.loadFile(path.join(__dirname, "..", "overlay", "overlay.html"));
  win.webContents.on("did-finish-load", () => {
    if (win.isDestroyed()) return;
    if (currentMeta) win.webContents.send("meta", currentMeta);
    const overlay = overlays.find((o) => o.win === win);
    if (overlay) sendFrameToOverlay(overlay, lastRender, true);
  });
  return win;
}

function buildOverlays() {
  for (const o of overlays) { if (o.win && !o.win.isDestroyed()) o.win.destroy(); }
  overlays = screen.getAllDisplays().map((d) => ({ win: createOverlayWindow(d), bounds: d.bounds, visible: false, lastFrameKey: "hidden" }));
  sim.setDisplayBounds(overlays.map((o) => o.bounds));
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

function switchPack(packKey) {
  if (!packKey) return settingsStore.get("pack");
  const resolved = loadPackIntoSim(packKey);
  settingsStore.set({ pack: resolved });
  return resolved;
}

function sendFrameToOverlay(o, render, force = false) {
  if (!o.win || o.win.isDestroyed()) return;
  const frame = frameForOverlay(render, o.bounds, currentMeta);
  if (!frame.visible) {
    if (force || o.visible) {
      o.win.webContents.send("frame", frame);
      o.visible = false;
      o.lastFrameKey = "hidden";
    }
    return;
  }
  const nextFrameKey = frameKey(frame);
  if (!force && o.visible && o.lastFrameKey === nextFrameKey) return;
  o.win.webContents.send("frame", frame);
  o.visible = true;
  o.lastFrameKey = nextFrameKey;
}

// ポケモンのグローバル座標を、各モニター窓のローカル座標に変換して配信
function broadcastFrame(render) {
  lastRender = render;
  for (const o of overlays) {
    sendFrameToOverlay(o, render);
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
  syncReactionMode();
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

function stopSimLoop({ hide = false } = {}) {
  if (simTimer) {
    clearInterval(simTimer);
    simTimer = null;
  }
  if (hide) broadcastFrame(null);
}

function refreshSimLoopInterval() {
  const next = getSimIntervalMs({ isOnBattery: readBatteryState() });
  if (!enabled || fullscreenActive) {
    simIntervalMs = next;
    return;
  }
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
    if (fullscreenActive) {
      stopSimLoop({ hide: true });
    } else {
      startSimLoop();
      runSimFrame();
    }
  } else {
    stopFullscreenPolling();
    stopSimLoop({ hide: true });
  }
}

function getSettingsWin() {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.focus(); return settingsWin; }
  settingsWin = new BrowserWindow({
    width: 420, height: 760, resizable: false, title: "PokéFollower 設定",
    webPreferences: {
      preload: path.join(__dirname, "..", "settings", "settings-preload.js"),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
  settingsWin.setMenuBarVisibility(false);
  hardenRendererNavigation(settingsWin);
  settingsWin.loadFile(path.join(__dirname, "..", "settings", "settings.html"));
  return settingsWin;
}

function isSettingsSender(event) {
  return !!settingsWin && !settingsWin.isDestroyed() && event.sender === settingsWin.webContents;
}

function requireSettingsSender(event) {
  if (!isSettingsSender(event)) throw new Error("unauthorized settings IPC sender");
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

function publishWorkWatchEvent(event) {
  if (!notificationCompanion) return;
  if (event === "break-started") {
    notificationCompanion.publish({
      source: "作業見守り",
      title: "休憩時間です",
      body: "少し離れて、目と肩を休ませましょう",
    }, { force: true });
  } else if (event === "work-started") {
    notificationCompanion.publish({
      source: "作業見守り",
      title: "作業を再開します",
      body: "ポケモンが静かに見守ります",
    }, { force: true });
  }
}

function stopWorkWatchTimer() {
  if (!workWatchTimer) return;
  clearInterval(workWatchTimer);
  workWatchTimer = null;
}

function startWorkWatchTimer() {
  if (workWatchTimer || !workWatchSession) return;
  workWatchTimer = setInterval(() => {
    const { event, state } = workWatchSession.tick(Date.now());
    if (event) publishWorkWatchEvent(event);
    if (event) syncReactionMode();
    if (!state.running) stopWorkWatchTimer();
  }, 1000);
}

function syncWorkWatchConfig() {
  if (!workWatchSession || !settingsStore) return;
  workWatchSession.setPreset(settingsStore.get("workWatchPreset"));
  if (!settingsStore.get("workWatchEnabled")) {
    workWatchSession.stop();
    stopWorkWatchTimer();
  }
  syncReactionMode();
}

function stopFavoriteRotation() {
  if (!favoriteRotationTimer) return;
  clearInterval(favoriteRotationTimer);
  favoriteRotationTimer = null;
}

function advanceFavoritePack() {
  if (!settingsStore) return null;
  const settings = settingsStore.getAll();
  const nextPack = nextFavoritePack(settings.pack, settings.favoritePacks);
  if (!nextPack || nextPack === settings.pack) return settings.pack;
  return switchPack(nextPack);
}

function syncFavoriteRotation() {
  stopFavoriteRotation();
  if (!settingsStore) return;
  const settings = settingsStore.getAll();
  if (!settings.rotationEnabled || settings.favoritePacks.length < 2) return;
  favoriteRotationTimer = setInterval(advanceFavoritePack, settings.rotationIntervalMinutes * 60 * 1000);
}

function saveFavoritePacks(favoritePacks) {
  if (!settingsStore) return [];
  const next = settingsStore.set({ favoritePacks });
  syncFavoriteRotation();
  return next.favoritePacks;
}

ipcMain.handle("settings:get", (event) => {
  requireSettingsSender(event);
  return settingsStore.getAll();
});
ipcMain.handle("packs:list", (event) => {
  requireSettingsSender(event);
  return packReader.readPackList();
});
ipcMain.handle("packs:search-metadata", (event) => {
  requireSettingsSender(event);
  return packReader.readSearchMetadata();
});
ipcMain.handle("packs:meta", (event, packKey) => {
  requireSettingsSender(event);
  try { return packReader.readPackMeta(packKey); }
  catch (_) { return null; }
});
ipcMain.handle("nickname:set", (event, payload) => {
  requireSettingsSender(event);
  const packKey = payload && payload.packKey;
  if (typeof packKey !== "string" || !packKey) return settingsStore.getAll();
  const name = payload && payload.name;
  const nicknames = { ...(settingsStore.get("nicknames") || {}) };
  if (typeof name === "string" && name.trim()) nicknames[packKey] = name;
  else delete nicknames[packKey];
  return settingsStore.set({ nicknames });
});
ipcMain.handle("party:set-lead", async (event, packKey) => {
  requireSettingsSender(event);
  const partyMjsUrl = pathToFileURL(path.join(__dirname, "..", "settings", "party.mjs")).href;
  const { setLead } = await import(partyMjsUrl);
  const party = setLead(settingsStore.get("favoritePacks"), packKey);
  settingsStore.set({ favoritePacks: party });
  applySettingsPatch({ pack: packKey }, { settingsStore, sim, loadPackIntoSim, setEnabled, refreshTrayMenu, syncFavoriteRotation });
  return settingsStore.getAll();
});
ipcMain.handle("companion:test-notification", (event) => {
  requireSettingsSender(event);
  return notificationCompanion.publish({
    source: "PokéFollower",
    title: "通知コンパニオン",
    body: "ポケモンが要約通知を届けます",
  });
});
ipcMain.handle("work-watch:start", (event) => {
  requireSettingsSender(event);
  settingsStore.set({ workWatchEnabled: true });
  syncWorkWatchConfig();
  const state = workWatchSession.start(Date.now());
  syncReactionMode();
  startWorkWatchTimer();
  return state;
});
ipcMain.handle("work-watch:stop", (event) => {
  requireSettingsSender(event);
  const state = workWatchSession.stop();
  stopWorkWatchTimer();
  syncReactionMode();
  return state;
});
ipcMain.handle("work-watch:reset", (event) => {
  requireSettingsSender(event);
  const state = workWatchSession.stop();
  stopWorkWatchTimer();
  syncReactionMode();
  return state;
});
ipcMain.handle("favorites:next", (event) => {
  requireSettingsSender(event);
  return advanceFavoritePack();
});
ipcMain.handle("favorites:add", (event, packKey) => {
  requireSettingsSender(event);
  const targetPack = packKey || settingsStore.get("pack");
  return saveFavoritePacks(addFavoritePack(targetPack, settingsStore.get("favoritePacks")));
});
ipcMain.handle("favorites:remove", (event, packKey) => {
  requireSettingsSender(event);
  const targetPack = packKey || settingsStore.get("pack");
  return saveFavoritePacks(removeFavoritePack(targetPack, settingsStore.get("favoritePacks")));
});
ipcMain.handle("codex-pet:export-current", async (event, packKey) => {
  requireSettingsSender(event);
  const result = await exportCodexPet({
    BrowserWindow,
    root: ROOT,
    packReader,
    packKey: packKey || settingsStore.get("pack"),
  });
  if (notificationCompanion) {
    notificationCompanion.publish({
      source: "PokéFollower",
      title: "Codex pet",
      body: `${result.displayName} を書き出しました`,
    }, { force: true });
  }
  return result;
});
ipcMain.on("settings:set", (event, patch) => {
  if (!isSettingsSender(event)) return;
  applySettingsPatch(patch, { settingsStore, sim, loadPackIntoSim, setEnabled, refreshTrayMenu, syncFavoriteRotation });
  if (codexNotificationWatcher) codexNotificationWatcher.sync();
  syncWorkWatchConfig();
});

// 二重起動を禁止（複数インスタンスが同時にカーソルを追って競合するのを防ぐ）。
const gotSingleInstanceLock = app.requestSingleInstanceLock();

app.whenReady().then(() => {
  if (!gotSingleInstanceLock) { app.quit(); return; }
  settingsStore = createSettingsStore(path.join(getUserDataPath(), "settings.json"));
  notificationCompanion = createNotificationCompanion({
    isEnabled: () => !!settingsStore.get("notificationCompanionEnabled"),
    getOverlays: () => overlays,
    isSuppressed: () => !enabled || fullscreenActive || currentReactionMode === "busy",
  });
  codexNotificationWatcher = createCodexNotificationWatcher({
    queuePath: defaultNotificationQueuePath(),
    getSettings: () => settingsStore.getAll(),
    publish: (notification) => notificationCompanion.publish(notification),
  });
  workWatchSession = createWorkWatchSession({ preset: settingsStore.get("workWatchPreset") });
  const s = settingsStore.getAll();
  // 自動起動はインストール版のみ登録（開発起動でRunキーにゴミをためないようisPackagedで限定）
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true });

  registerPermissionGuards();
  registerAppProtocol();
  sim.setConfig({
    vcp1_scale: s.scale,
    vcp1_offset: s.offset,
    vcp1_lerp: s.lerp,
    vcp1_edgeRest: s.edgeRest,
    vcp1_avoidCursor: s.avoidCursor,
    vcp1_avoidCursorStrength: s.avoidCursorStrength,
    vcp1_personality: s.personality,
    vcp1_mode: s.mode,
    vcp1_reactionMode: currentReactionMode,
  });
  try { loadPackIntoSim(s.pack); }
  catch (_) { try { loadPackIntoSim("retro/gen-1/009-blastoise"); } catch (_e) { /* noop */ } }

  buildOverlays();
  // ディスプレイ構成が変わったら窓を作り直す（グローバル座標のシムはそのまま）
  screen.on("display-added", scheduleBuildOverlays);
  screen.on("display-removed", scheduleBuildOverlays);
  screen.on("display-metrics-changed", scheduleBuildOverlays);
  powerMonitor.on("on-ac", refreshSimLoopInterval);
  powerMonitor.on("on-battery", refreshSimLoopInterval);

  setEnabled(s.enabled);
  syncFavoriteRotation();
  codexNotificationWatcher.sync();
  buildTray();
});

app.on("window-all-closed", () => {
  // トレイ常駐のため終了しない（「終了」メニューでのみ quit）
});

app.on("before-quit", () => {
  if (codexNotificationWatcher) codexNotificationWatcher.stop();
  stopFavoriteRotation();
});

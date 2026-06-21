const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const main = fs.readFileSync(path.join(root, "src", "main", "main.js"), "utf8");
const settingsPatch = fs.readFileSync(path.join(root, "src", "main", "settings-patch.js"), "utf8");
const errors = [];

function expect(condition, message) {
  if (!condition) errors.push(message);
}

function extractFunctionBody(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  if (start < 0) return "";
  const braceStart = source.indexOf("{", start);
  let depth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}") depth -= 1;
    if (depth === 0) return source.slice(braceStart, i + 1);
  }
  return "";
}

const buildOverlays = extractFunctionBody(main, "buildOverlays");
const broadcastFrame = extractFunctionBody(main, "broadcastFrame");
const createOverlayWindow = extractFunctionBody(main, "createOverlayWindow");
const sendFrameToOverlay = extractFunctionBody(main, "sendFrameToOverlay");
const loadPackIntoSim = extractFunctionBody(main, "loadPackIntoSim");
const runSimFrame = extractFunctionBody(main, "runSimFrame") || extractFunctionBody(main, "startSimLoop");

expect(/const \{ frameForOverlay, frameKey \} = require\("\.\/frame-routing\.js"\);/.test(main), "main.js must use frame-routing helpers");
expect(/visible: false/.test(buildOverlays), "new overlay records must start hidden");
expect(/lastFrameKey: "hidden"/.test(buildOverlays), "new overlay records must start with a hidden frame key");
expect(/let lastRender = null;/.test(main), "main.js must remember the last rendered frame for newly loaded overlays");
expect(/sendFrameToOverlay\(overlay, lastRender, true\)/.test(createOverlayWindow), "overlay load must force-send the latest frame after meta");
expect(/frameForOverlay\(render, o\.bounds, currentMeta\)/.test(sendFrameToOverlay), "sendFrameToOverlay must compute per-overlay frame routing");
expect(/if \(!o\.win \|\| o\.win\.isDestroyed\(\)\) return;/.test(sendFrameToOverlay), "sendFrameToOverlay must skip destroyed overlays");
expect(/if \(!frame\.visible\)/.test(sendFrameToOverlay), "sendFrameToOverlay must branch on invisible frames");
expect(/if \(force \|\| o\.visible\) \{[\s\S]*?webContents\.send\("frame", frame\)[\s\S]*?o\.visible = false;[\s\S]*?\}/.test(sendFrameToOverlay), "sendFrameToOverlay must force-send hide frames for newly loaded overlays");
expect(/o\.lastFrameKey = "hidden";/.test(sendFrameToOverlay), "sendFrameToOverlay must reset frame cache on hide");
expect(/return;/.test(sendFrameToOverlay), "sendFrameToOverlay must return after invisible-frame handling");
expect(/const nextFrameKey = frameKey\(frame\);/.test(sendFrameToOverlay), "sendFrameToOverlay must compute a stable visible frame key");
expect(/if \(!force && o\.visible && o\.lastFrameKey === nextFrameKey\) return;/.test(sendFrameToOverlay), "sendFrameToOverlay must skip duplicate visible frames unless forced");
expect(/webContents\.send\("frame", frame\);[\s\S]*?o\.visible = true;/.test(sendFrameToOverlay), "sendFrameToOverlay must send visible frames and mark overlay visible");
expect(/o\.lastFrameKey = nextFrameKey;/.test(sendFrameToOverlay), "sendFrameToOverlay must remember the last visible frame key");
expect(/lastRender = render;/.test(broadcastFrame), "broadcastFrame must cache the latest render for overlay load replay");
expect(/sendFrameToOverlay\(o, render\)/.test(broadcastFrame), "broadcastFrame must route frames through sendFrameToOverlay");
expect(/webContents\.send\("meta", meta\)/.test(loadPackIntoSim), "loadPackIntoSim must broadcast meta to existing overlays");
expect(/if \(!enabled \|\| fullscreenActive\) \{ broadcastFrame\(null\); return; \}/.test(runSimFrame), "sim loop must hide overlays when disabled or fullscreen-active");
expect(
  runSimFrame.indexOf("if (!enabled || fullscreenActive)") < runSimFrame.indexOf("screen.getCursorScreenPoint()"),
  "sim loop must avoid cursor polling while disabled or fullscreen-active",
);
expect(/function stopSimLoop\(\{ hide = false \} = \{\}\)/.test(main), "main.js must define a stoppable sim loop helper");
expect(/if \(fullscreenActive\) \{[\s\S]*stopSimLoop\(\{ hide: true \}\)/.test(main), "fullscreen suppression must stop the sim loop instead of ticking hidden frames");
expect(/else if \(enabled\) \{[\s\S]*startSimLoop\(\);[\s\S]*runSimFrame\(\);/.test(main), "fullscreen exit must restart the sim loop and publish a fresh frame");
expect(/const \{ applySettingsPatch \} = require\("\.\/settings-patch\.js"\);/.test(main), "main.js must route settings IPC through settings-patch helper");
expect(/function isSettingsSender\(event\) \{[\s\S]*event\.sender === settingsWin\.webContents[\s\S]*\}/.test(main), "main.js must bind settings IPC to the settings window webContents");
expect(/function requireSettingsSender\(event\) \{[\s\S]*throw new Error\("unauthorized settings IPC sender"\)[\s\S]*\}/.test(main), "main.js must reject unauthorized settings invoke senders");
expect(/ipcMain\.handle\("settings:get", \(event\) => \{[\s\S]*requireSettingsSender\(event\)[\s\S]*settingsStore\.getAll\(\)/.test(main), "settings:get IPC must require the settings window sender");
expect(/ipcMain\.handle\("packs:list", \(event\) => \{[\s\S]*requireSettingsSender\(event\)[\s\S]*packReader\.readPackList\(\)/.test(main), "packs:list IPC must require the settings window sender");
expect(/ipcMain\.on\("settings:set", \(event, patch\) => \{[\s\S]*if \(!isSettingsSender\(event\)\) return;[\s\S]*applySettingsPatch\(patch/.test(main), "settings:set IPC must guard sender and call applySettingsPatch");
expect(/const safePatch = sanitize\(patch\);/.test(settingsPatch), "settings patch handling must sanitize renderer input first");
expect(/Object\.keys\(safePatch\)\.length === 0/.test(settingsPatch), "settings patch handling must ignore empty sanitized patches");
expect(!/"scale" in patch/.test(main), "settings:set IPC must not inspect raw renderer patch with in-operator");

if (errors.length > 0) {
  for (const error of errors) console.error(`[verify-ipc-routing] ${error}`);
  process.exit(1);
}

console.log("[verify-ipc-routing] ok: frame IPC routing and hide-transition invariants are present");

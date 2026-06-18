const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const main = fs.readFileSync(path.join(root, "src", "main", "main.js"), "utf8");
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
const loadPackIntoSim = extractFunctionBody(main, "loadPackIntoSim");
const runSimFrame = extractFunctionBody(main, "runSimFrame") || extractFunctionBody(main, "startSimLoop");

expect(/const \{ frameForOverlay \} = require\("\.\/frame-routing\.js"\);/.test(main), "main.js must use frame-routing helper");
expect(/visible: false/.test(buildOverlays), "new overlay records must start hidden");
expect(/frameForOverlay\(render, o\.bounds, currentMeta\)/.test(broadcastFrame), "broadcastFrame must compute per-overlay frame routing");
expect(/if \(!o\.win \|\| o\.win\.isDestroyed\(\)\) continue;/.test(broadcastFrame), "broadcastFrame must skip destroyed overlays");
expect(/if \(!frame\.visible\)/.test(broadcastFrame), "broadcastFrame must branch on invisible frames");
expect(/if \(o\.visible\) \{[\s\S]*?webContents\.send\("frame", frame\)[\s\S]*?o\.visible = false;[\s\S]*?\}/.test(broadcastFrame), "broadcastFrame must send a hide frame only on visible->hidden transition");
expect(/continue;/.test(broadcastFrame), "broadcastFrame must continue after invisible-frame handling");
expect(/webContents\.send\("frame", frame\);[\s\S]*?o\.visible = true;/.test(broadcastFrame), "broadcastFrame must send visible frames and mark overlay visible");
expect(/webContents\.send\("meta", meta\)/.test(loadPackIntoSim), "loadPackIntoSim must broadcast meta to existing overlays");
expect(/if \(!enabled \|\| fullscreenActive\) \{ broadcastFrame\(null\); return; \}/.test(runSimFrame), "sim loop must hide overlays when disabled or fullscreen-active");
expect(
  runSimFrame.indexOf("if (!enabled || fullscreenActive)") < runSimFrame.indexOf("screen.getCursorScreenPoint()"),
  "sim loop must avoid cursor polling while disabled or fullscreen-active",
);

if (errors.length > 0) {
  for (const error of errors) console.error(`[verify-ipc-routing] ${error}`);
  process.exit(1);
}

console.log("[verify-ipc-routing] ok: frame IPC routing and hide-transition invariants are present");

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const main = fs.readFileSync(path.join(root, "src", "main", "main.js"), "utf8");
const sim = fs.readFileSync(path.join(root, "src", "main", "follower-sim.js"), "utf8");
const settingsUi = fs.readFileSync(path.join(root, "src", "settings", "settings.js"), "utf8");
const { DEFAULTS } = require(path.join(root, "src", "main", "settings-store.js"));
const errors = [];

function expect(condition, message) {
  if (!condition) errors.push(message);
}

const lockIndex = main.indexOf("app.requestSingleInstanceLock()");
const readyIndex = main.indexOf("app.whenReady()");
expect(lockIndex >= 0, "main.js must request a single instance lock");
expect(readyIndex >= 0, "main.js must register app.whenReady()");
expect(lockIndex >= 0 && readyIndex >= 0 && lockIndex < readyIndex, "single instance lock must be requested before app.whenReady()");
expect(
  /if \(!gotSingleInstanceLock\) \{ app\.quit\(\); return; \}/.test(main),
  "main.js must quit before creating windows when the single instance lock is missing",
);
expect(
  /if \(app\.isPackaged\) app\.setLoginItemSettings\(\{ openAtLogin: true \}\);/.test(main),
  "startup registration must stay gated behind app.isPackaged",
);
expect(
  /screen\.on\("display-added", buildOverlays\)/.test(main) &&
    /screen\.on\("display-removed", buildOverlays\)/.test(main) &&
    /screen\.on\("display-metrics-changed", buildOverlays\)/.test(main),
  "main.js must rebuild overlays for display add/remove/metrics changes",
);
expect(/const SIM_INTERVAL_MS = 8;/.test(main), "main.js must keep the current 8ms sim interval explicit");
expect(DEFAULTS.offset === 70, "settings-store DEFAULTS.offset must be 70");
expect(/offset: 70/.test(sim), "follower-sim default offset must be 70");
expect(/vcp1_offset: 70/.test(settingsUi), "settings UI default offset must be 70");
expect(
  /settingsStore = createSettingsStore\(path\.join\(app\.getPath\("userData"\), "settings\.json"\)\)/.test(main),
  "settings must be loaded from Electron userData/settings.json",
);

if (errors.length > 0) {
  for (const error of errors) console.error(`[verify-runtime-guards] ${error}`);
  process.exit(1);
}

console.log("[verify-runtime-guards] ok: startup guards, display rebuild hooks, and offset defaults are consistent");

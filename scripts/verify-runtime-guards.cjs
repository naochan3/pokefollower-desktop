const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const main = fs.readFileSync(path.join(root, "src", "main", "main.js"), "utf8");
const sim = fs.readFileSync(path.join(root, "src", "main", "follower-sim.js"), "utf8");
const settingsUi = fs.readFileSync(path.join(root, "src", "settings", "settings.js"), "utf8");
const { DEFAULTS } = require(path.join(root, "src", "main", "settings-store.js"));
const simLoopConfig = require(path.join(root, "src", "main", "sim-loop-config.js"));
const appReactions = fs.readFileSync(path.join(root, "src", "main", "app-reactions.js"), "utf8");
const errors = [];

function expect(condition, message) {
  if (!condition) errors.push(message);
}

const readyBlock = main.slice(main.indexOf("app.whenReady().then(() => {"));

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
  /screen\.on\("display-added", scheduleBuildOverlays\)/.test(main) &&
    /screen\.on\("display-removed", scheduleBuildOverlays\)/.test(main) &&
    /screen\.on\("display-metrics-changed", scheduleBuildOverlays\)/.test(main),
  "main.js must schedule overlay rebuilds for display add/remove/metrics changes",
);
expect(/const DISPLAY_REBUILD_DEBOUNCE_MS = 250;/.test(main), "display rebuild debounce must stay at 250ms");
expect(/function scheduleBuildOverlays\(\)/.test(main), "main.js must define scheduleBuildOverlays");
expect(/clearTimeout\(displayRebuildTimer\)/.test(main), "display rebuild scheduler must coalesce rapid display events");
expect(/setTimeout\(\(\) => \{[\s\S]*buildOverlays\(\);[\s\S]*\}, DISPLAY_REBUILD_DEBOUNCE_MS\)/.test(main), "display rebuild scheduler must rebuild overlays after debounce");
expect(/const FULLSCREEN_POLL_INTERVAL_MS = process\.platform === "win32" \? 600 : 2000;/.test(main), "fullscreen polling must keep fast Win32 checks and slower external-command checks elsewhere");
expect(/let fullscreenTimer = null;/.test(main), "main.js must track fullscreen polling timer");
expect(/let fullscreenCheckInFlight = false;/.test(main), "main.js must prevent overlapping async fullscreen checks");
expect(/function applyFullscreenInfo\(info\)/.test(main), "main.js must separate fullscreen result application from polling");
expect(/typeof info\.then !== "function"/.test(main), "main.js must support synchronous Win32 fullscreen checks");
expect(/fullscreenCheckInFlight = true;[\s\S]*\.finally\(\(\) => \{[\s\S]*fullscreenCheckInFlight = false;/.test(main), "main.js must release async fullscreen in-flight state");
expect(/function startFullscreenPolling\(\)/.test(main), "main.js must define startFullscreenPolling");
expect(/function stopFullscreenPolling\(\)/.test(main), "main.js must define stopFullscreenPolling");
expect(/function stopSimLoop\(\{ hide = false \} = \{\}\)/.test(main), "main.js must define a stoppable sim loop helper");
expect(/fullscreenTimer = setInterval\(checkFullscreen, FULLSCREEN_POLL_INTERVAL_MS\)/.test(main), "fullscreen polling must use a tracked interval");
expect(/clearInterval\(fullscreenTimer\)/.test(main), "fullscreen polling must be stoppable");
expect(/clearInterval\(simTimer\)/.test(main), "sim loop must be stoppable while disabled or fullscreen-suppressed");
expect(!/setInterval\(checkFullscreen, 600\)/.test(main), "main.js must not leave fullscreen polling as an untracked always-on interval");
expect(/if \(enabled\) \{[\s\S]*startFullscreenPolling\(\)/.test(main), "setEnabled(true) must start fullscreen polling");
expect(/sim\.resetTo\(c\.x, c\.y, Date\.now\(\)\);[\s\S]*startSimLoop\(\);[\s\S]*runSimFrame\(\);/.test(main), "setEnabled(true) must start the sim loop and publish the first sim frame immediately");
expect(/else \{[\s\S]*stopFullscreenPolling\(\)/.test(main), "setEnabled(false) must stop fullscreen polling");
expect(/else \{[\s\S]*stopFullscreenPolling\(\);[\s\S]*stopSimLoop\(\{ hide: true \}\)/.test(main), "setEnabled(false) must stop the sim loop and hide overlays");
expect(!/startSimLoop\(\);[\s\S]*setEnabled\(s\.enabled\)/.test(readyBlock), "startup must not start the sim loop before reading the saved enabled state");
expect(/powerMonitor/.test(main), "main.js must use powerMonitor for AC/battery interval changes");
expect(/getSimIntervalMs\(\{ isOnBattery: readBatteryState\(\) \}\)/.test(main), "main.js must use sim-loop-config for interval selection");
expect(/powerMonitor\.on\("on-ac", refreshSimLoopInterval\)/.test(main), "main.js must refresh sim interval on AC power");
expect(/powerMonitor\.on\("on-battery", refreshSimLoopInterval\)/.test(main), "main.js must refresh sim interval on battery power");
expect(simLoopConfig.DEFAULT_AC_INTERVAL_MS === 16, "AC sim interval must default to 16ms");
expect(simLoopConfig.DEFAULT_BATTERY_INTERVAL_MS === 16, "battery sim interval must default to 16ms");
expect(simLoopConfig.getSimIntervalMs({ env: { POKEFOLLOWER_SIM_INTERVAL_MS: "8" }, isOnBattery: false }) === 8, "8ms sim interval override must work");
expect(simLoopConfig.getSimIntervalMs({ env: { POKEFOLLOWER_SIM_INTERVAL_MS: "12" }, isOnBattery: true }) === 12, "sim interval env override must work");
expect(DEFAULTS.offset === 70, "settings-store DEFAULTS.offset must be 70");
expect(/offset: 70/.test(sim), "follower-sim default offset must be 70");
expect(/vcp1_offset: 70/.test(settingsUi), "settings UI default offset must be 70");
expect(
  /createCodexNotificationWatcher/.test(main) &&
    /codexNotificationWatcher\.sync\(\)/.test(main) &&
    /codexNotificationWatcher\.stop\(\)/.test(main),
  "Codex notification watcher must sync with settings and stop before quit",
);
expect(/reactionModeForForeground/.test(main), "main.js must derive app/work-watch reaction mode from foreground context");
expect(/workWatchPhase\(\)/.test(main), "main.js must let work watch override app reaction mode");
expect(/vcp1_reactionMode/.test(sim), "follower-sim must accept runtime reaction mode");
expect(/classifyForegroundApp/.test(appReactions), "app-reactions must expose a pure foreground classifier");
expect(
  /function getUserDataPath\(\)/.test(main) &&
    /process\.env\.POKEFOLLOWER_ALLOW_TEST_USER_DATA === "1"/.test(main) &&
    /process\.env\.POKEFOLLOWER_TEST_USER_DATA_DIR/.test(main) &&
    /process\.env\.TEMP \|\| process\.env\.TMPDIR \|\| process\.env\.TMP/.test(main) &&
    /testUserDataPath\.startsWith\(testRoot \+ path\.sep\)/.test(main) &&
    /!app\.isPackaged && process\.env\.PF_DEV_USER_DATA_DIR/.test(main) &&
    /return app\.getPath\("userData"\);/.test(main),
  "main.js must keep explicit test userData overrides and the development-only userData override",
);
expect(
  /settingsStore = createSettingsStore\(path\.join\(getUserDataPath\(\), "settings\.json"\)\)/.test(main),
  "settings must be loaded from the resolved Electron userData/settings.json",
);
expect(
  /const s = settingsStore\.getAll\(\);[\s\S]*sim\.setConfig\(\{[\s\S]*vcp1_scale: s\.scale,[\s\S]*vcp1_offset: s\.offset,[\s\S]*vcp1_lerp: s\.lerp,[\s\S]*vcp1_mode: s\.mode,[\s\S]*\}\);[\s\S]*loadPackIntoSim\(s\.pack\)/.test(main),
  "startup must restore the last saved Pokemon pack from settings before creating overlays",
);
expect(
  /catch \(_\) \{ try \{ loadPackIntoSim\("retro\/gen-1\/009-blastoise"\); \}/.test(main),
  "startup must fall back to Blastoise only when the saved Pokemon pack cannot be loaded",
);

if (errors.length > 0) {
  for (const error of errors) console.error(`[verify-runtime-guards] ${error}`);
  process.exit(1);
}

console.log("[verify-runtime-guards] ok: startup guards, display rebuild hooks, and offset defaults are consistent");

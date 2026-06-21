const { execFileSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.join(__dirname, "..");
const appPath = process.env.PF_LINUX_GUI_EXE || path.join(root, "release", "linux-unpacked", "pokefollower-desktop");
const pack = process.env.PF_LINUX_GUI_PACK || "retro/gen-1/025-pikachu";
const warmupMs = Number(process.env.PF_LINUX_GUI_WARMUP_MS || 8000);
const extraArgs = (process.env.PF_LINUX_GUI_ARGS || "")
  .split(/\s+/)
  .map((arg) => arg.trim())
  .filter(Boolean);
const evidenceDir = process.env.PF_LINUX_GUI_EVIDENCE_DIR || fs.mkdtempSync(path.join(os.tmpdir(), "pf-linux-gui-evidence-"));

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sh(command, args = [], options = {}) {
  return execFileSync(command, args, { encoding: "utf8", ...options }).trim();
}

function trySh(command, args = [], options = {}) {
  try {
    return { ok: true, stdout: sh(command, args, options) };
  } catch (error) {
    return { ok: false, stdout: "", error: String(error.message || error) };
  }
}

function hasCommand(command) {
  return trySh("sh", ["-lc", `command -v ${command}`]).ok;
}

function getProcesses() {
  const output = sh("ps", ["-axo", "pid=,ppid=,pcpu=,rss=,comm=,command="]);
  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^\s*(\d+)\s+(\d+)\s+([\d.]+)\s+(\d+)\s+(\S+)\s+(.*)$/);
      if (!match) return null;
      return {
        pid: Number(match[1]),
        ppid: Number(match[2]),
        cpuPercent: Number(match[3]) || 0,
        rssKb: Number(match[4]) || 0,
        commandName: path.basename(match[5]),
        command: match[6] || "",
      };
    })
    .filter(Boolean);
}

function descendantPids(processes, rootPid) {
  const children = new Map();
  for (const proc of processes) {
    if (!children.has(proc.ppid)) children.set(proc.ppid, []);
    children.get(proc.ppid).push(proc.pid);
  }
  const seen = new Set();
  const stack = [rootPid];
  while (stack.length > 0) {
    const pid = stack.pop();
    if (seen.has(pid)) continue;
    seen.add(pid);
    for (const child of children.get(pid) || []) stack.push(child);
  }
  return seen;
}

function getMatchingProcesses(rootPid, userDataDir) {
  const processes = getProcesses();
  const descendants = descendantPids(processes, rootPid);
  const normalizedAppPath = appPath.toLowerCase();
  const normalizedUserDataDir = userDataDir.toLowerCase();
  return processes.filter((proc) => {
    const command = String(proc.command || "").toLowerCase();
    return descendants.has(proc.pid) || command.includes(normalizedAppPath) || command.includes(normalizedUserDataDir);
  });
}

function stopProcesses(pids, signal = "SIGTERM") {
  const targets = [...new Set(pids)].filter((pid) => pid && pid !== process.pid);
  if (targets.length === 0) return;
  try {
    execFileSync("kill", [`-${signal.replace(/^SIG/, "")}`, ...targets.map(String)], { stdio: "ignore" });
  } catch (_) {
    // The app can exit while cleanup is running.
  }
}

async function cleanupApp(rootPid, userDataDir) {
  let matches = getMatchingProcesses(rootPid, userDataDir);
  stopProcesses(matches.map((row) => row.pid), "SIGTERM");
  await sleep(1000);
  matches = getMatchingProcesses(rootPid, userDataDir);
  if (matches.length > 0) {
    stopProcesses(matches.map((row) => row.pid), "SIGKILL");
    await sleep(500);
  }
  return getMatchingProcesses(rootPid, userDataDir);
}

function probeX11Windows(processes) {
  const tools = {
    xdotool: hasCommand("xdotool"),
    xwininfo: hasCommand("xwininfo"),
    xprop: hasCommand("xprop"),
  };
  const windows = [];
  if (!process.env.DISPLAY || !tools.xdotool) return { tools, windows, reason: "DISPLAY or xdotool unavailable" };

  const windowIds = new Set();
  for (const proc of processes) {
    const result = trySh("xdotool", ["search", "--pid", String(proc.pid)]);
    if (!result.ok) continue;
    for (const line of result.stdout.split(/\r?\n/).filter(Boolean)) windowIds.add(line.trim());
  }

  for (const id of windowIds) {
    const xwininfo = tools.xwininfo ? trySh("xwininfo", ["-id", id]).stdout : "";
    const xprop = tools.xprop ? trySh("xprop", ["-id", id]).stdout : "";
    const viewable = /Map State:\s+IsViewable/.test(xwininfo);
    const overrideRedirect = /Override Redirect State:\s+yes/.test(xwininfo);
    const depth = (xwininfo.match(/Depth:\s+(\d+)/) || [])[1] || "";
    const geometry = {
      x: Number((xwininfo.match(/Absolute upper-left X:\s+(-?\d+)/) || [])[1]),
      y: Number((xwininfo.match(/Absolute upper-left Y:\s+(-?\d+)/) || [])[1]),
      width: Number((xwininfo.match(/Width:\s+(\d+)/) || [])[1]),
      height: Number((xwininfo.match(/Height:\s+(\d+)/) || [])[1]),
    };
    windows.push({
      id,
      viewable,
      overrideRedirect,
      depth,
      geometry,
      wmClass: (xprop.match(/WM_CLASS\(STRING\) = (.*)/) || [])[1] || "",
      wmName: (xprop.match(/WM_NAME\(STRING\) = (.*)/) || [])[1] || "",
    });
  }
  return { tools, windows, reason: "" };
}

function captureScreenshot(evidenceDir) {
  const targets = [
    { command: "gnome-screenshot", args: ["-f"] },
    { command: "grim", args: [] },
    { command: "spectacle", args: ["-b", "-n", "-o"] },
    { command: "scrot", args: [] },
  ];
  const attempts = [];
  for (const target of targets) {
    if (!hasCommand(target.command)) continue;
    const filePath = path.join(evidenceDir, `screen-${target.command}.png`);
    const args = target.command === "grim" || target.command === "scrot"
      ? [...target.args, filePath]
      : [...target.args, filePath];
    const result = trySh(target.command, args);
    if (result.ok && fs.existsSync(filePath) && fs.statSync(filePath).size > 0) {
      return { ok: true, command: target.command, filePath, attempts };
    }
    attempts.push({ command: target.command, ok: false, error: result.error || "screenshot file was not created" });
  }
  return {
    ok: false,
    command: "",
    filePath: "",
    error: attempts.length > 0 ? "all supported screenshot commands failed" : "no supported screenshot command found",
    attempts,
  };
}

async function main() {
  if (process.platform !== "linux") throw new Error("capture-linux-gui-evidence supports Linux only");
  if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    throw new Error("capture-linux-gui-evidence requires a GUI session; set DISPLAY or WAYLAND_DISPLAY");
  }
  if (!fs.existsSync(appPath)) {
    throw new Error(`Linux executable not found: ${appPath}; run npm run dist:linux -- --dir --publish=never first`);
  }
  fs.mkdirSync(evidenceDir, { recursive: true });
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pf-linux-gui-user-data-"));
  fs.writeFileSync(path.join(userDataDir, "settings.json"), JSON.stringify({ enabled: true, pack }, null, 2), "utf8");

  const resultPath = path.join(evidenceDir, "result.json");
  const processesPath = path.join(evidenceDir, "processes.json");
  const windowsPath = path.join(evidenceDir, "windows.json");
  const child = spawn(appPath, extraArgs, {
    cwd: path.dirname(appPath),
    stdio: "ignore",
    env: {
      ...process.env,
      POKEFOLLOWER_ALLOW_TEST_USER_DATA: "1",
      POKEFOLLOWER_TEST_USER_DATA_DIR: userDataDir,
    },
  });

  let processes = [];
  let leftovers = [];
  let windowProbe = { tools: {}, windows: [], reason: "" };
  let screenshot = { ok: false, command: "", filePath: "", error: "" };
  try {
    await sleep(warmupMs);
    processes = getMatchingProcesses(child.pid, userDataDir);
    windowProbe = probeX11Windows(processes);
    screenshot = captureScreenshot(evidenceDir);
  } finally {
    child.kill();
    leftovers = await cleanupApp(child.pid, userDataDir);
  }

  const viewableWindows = windowProbe.windows.filter((win) => win.viewable);
  const overlayLikeWindows = viewableWindows.filter((win) => win.overrideRedirect || win.depth === "32");
  const status = processes.length > 0 && (viewableWindows.length > 0 || screenshot.ok) ? "candidate" : "blocked";
  const result = {
    status,
    reason: status === "blocked"
      ? "Linux GUI evidence did not find enough process/window/screenshot data; do not treat this as visual PASS evidence"
      : "candidate evidence still requires human inspection before Issue #17 PASS",
    appPath,
    args: extraArgs,
    pack,
    warmupMs,
    evidenceDir,
    display: process.env.DISPLAY || "",
    waylandDisplay: process.env.WAYLAND_DISPLAY || "",
    desktopSession: process.env.XDG_SESSION_TYPE || "",
    processCount: processes.length,
    windowCount: windowProbe.windows.length,
    viewableWindowCount: viewableWindows.length,
    overlayLikeWindowCount: overlayLikeWindows.length,
    screenshot,
    tools: windowProbe.tools,
    leftoverProcessCount: leftovers.length,
  };
  fs.writeFileSync(processesPath, JSON.stringify({ processes, leftovers }, null, 2), "utf8");
  fs.writeFileSync(windowsPath, JSON.stringify(windowProbe, null, 2), "utf8");
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2), "utf8");
  fs.rmSync(userDataDir, { recursive: true, force: true });

  console.log(`[capture-linux-gui-evidence] status=${status}`);
  console.log(`[capture-linux-gui-evidence] result=${resultPath}`);
  if (screenshot.filePath) console.log(`[capture-linux-gui-evidence] screenshot=${screenshot.filePath}`);
  if (status !== "candidate") process.exitCode = 2;
}

main().catch((error) => {
  console.error(`[capture-linux-gui-evidence] ${error.stack || error.message}`);
  process.exit(1);
});

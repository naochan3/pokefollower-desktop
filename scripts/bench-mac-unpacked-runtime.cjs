const { spawn, execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.join(__dirname, "..");
const appPath = process.env.PF_MAC_UNPACKED_APP || path.join(root, "release", "mac-arm64", "PokeFollower.app");
const executablePath = path.join(appPath, "Contents", "MacOS", "PokeFollower");
const warmupMs = Number(process.env.PF_MAC_UNPACKED_WARMUP_MS || 12000);
const sampleMs = Number(process.env.PF_MAC_UNPACKED_SAMPLE_MS || 30000);
const sampleIntervalMs = Number(process.env.PF_MAC_UNPACKED_SAMPLE_INTERVAL_MS || 1000);
const modes = (process.env.PF_MAC_UNPACKED_MODES || "enabled")
  .split(",")
  .map((mode) => mode.trim().toLowerCase())
  .flatMap((mode) => (mode === "both" ? ["enabled", "disabled"] : [mode]))
  .filter(Boolean);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sh(command, args = []) {
  return execFileSync(command, args, { encoding: "utf8" }).trim();
}

function getProcesses() {
  const output = sh("ps", ["-axo", "pid=,ppid=,pcpu=,rss=,comm=,command="]);
  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^\s*(\d+)\s+(\d+)\s+([\d.]+)\s+(\d+)\s+(\S+)\s+(.*)$/);
      if (!match) return null;
      const commandLine = match[6] || "";
      const rawName = path.basename(match[5]);
      const name = commandLine.includes("PokeFollower.app/Contents/MacOS/PokeFollower")
        ? "PokeFollower"
        : rawName;
      return {
        pid: Number(match[1]),
        ppid: Number(match[2]),
        cpuPercent: Number(match[3]) || 0,
        rssKb: Number(match[4]) || 0,
        name,
        commandLine,
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

function matchingPids(processes, rootPid, userDataDir) {
  const descendants = descendantPids(processes, rootPid);
  const normalizedAppPath = appPath.toLowerCase();
  const normalizedExecutablePath = executablePath.toLowerCase();
  const normalizedUserDataDir = userDataDir.toLowerCase();
  const matched = new Set(descendants);
  for (const proc of processes) {
    const commandLine = String(proc.commandLine || "").toLowerCase();
    if (
      commandLine.includes(normalizedAppPath) ||
      commandLine.includes(normalizedExecutablePath) ||
      commandLine.includes(normalizedUserDataDir)
    ) {
      matched.add(proc.pid);
    }
  }
  return matched;
}

function summarize(processes, pids) {
  const rows = processes.filter((proc) => pids.has(proc.pid));
  return {
    count: rows.length,
    cpuPercent: rows.reduce((acc, proc) => acc + (proc.cpuPercent || 0), 0),
    rssKb: rows.reduce((acc, proc) => acc + (proc.rssKb || 0), 0),
    rows: rows
      .map((proc) => ({
        pid: proc.pid,
        name: proc.name,
        cpuPercent: proc.cpuPercent || 0,
        rssKb: proc.rssKb || 0,
      }))
      .sort((a, b) => b.rssKb - a.rssKb),
  };
}

function stopProcesses(pids) {
  const list = [...pids].filter((pid) => pid !== process.pid);
  if (list.length === 0) return;
  try {
    spawn("kill", ["-TERM", ...list.map(String)], { stdio: "ignore" });
  } catch (_) {
    // The app can exit by itself while the benchmark is cleaning up.
  }
}

function enabledForMode(mode) {
  if (mode === "enabled") return true;
  if (mode === "disabled") return false;
  throw new Error(`unknown PF_MAC_UNPACKED_MODES entry: ${mode}`);
}

async function runMode(mode) {
  const enabled = enabledForMode(mode);
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), `pf-mac-runtime-${mode}-`));
  fs.writeFileSync(path.join(userDataDir, "settings.json"), JSON.stringify({ enabled }, null, 2), "utf8");
  const child = spawn(executablePath, [], {
    cwd: path.dirname(executablePath),
    stdio: "ignore",
    env: {
      ...process.env,
      POKEFOLLOWER_ALLOW_TEST_USER_DATA: "1",
      POKEFOLLOWER_TEST_USER_DATA_DIR: userDataDir,
    },
  });

  let trackedPids = new Set([child.pid]);
  try {
    await sleep(warmupMs);
    const firstProcesses = getProcesses();
    trackedPids = matchingPids(firstProcesses, child.pid, userDataDir);
    const before = summarize(firstProcesses, trackedPids);
    if (!before.rows.some((proc) => proc.name === "PokeFollower")) {
      throw new Error("PokeFollower process was not found; close any existing PokeFollower instance before benchmarking");
    }
    const sampleStarted = Date.now();
    const samples = [];
    while (Date.now() - sampleStarted < sampleMs) {
      await sleep(sampleIntervalMs);
      const processes = getProcesses();
      trackedPids = matchingPids(processes, child.pid, userDataDir);
      samples.push(summarize(processes, trackedPids));
    }
    const elapsedSeconds = Math.max(1, (Date.now() - sampleStarted) / 1000);
    const avgCpuPercent =
      samples.reduce((acc, sample) => acc + sample.cpuPercent, 0) / Math.max(1, samples.length);
    const maxCpuPercent = Math.max(...samples.map((sample) => sample.cpuPercent));
    const avgRssKb = samples.reduce((acc, sample) => acc + sample.rssKb, 0) / Math.max(1, samples.length);
    const maxRssKb = Math.max(...samples.map((sample) => sample.rssKb));
    const after = samples.at(-1) || before;
    const logicalCpuCount = os.cpus().length || 1;

    console.log(`[bench-mac-unpacked-runtime:${mode}] app: ${appPath}`);
    console.log(`[bench-mac-unpacked-runtime:${mode}] warmup: ${warmupMs}ms`);
    console.log(`[bench-mac-unpacked-runtime:${mode}] sample: ${elapsedSeconds.toFixed(3)}s`);
    console.log(`[bench-mac-unpacked-runtime:${mode}] initial enabled: ${enabled}`);
    console.log(`[bench-mac-unpacked-runtime:${mode}] tracked process count: ${after.count}`);
    console.log(`[bench-mac-unpacked-runtime:${mode}] logical CPUs: ${logicalCpuCount}`);
    console.log(`[bench-mac-unpacked-runtime:${mode}] avg ps cpu: ${avgCpuPercent.toFixed(3)}%`);
    console.log(`[bench-mac-unpacked-runtime:${mode}] max ps cpu: ${maxCpuPercent.toFixed(3)}%`);
    console.log(`[bench-mac-unpacked-runtime:${mode}] avg rss: ${(avgRssKb / 1024).toFixed(1)} MB`);
    console.log(`[bench-mac-unpacked-runtime:${mode}] max rss: ${(maxRssKb / 1024).toFixed(1)} MB`);
    for (const proc of after.rows.slice(0, 8)) {
      console.log(
        `[bench-mac-unpacked-runtime:${mode}] process ${proc.name} pid=${proc.pid} cpu=${proc.cpuPercent.toFixed(3)}% rss=${(proc.rssKb / 1024).toFixed(1)} MB`,
      );
    }
  } finally {
    stopProcesses(trackedPids);
    child.kill();
    await sleep(1000);
    const leftovers = summarize(getProcesses(), trackedPids);
    console.log(`[bench-mac-unpacked-runtime:${mode}] leftover tracked process count after cleanup: ${leftovers.count}`);
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

async function main() {
  if (process.platform !== "darwin") {
    throw new Error("bench-mac-unpacked-runtime currently supports macOS only");
  }
  if (!fs.existsSync(executablePath)) {
    throw new Error(`macOS app executable not found: ${executablePath}; run npm run dist:mac first`);
  }
  for (const mode of modes) await runMode(mode);
}

main().catch((error) => {
  console.error(`[bench-mac-unpacked-runtime] ${error.stack || error.message}`);
  process.exit(1);
});

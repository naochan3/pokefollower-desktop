const { execFileSync, spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");

const root = path.join(__dirname, "..");
const appPath = process.env.PF_MAC_GUI_APP || path.join(root, "release", "mac-arm64", "PokeFollower.app");
const executablePath = path.join(appPath, "Contents", "MacOS", "PokeFollower");
const pack = process.env.PF_MAC_GUI_PACK || "retro/gen-1/025-pikachu";
const warmupMs = Number(process.env.PF_MAC_GUI_WARMUP_MS || 8000);
const evidenceDir = process.env.PF_MAC_GUI_EVIDENCE_DIR || fs.mkdtempSync(path.join(os.tmpdir(), "pf-mac-gui-evidence-"));

function sh(command, args, options = {}) {
  return execFileSync(command, args, { encoding: "utf8", ...options }).trim();
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePngStats(filePath) {
  const data = fs.readFileSync(filePath);
  if (!data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error(`not a PNG file: ${filePath}`);
  }
  let pos = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (pos < data.length) {
    const len = data.readUInt32BE(pos);
    pos += 4;
    const type = data.subarray(pos, pos + 4).toString("ascii");
    pos += 4;
    const chunk = data.subarray(pos, pos + len);
    pos += len + 4;
    if (type === "IHDR") {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      bitDepth = chunk[8];
      colorType = chunk[9];
    } else if (type === "IDAT") {
      idat.push(chunk);
    }
  }
  if (bitDepth !== 8 || colorType !== 6) {
    throw new Error(`expected RGBA 8-bit PNG, got bitDepth=${bitDepth} colorType=${colorType}`);
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = width * bpp;
  let offset = 0;
  let prev = new Uint8Array(stride);
  let nonTransparent = 0;
  let nonBlack = 0;
  let bbox = null;
  const hash = new Uint32Array(Math.ceil((width * height) / 32));

  for (let y = 0; y < height; y += 1) {
    const filter = raw[offset];
    offset += 1;
    const scan = raw.subarray(offset, offset + stride);
    offset += stride;
    const recon = new Uint8Array(stride);
    for (let x = 0; x < stride; x += 1) {
      const left = x >= bpp ? recon[x - bpp] : 0;
      const up = prev[x];
      const upLeft = x >= bpp ? prev[x - bpp] : 0;
      let predict = 0;
      if (filter === 1) predict = left;
      else if (filter === 2) predict = up;
      else if (filter === 3) predict = Math.floor((left + up) / 2);
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        predict = pa <= pb && pa <= pc ? left : (pb <= pc ? up : upLeft);
      } else if (filter !== 0) {
        throw new Error(`unsupported PNG filter ${filter}`);
      }
      recon[x] = (scan[x] + predict) & 255;
    }
    for (let x = 0; x < width; x += 1) {
      const base = x * 4;
      const r = recon[base];
      const g = recon[base + 1];
      const b = recon[base + 2];
      const a = recon[base + 3];
      if (!a) continue;
      nonTransparent += 1;
      if (r !== 0 || g !== 0 || b !== 0) {
        nonBlack += 1;
        hash[Math.floor((y * width + x) / 32)] |= 1 << ((y * width + x) % 32);
        if (!bbox) bbox = { x1: x, y1: y, x2: x, y2: y };
        else {
          bbox.x1 = Math.min(bbox.x1, x);
          bbox.y1 = Math.min(bbox.y1, y);
          bbox.x2 = Math.max(bbox.x2, x);
          bbox.y2 = Math.max(bbox.y2, y);
        }
      }
    }
    prev = recon;
  }

  return { width, height, nonTransparent, nonBlack, bbox, hash };
}

function countChangedPixels(a, b) {
  if (a.width !== b.width || a.height !== b.height) return a.width * a.height;
  let changed = 0;
  const len = Math.max(a.hash.length, b.hash.length);
  for (let i = 0; i < len; i += 1) {
    let value = (a.hash[i] || 0) ^ (b.hash[i] || 0);
    while (value) {
      value &= value - 1;
      changed += 1;
    }
  }
  return changed;
}

function getMatchingProcesses(rootPid, userDataDir) {
  const output = sh("ps", ["-axo", "pid=,ppid=,pcpu=,rss=,comm=,command="]);
  const rows = output
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
        command: match[6] || "",
      };
    })
    .filter(Boolean);
  const children = new Map();
  for (const row of rows) {
    if (!children.has(row.ppid)) children.set(row.ppid, []);
    children.get(row.ppid).push(row.pid);
  }
  const descendants = new Set();
  const stack = [rootPid];
  while (stack.length > 0) {
    const pid = stack.pop();
    if (descendants.has(pid)) continue;
    descendants.add(pid);
    for (const child of children.get(pid) || []) stack.push(child);
  }
  const needleApp = appPath.toLowerCase();
  const needleData = userDataDir.toLowerCase();
  return rows.filter((row) => {
    const command = row.command.toLowerCase();
    return descendants.has(row.pid) || command.includes(needleApp) || command.includes(needleData);
  });
}

function stopProcesses(pids, signal = "SIGTERM") {
  const targets = [...new Set(pids)].filter((pid) => pid && pid !== process.pid);
  if (targets.length === 0) return;
  try {
    spawn("kill", [`-${signal.replace(/^SIG/, "")}`, ...targets.map(String)], { stdio: "ignore" });
  } catch (_) {
    // Processes can exit during cleanup.
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

async function main() {
  if (process.platform !== "darwin") throw new Error("capture-mac-gui-evidence supports macOS only");
  if (!fs.existsSync(executablePath)) {
    throw new Error(`macOS app executable not found: ${executablePath}; run npm run dist:mac -- --arm64 --dir --publish=never first`);
  }
  ensureDir(evidenceDir);
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pf-mac-gui-user-data-"));
  fs.writeFileSync(path.join(userDataDir, "settings.json"), JSON.stringify({ enabled: true, pack }, null, 2), "utf8");

  const baselineScreenshot = path.join(evidenceDir, "baseline-screen.png");
  const appScreenshot = path.join(evidenceDir, "app-screen.png");
  const processesPath = path.join(evidenceDir, "processes.json");
  const resultPath = path.join(evidenceDir, "result.json");

  sh("screencapture", ["-x", baselineScreenshot]);
  const baseline = parsePngStats(baselineScreenshot);

  const child = spawn(executablePath, [], {
    cwd: path.dirname(executablePath),
    stdio: "ignore",
    env: {
      ...process.env,
      POKEFOLLOWER_ALLOW_TEST_USER_DATA: "1",
      POKEFOLLOWER_TEST_USER_DATA_DIR: userDataDir,
    },
  });

  let processes = [];
  let leftovers = [];
  try {
    await sleep(warmupMs);
    processes = getMatchingProcesses(child.pid, userDataDir);
    sh("screencapture", ["-x", appScreenshot]);
  } finally {
    child.kill();
    leftovers = await cleanupApp(child.pid, userDataDir);
  }

  const appCapture = parsePngStats(appScreenshot);
  const changedPixels = countChangedPixels(baseline, appCapture);
  const totalPixels = appCapture.width * appCapture.height;
  const changedRatio = totalPixels > 0 ? changedPixels / totalPixels : 0;
  const visiblePixelRatio = totalPixels > 0 ? appCapture.nonBlack / totalPixels : 0;
  const status = changedRatio >= 0.001 && appCapture.nonBlack > 100 ? "candidate" : "blocked";
  const result = {
    status,
    reason: status === "blocked" ? "screencapture did not produce enough visible app pixels; do not treat this as visual PASS evidence" : "candidate screenshot still requires human inspection before Issue #17 PASS",
    appPath,
    pack,
    warmupMs,
    evidenceDir,
    baselineScreenshot,
    appScreenshot,
    baseline,
    appCapture,
    changedPixels,
    changedRatio,
    visiblePixelRatio,
    processCount: processes.length,
    leftoverProcessCount: leftovers.length,
  };
  delete result.baseline.hash;
  delete result.appCapture.hash;
  fs.writeFileSync(processesPath, JSON.stringify({ processes, leftovers }, null, 2), "utf8");
  fs.writeFileSync(resultPath, JSON.stringify(result, null, 2), "utf8");
  fs.rmSync(userDataDir, { recursive: true, force: true });

  console.log(`[capture-mac-gui-evidence] status=${status}`);
  console.log(`[capture-mac-gui-evidence] result=${resultPath}`);
  console.log(`[capture-mac-gui-evidence] screenshot=${appScreenshot}`);
  if (status !== "captured") process.exitCode = 2;
}

main().catch((error) => {
  console.error(`[capture-mac-gui-evidence] ${error.stack || error.message}`);
  process.exit(1);
});

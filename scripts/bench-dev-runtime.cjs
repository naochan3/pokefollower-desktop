const { spawn, execFileSync } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");

const root = path.join(__dirname, "..");
const warmupMs = Number(process.env.PF_DEV_RUNTIME_WARMUP_MS || 12000);
const sampleMs = Number(process.env.PF_DEV_RUNTIME_SAMPLE_MS || 30000);
const sampleIntervalMs = Number(process.env.PF_DEV_RUNTIME_SAMPLE_INTERVAL_MS || 1000);
const runValueNames = ["electron.app.PokeFollower", "PokeFollower"];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ps(script) {
  return execFileSync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
    { encoding: "utf8", windowsHide: true },
  ).trim();
}

function readRunValues() {
  const names = runValueNames.map((name) => `"${name}"`).join(",");
  const script = `
    $path = "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"
    $names = @(${names})
    $props = if (Test-Path $path) { Get-ItemProperty -Path $path } else { $null }
    $rows = foreach ($name in $names) {
      $value = if ($props -and ($props.PSObject.Properties.Name -contains $name)) { $props.$name } else { "" }
      [pscustomobject]@{ name = $name; value = [string]$value }
    }
    $rows | ConvertTo-Json -Compress
  `;
  const raw = ps(script);
  return JSON.parse(raw || "[]");
}

function getProcesses() {
  const script = `
    $cim = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name, CommandLine
    $proc = Get-Process | Select-Object Id, CPU, WorkingSet64
    $procById = @{}
    foreach ($p in $proc) { $procById[[int]$p.Id] = $p }
    $rows = foreach ($c in $cim) {
      $p = $procById[[int]$c.ProcessId]
      [pscustomobject]@{
        pid = [int]$c.ProcessId
        ppid = [int]$c.ParentProcessId
        name = [string]$c.Name
        cpu = if ($p -and $p.CPU -ne $null) { [double]$p.CPU } else { 0 }
        workingSet = if ($p) { [int64]$p.WorkingSet64 } else { 0 }
        commandLine = [string]$c.CommandLine
      }
    }
    $rows | ConvertTo-Json -Compress
  `;
  const raw = ps(script);
  const parsed = JSON.parse(raw || "[]");
  return Array.isArray(parsed) ? parsed : [parsed];
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

function summarize(processes, pids) {
  const rows = processes.filter((proc) => pids.has(proc.pid));
  return {
    count: rows.length,
    cpu: rows.reduce((acc, proc) => acc + (proc.cpu || 0), 0),
    workingSet: rows.reduce((acc, proc) => acc + (proc.workingSet || 0), 0),
    rows: rows
      .map((proc) => ({ pid: proc.pid, name: proc.name, cpu: proc.cpu || 0, workingSet: proc.workingSet || 0 }))
      .sort((a, b) => b.workingSet - a.workingSet),
  };
}

function stopProcesses(pids) {
  const list = [...pids].filter((pid) => pid !== process.pid);
  if (list.length === 0) return;
  const arg = list.join(",");
  ps(`Stop-Process -Id ${arg} -Force -ErrorAction SilentlyContinue`);
}

async function main() {
  if (process.platform !== "win32") {
    throw new Error("bench-dev-runtime currently supports Windows only");
  }

  const beforeRunValues = readRunValues();
  const child = spawn("cmd.exe", ["/d", "/s", "/c", "npm start"], {
    cwd: root,
    stdio: "ignore",
    windowsHide: true,
  });

  let trackedPids = new Set([child.pid]);
  try {
    await sleep(warmupMs);
    const firstProcesses = getProcesses();
    trackedPids = descendantPids(firstProcesses, child.pid);
    const before = summarize(firstProcesses, trackedPids);
    const sampleStarted = Date.now();
    const samples = [];
    while (Date.now() - sampleStarted < sampleMs) {
      await sleep(sampleIntervalMs);
      const processes = getProcesses();
      trackedPids = descendantPids(processes, child.pid);
      samples.push(summarize(processes, trackedPids));
    }
    const afterProcesses = getProcesses();
    const after = summarize(afterProcesses, trackedPids);
    const afterRunValues = readRunValues();
    const cpuDelta = Math.max(0, after.cpu - before.cpu);
    const elapsedSeconds = Math.max(1, (Date.now() - sampleStarted) / 1000);
    const avgWorkingSet =
      samples.reduce((acc, sample) => acc + sample.workingSet, 0) / Math.max(1, samples.length);
    const maxWorkingSet = Math.max(...samples.map((sample) => sample.workingSet), after.workingSet);
    const logicalCpuCount = os.cpus().length || 1;
    const singleCoreCpu = (cpuDelta / elapsedSeconds) * 100;
    const wholeMachineCpu = singleCoreCpu / logicalCpuCount;

    console.log(`[bench-dev-runtime] warmup: ${warmupMs}ms`);
    console.log(`[bench-dev-runtime] sample: ${elapsedSeconds.toFixed(3)}s`);
    console.log(`[bench-dev-runtime] tracked process count: ${after.count}`);
    console.log(`[bench-dev-runtime] cpu seconds delta: ${cpuDelta.toFixed(3)}s`);
    console.log(`[bench-dev-runtime] logical CPUs: ${logicalCpuCount}`);
    console.log(`[bench-dev-runtime] approx single-core CPU: ${singleCoreCpu.toFixed(3)}%`);
    console.log(`[bench-dev-runtime] approx whole-machine CPU: ${wholeMachineCpu.toFixed(3)}%`);
    console.log(`[bench-dev-runtime] avg working set: ${(avgWorkingSet / 1024 / 1024).toFixed(1)} MB`);
    console.log(`[bench-dev-runtime] max working set: ${(maxWorkingSet / 1024 / 1024).toFixed(1)} MB`);
    for (const proc of after.rows.slice(0, 8)) {
      console.log(
        `[bench-dev-runtime] process ${proc.name} pid=${proc.pid} cpu=${proc.cpu.toFixed(3)}s ws=${(proc.workingSet / 1024 / 1024).toFixed(1)} MB`,
      );
    }
    for (const item of afterRunValues) {
      const before = beforeRunValues.find((value) => value.name === item.name)?.value || "";
      const changed = before !== item.value ? "changed" : "unchanged";
      console.log(`[bench-dev-runtime] HKCU Run ${item.name}: ${item.value ? "set" : "empty"} (${changed})`);
    }
  } finally {
    stopProcesses(trackedPids);
    child.kill();
    await sleep(1000);
    const leftovers = summarize(getProcesses(), trackedPids);
    console.log(`[bench-dev-runtime] leftover tracked process count after cleanup: ${leftovers.count}`);
  }
}

main().catch((error) => {
  console.error(`[bench-dev-runtime] ${error.stack || error.message}`);
  process.exit(1);
});

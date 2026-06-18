const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { createFollowerSim } = require("../src/main/follower-sim.js");

const root = path.join(__dirname, "..");
const timerDurationMs = Number(process.env.PF_TIMER_BENCH_MS || 10000);
const simulatedDurationMs = Number(process.env.PF_SIM_BENCH_MS || 5 * 60 * 1000);
const intervals = [8, 16];

function percentile(values, pct) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((pct / 100) * sorted.length) - 1);
  return sorted[idx];
}

async function measureTimer(targetMs) {
  const deltas = [];
  const started = performance.now();
  let last = started;

  await new Promise((resolve) => {
    const timer = setInterval(() => {
      const now = performance.now();
      deltas.push(now - last);
      last = now;
      if (now - started >= timerDurationMs) {
        clearInterval(timer);
        resolve();
      }
    }, targetMs);
  });

  const elapsed = performance.now() - started;
  const sum = deltas.reduce((acc, value) => acc + value, 0);
  return {
    targetMs,
    ticks: deltas.length,
    elapsedMs: elapsed,
    avgMs: sum / deltas.length,
    p95Ms: percentile(deltas, 95),
    p99Ms: percentile(deltas, 99),
    hz: (deltas.length / elapsed) * 1000,
  };
}

function cursorAt(tMs) {
  const t = tMs / 1000;
  return {
    x: 960 + Math.sin(t * 1.7) * 420 + Math.sin(t * 0.31) * 120,
    y: 540 + Math.cos(t * 1.3) * 260 + Math.sin(t * 0.47) * 80,
  };
}

function measureSimulation(stepMs) {
  const sim = createFollowerSim();
  const meta = JSON.parse(
    fs.readFileSync(path.join(root, "assets", "packs", "retro", "gen-1", "001-bulbasaur.json"), "utf8"),
  );

  sim.setMeta(meta);
  sim.resetTo(960, 540, 0);

  const started = performance.now();
  let render = null;
  let steps = 0;

  for (let now = stepMs; now <= simulatedDurationMs; now += stepMs) {
    const cursor = cursorAt(now);
    sim.updateCursor(cursor.x, cursor.y, now);
    render = sim.step(stepMs, now);
    steps++;
  }

  const elapsed = performance.now() - started;
  return {
    stepMs,
    backend: sim.backend(),
    simulatedSeconds: simulatedDurationMs / 1000,
    steps,
    elapsedMs: elapsed,
    cpuMsPerSimSecond: elapsed / (simulatedDurationMs / 1000),
    finalX: render ? render.x : null,
    finalY: render ? render.y : null,
    finalState: render ? render.state : null,
  };
}

(async () => {
  console.log(`[bench-sim-interval] timer duration: ${timerDurationMs}ms`);
  for (const interval of intervals) {
    const result = await measureTimer(interval);
    console.log(
      [
        `timer target ${result.targetMs}ms`,
        `${result.ticks} ticks`,
        `${result.elapsedMs.toFixed(4)}ms elapsed`,
        `${result.avgMs.toFixed(4)}ms avg`,
        `${result.p95Ms.toFixed(4)}ms p95`,
        `${result.p99Ms.toFixed(4)}ms p99`,
        `${result.hz.toFixed(2)}Hz effective`,
      ].join(", "),
    );
  }

  console.log(`[bench-sim-interval] simulated duration: ${simulatedDurationMs}ms`);
  for (const interval of intervals) {
    const result = measureSimulation(interval);
    console.log(
      [
        `sim step ${result.stepMs}ms`,
        `${result.steps} steps`,
        `${result.backend} backend`,
        `${result.elapsedMs.toFixed(4)}ms elapsed`,
        `${result.cpuMsPerSimSecond.toFixed(4)}ms CPU/sim-s`,
        `final (${result.finalX.toFixed(2)}, ${result.finalY.toFixed(2)})`,
        `state ${result.finalState}`,
      ].join(", "),
    );
  }
})();

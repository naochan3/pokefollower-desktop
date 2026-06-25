const { performance } = require("node:perf_hooks");
const { createFollowerSim } = require("../src/main/follower-sim.js");

const META = {
  rawPath: "gen-1/009-blastoise",
  states: {
    idle: { sheet: "Idle-Anim.webp", frame: { w: 40, h: 40 }, fps: 8, frames: 8, rows: { front: 0, right: 2, left: 6 } },
    walk: { sheet: "Walk-Anim.webp", frame: { w: 32, h: 40 }, fps: 6, frames: 4, rows: { front: 0, right: 2, left: 6 } },
  },
};

const STEPS = Number(process.env.PF_BENCH_STEPS || 200000);
const WARMUP_STEPS = Math.min(20000, Math.floor(STEPS / 5));

function cursorAt(i) {
  const t = i / 60;
  return {
    x: Math.sin(t * 0.73) * 900 + Math.cos(t * 0.17) * 240,
    y: Math.cos(t * 0.41) * 520 + Math.sin(t * 0.29) * 180,
  };
}

function makeSim(options) {
  const sim = createFollowerSim(options);
  sim.setMeta(META);
  sim.setConfig({ vcp1_scale: 1.25, vcp1_offset: 70, vcp1_lerp: 0.20 });
  sim.resetTo(0, 0, 0);
  return sim;
}

function run(label, options, steps) {
  const sim = makeSim(options);
  let now = 0;
  let checksum = 0;
  const start = performance.now();
  for (let i = 0; i < steps; i++) {
    now += 8;
    const c = cursorAt(i);
    sim.updateCursor(c.x, c.y, now);
    const frame = sim.step(8, now);
    checksum += frame.x * 0.000001 + frame.y * 0.000002 + (frame.walking ? 1 : 0);
  }
  const elapsedMs = performance.now() - start;
  return {
    label,
    backend: sim.backend(),
    steps,
    elapsedMs,
    stepsPerSecond: steps / (elapsedMs / 1000),
    checksum,
  };
}

run("rust-wasm-warmup", {}, WARMUP_STEPS);
run("js-fallback-warmup", { useRust: false }, WARMUP_STEPS);

const rust = run("rust-wasm", {}, STEPS);
const js = run("js-fallback", { useRust: false }, STEPS);
const speedup = ((js.elapsedMs - rust.elapsedMs) / js.elapsedMs) * 100;

console.log(JSON.stringify({ rust, js, rustSpeedupPercent: speedup }, null, 2));

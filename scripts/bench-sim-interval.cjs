"use strict";

const { createFollowerSim } = require("../src/main/follower-sim.js");

const META = {
  rawPath: "gen-1/025-pikachu",
  states: {
    idle: { sheet: "Idle-Anim.webp", frame: { w: 40, h: 40 }, fps: 8, frames: 8, rows: { front: 0, right: 2, left: 6 } },
    walk: { sheet: "Walk-Anim.webp", frame: { w: 32, h: 40 }, fps: 6, frames: 4, rows: { front: 0, right: 2, left: 6 } },
  },
};

function run(intervalMs, durationMs = 60_000) {
  const sim = createFollowerSim();
  sim.setMeta(META);
  sim.resetTo(0, 0, 0);
  const frames = Math.floor(durationMs / intervalMs);
  const start = process.hrtime.bigint();
  for (let i = 1; i <= frames; i++) {
    const now = i * intervalMs;
    sim.updateCursor(400 + Math.sin(i / 20) * 200, 300 + Math.cos(i / 25) * 160, now);
    sim.step(intervalMs, now);
  }
  const elapsedNs = Number(process.hrtime.bigint() - start);
  return {
    intervalMs,
    frames,
    simulatedSeconds: durationMs / 1000,
    wallMs: elapsedNs / 1e6,
    microsecondsPerFrame: elapsedNs / frames / 1000,
  };
}

for (const interval of [8, 16]) {
  const result = run(interval);
  console.log(JSON.stringify(result));
}

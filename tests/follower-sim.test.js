import { describe, it, expect } from "vitest";
import { createFollowerSim } from "../src/main/follower-sim.js";

const META = {
  rawPath: "gen-1/009-blastoise",
  states: {
    idle: { sheet: "Idle-Anim.webp", frame: { w: 40, h: 40 }, fps: 8, frames: 8, rows: { front: 0, right: 2, left: 6 } },
    walk: { sheet: "Walk-Anim.webp", frame: { w: 32, h: 40 }, fps: 6, frames: 4, rows: { front: 0, right: 2, left: 6 } },
  },
};

describe("follower-sim", () => {
  it("meta未設定なら step は null", () => {
    const sim = createFollowerSim();
    expect(sim.step(16, 16)).toBe(null);
  });

  it("カーソルへ向かって移動し、十分時間が経てば近づく（グローバル座標）", () => {
    const sim = createFollowerSim();
    sim.setMeta(META);
    sim.resetTo(0, 0, 0);
    // カーソルを右へ大きく離す。追従は低速(数百px/s)なので十分なフレーム数回す。
    let now = 0;
    let r = null;
    for (let i = 0; i < 600; i++) {
      now += 16;
      sim.updateCursor(800, 0, now);
      r = sim.step(16, now);
    }
    // 目標(カーソル800 − perchオフセット)付近まで到達
    expect(r.x).toBeGreaterThan(700);
    expect(r.state).toBeTruthy();
  });

  it("resetTo はカーソル位置へ即配置する", () => {
    const sim = createFollowerSim();
    sim.setMeta(META);
    sim.resetTo(1500, 1500, 0);
    const r = sim.step(16, 16);
    // ほぼ配置位置のまま（1フレームでは大きく動かない）
    expect(Math.abs(r.x - 1500)).toBeLessThan(50);
    expect(Math.abs(r.y - 1500)).toBeLessThan(50);
  });

  it("停止中はカーソル先端ではなく右下の離れた位置へ寄る", () => {
    const sim = createFollowerSim();
    sim.setMeta(META);
    sim.resetTo(100, 100, 0);
    let now = 0;
    let r = null;
    for (let i = 0; i < 120; i++) {
      now += 16;
      r = sim.step(16, now);
    }
    expect(r.x).toBeGreaterThan(145);
    expect(r.y).toBeGreaterThan(140);
  });

  it("負の座標（左上にオフセットしたモニター）も扱える", () => {
    const sim = createFollowerSim();
    sim.setMeta(META);
    sim.resetTo(-1920, -200, 0);
    const r = sim.step(16, 16);
    expect(r.x).toBeLessThan(0);
  });
});

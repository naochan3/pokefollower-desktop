import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFollowerSim } from "../src/main/follower-sim.js";

const META = {
  rawPath: "gen-1/009-blastoise",
  states: {
    idle: { sheet: "Idle-Anim.webp", frame: { w: 40, h: 40 }, fps: 8, frames: 8, rows: { front: 0, right: 2, left: 6 } },
    walk: { sheet: "Walk-Anim.webp", frame: { w: 32, h: 40 }, fps: 6, frames: 4, rows: { front: 0, right: 2, left: 6 } },
  },
};

describe("follower-sim", () => {
  it("Rust WASM backend を追従計算に使う", () => {
    const sim = createFollowerSim();
    expect(sim.backend()).toBe("rust-wasm");
  });

  it("WASM が無い場合は JS backend にfallbackして step できる", () => {
    const missingRoot = mkdtempSync(join(tmpdir(), "pf-no-wasm-sim-"));
    const sim = createFollowerSim({ rootDir: missingRoot });
    expect(sim.backend()).toBe("js");
    sim.setMeta(META);
    sim.resetTo(0, 0, 0);
    sim.updateCursor(800, 0, 16);
    const r = sim.step(16, 16);
    expect(r).toMatchObject({ state: "idle" });
    expect(Number.isFinite(r.x)).toBe(true);
    expect(Number.isFinite(r.y)).toBe(true);
  });

  it("固定カーソル軌道で Rust WASM と JS fallback の出力が一致する", () => {
    const rust = createFollowerSim();
    const js = createFollowerSim({ rootDir: mkdtempSync(join(tmpdir(), "pf-no-wasm-eq-")) });
    for (const sim of [rust, js]) {
      sim.setMeta(META);
      sim.setConfig({ vcp1_offset: 70, vcp1_lerp: 0.2 });
      sim.resetTo(100, 100, 0);
    }

    expect(rust.backend()).toBe("rust-wasm");
    expect(js.backend()).toBe("js");

    for (let i = 1; i <= 240; i++) {
      const now = i * 16;
      const x = 400 + Math.sin(i / 20) * 180;
      const y = 300 + Math.cos(i / 25) * 120;
      rust.updateCursor(x, y, now);
      js.updateCursor(x, y, now);
      const r = rust.step(16, now);
      const j = js.step(16, now);
      expect(r.x).toBeCloseTo(j.x, 10);
      expect(r.y).toBeCloseTo(j.y, 10);
      expect(r.state).toBe(j.state);
      expect(r.frame).toBe(j.frame);
      expect(r.row).toBe(j.row);
    }
  });

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

  it("未移動の初期状態ではカーソルの真上に出る", () => {
    const sim = createFollowerSim();
    sim.setMeta(META);
    sim.resetTo(100, 100, 0);
    let now = 0;
    let r = null;
    for (let i = 0; i < 120; i++) {
      now += 16;
      r = sim.step(16, now);
    }
    // 一度も動かしていなければ初期の offsetDir（真上）のまま。x はほぼ不変、y は上へ離れる。
    expect(Math.abs(r.x - 100)).toBeLessThan(10);
    expect(r.y).toBeLessThan(50);
  });

  it("移動して止めると進行方向の逆隅に留まる（真上へ戻らない）", () => {
    const sim = createFollowerSim();
    sim.setMeta(META);
    sim.resetTo(500, 500, 0);
    let now = 0;
    let cx = 500;
    let cy = 500;
    let r = null;
    // 右下へカーソルを動かす → ペットは進行方向の逆＝左上へ寄る。
    for (let i = 0; i < 60; i++) {
      now += 16;
      cx += 12;
      cy += 12;
      sim.updateCursor(cx, cy, now);
      r = sim.step(16, now);
    }
    // 停止して十分待つ。offsetDir は凍結され、左上の隅に留まる（真上に戻らない）。
    for (let i = 0; i < 180; i++) {
      now += 16;
      sim.updateCursor(cx, cy, now);
      r = sim.step(16, now);
    }
    expect(r.x - cx).toBeLessThan(-20); // カーソルより左
    expect(r.y - cy).toBeLessThan(-20); // カーソルより上
  });

  it("負の座標（左上にオフセットしたモニター）も扱える", () => {
    const sim = createFollowerSim();
    sim.setMeta(META);
    sim.resetTo(-1920, -200, 0);
    const r = sim.step(16, 16);
    expect(r.x).toBeLessThan(0);
  });
});

// Issue #30: 向きはカーソル速度でなくポケモン自身の進行方向に従う／無操作で sleep する
const META_DIR = {
  rawPath: "gen-1/009-blastoise",
  states: {
    idle: { sheet: "Idle-Anim.webp", frame: { w: 40, h: 40 }, fps: 4, frames: 4,
      rows: { front: 0, frontRight: 1, right: 2, backRight: 3, back: 4, backLeft: 5, left: 6, frontLeft: 7 } },
    walk: { sheet: "Walk-Anim.webp", frame: { w: 32, h: 40 }, fps: 6, frames: 4,
      rows: { front: 0, frontRight: 1, right: 2, backRight: 3, back: 4, backLeft: 5, left: 6, frontLeft: 7 } },
    sleep: { sheet: "Sleep-Anim.webp", frame: { w: 40, h: 40 }, fps: 1, frames: 2,
      rows: { front: 0, frontRight: 0, right: 0, backRight: 0, back: 0, backLeft: 0, left: 0, frontLeft: 0 } },
  },
};

describe("follower-sim 向き・sleep (Issue #30)", () => {
  it("カーソル停止後も、到着まで進行方向(右)を向く", () => {
    const sim = createFollowerSim();
    sim.setMeta(META_DIR);
    sim.resetTo(0, 0, 0);
    // カーソルを一度だけ右遠方へ飛ばし、以後は静止させる。
    // velAvg は完全に減衰するが、ポケモンはまだ目標へ歩いて追従中。
    let now = 0;
    let r = null;
    for (let i = 0; i < 120; i++) {
      now += 16;
      sim.updateCursor(800, 0, now);
      r = sim.step(16, now);
    }
    // この時点でもポケモンは目標へ歩行中（右へ移動中）。
    expect(r.state).toBe("walk");
    expect(r.x).toBeGreaterThan(350);
    expect(r.x).toBeLessThan(780);
    // velAvg は既に0。カーソル基準だと front(0) になるが、進行方向基準なら right(2)。
    expect(r.row).toBe(META_DIR.states.walk.rows.right);
  });

  it("カーソルを30秒間動かさなければ sleep に入る（毎フレーム updateCursor されても）", () => {
    const sim = createFollowerSim();
    sim.setMeta(META_DIR);
    sim.resetTo(500, 500, 0);
    let now = 0;
    let r = null;
    // 実機の sim ループ同様、静止カーソルでも毎フレーム updateCursor を呼ぶ。
    while (now < 31000) {
      now += 16;
      sim.updateCursor(500, 500, now);
      r = sim.step(16, now);
    }
    expect(r.state).toBe("sleep");
  });

  it("静止＋微小カーソル揺れでは向きが front 固定（ぴくぴくしない）", () => {
    const sim = createFollowerSim();
    sim.setMeta(META_DIR);
    sim.resetTo(500, 500, 0);
    let now = 0;
    // まず静止カーソルで perch へ落ち着かせる。
    for (let i = 0; i < 120; i++) {
      now += 16;
      sim.updateCursor(500, 500, now);
      sim.step(16, now);
    }
    // ±1px の微小揺れを与える。
    const rows = [];
    for (let i = 0; i < 30; i++) {
      now += 16;
      sim.updateCursor(500 + (i % 2), 500, now);
      rows.push(sim.step(16, now).row);
    }
    expect([...new Set(rows)]).toEqual([META_DIR.states.idle.rows.front]);
  });

  it("着地の瞬間に向きが高速で切り替わらない（ぶるぶる防止）", () => {
    const sim = createFollowerSim();
    sim.setMeta(META_DIR);
    sim.resetTo(0, 0, 0);
    let now = 0;
    // 右へドラッグ。
    for (let i = 0; i < 40; i++) {
      now += 16;
      sim.updateCursor(i * 15, 0, now);
      sim.step(16, now);
    }
    // 以後カーソル静止だが、実マウス相当の微ノイズが縦横に乗る。
    const cx = 39 * 15;
    const log = [];
    for (let i = 0; i < 300; i++) {
      now += 16;
      const nx = i % 2 ? 2 : 0;
      const ny = i % 2 ? 0 : 2;
      sim.updateCursor(cx + nx, ny, now);
      const r = sim.step(16, now);
      log.push({ i, row: r.row, st: r.state });
    }
    // 着地(初めて idle になる)前後の窓で、向きの切替は「進行方向→front」の最大1回まで。
    const firstIdle = log.find((l) => l.st === "idle");
    const c = firstIdle ? firstIdle.i : 150;
    const win = log.filter((l) => l.i >= c - 20 && l.i <= c + 8);
    let flips = 0;
    for (let k = 1; k < win.length; k++) if (win[k].row !== win[k - 1].row) flips++;
    expect(flips).toBeLessThanOrEqual(1);
  });

  it("待機(idle)アニメは公称fpsより遅く再生される", () => {
    const sim = createFollowerSim();
    sim.setMeta(META_DIR);
    sim.resetTo(500, 500, 0);
    let now = 0;
    // perch へ落ち着かせて idle にする。
    for (let i = 0; i < 200; i++) {
      now += 16;
      sim.updateCursor(500, 500, now);
      sim.step(16, now);
    }
    // 10秒間の idle 中にフレームが進んだ回数を数える。
    // 公称 idle fps=4 なら約40回。遅くした分それより明確に少ない。
    let advances = 0;
    let prev = sim.step(16, (now += 16)).frame;
    const start = now;
    while (now - start < 10000) {
      now += 16;
      const r = sim.step(16, now);
      if (r.state !== "idle") throw new Error("idle 維持に失敗: " + r.state);
      if (r.frame !== prev) advances++;
      prev = r.frame;
    }
    expect(advances).toBeLessThan(34); // 公称40回 → 遅くなっていれば明確に下回る
    expect(advances).toBeGreaterThan(20); // 遅すぎ(停止)でもない
  });
});

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

  it("静止後は現在ディスプレイの画面端へ休憩移動する", () => {
    const sim = createFollowerSim({ rootDir: mkdtempSync(join(tmpdir(), "pf-no-wasm-edge-")) });
    sim.setMeta(META);
    sim.setDisplayBounds([{ x: 0, y: 0, width: 800, height: 600 }]);
    sim.resetTo(400, 300, 0);
    let now = 0;
    let r = null;
    while (now < 12000) {
      now += 16;
      sim.updateCursor(400, 300, now);
      r = sim.step(16, now);
    }
    expect(r.y).toBeLessThan(120);
    expect(r.x).toBeGreaterThan(20);
    expect(r.x).toBeLessThan(780);
  });

  it("休憩移動は設定OFFで従来のカーソル近傍に留まる", () => {
    const sim = createFollowerSim({ rootDir: mkdtempSync(join(tmpdir(), "pf-no-wasm-edge-off-")) });
    sim.setMeta(META);
    sim.setDisplayBounds([{ x: 0, y: 0, width: 800, height: 600 }]);
    sim.setConfig({ vcp1_edgeRest: false });
    sim.resetTo(400, 300, 0);
    let now = 0;
    let r = null;
    while (now < 12000) {
      now += 16;
      sim.updateCursor(400, 300, now);
      r = sim.step(16, now);
    }
    expect(r.y).toBeGreaterThan(210);
    expect(r.y).toBeLessThan(260);
  });

  it("休憩ターゲットはDPI/負座標を含むディスプレイ内へ収まる", () => {
    const sim = createFollowerSim({ rootDir: mkdtempSync(join(tmpdir(), "pf-no-wasm-edge-neg-")) });
    sim.setMeta(META);
    sim.setDisplayBounds([
      { x: -1920, y: -200, width: 1920, height: 1080 },
      { x: 0, y: 0, width: 2560, height: 1440 },
    ]);
    sim.resetTo(-100, 100, 0);
    let now = 0;
    let r = null;
    while (now < 12000) {
      now += 16;
      sim.updateCursor(-100, 100, now);
      r = sim.step(16, now);
    }
    expect(r.x).toBeLessThan(0);
    expect(r.x).toBeGreaterThan(-1920);
    expect(r.y).toBeGreaterThan(700);
    expect(r.y).toBeLessThan(880);
  });

  it("前面ウィンドウ矩形があれば静止後にウィンドウ端を休憩候補にする", () => {
    const sim = createFollowerSim({ rootDir: mkdtempSync(join(tmpdir(), "pf-no-wasm-window-edge-")) });
    sim.setMeta(META);
    sim.setDisplayBounds([{ x: 0, y: 0, width: 1000, height: 800 }]);
    sim.setRestSurfaces([{ kind: "window", x: 200, y: 150, width: 500, height: 360 }]);
    sim.resetTo(420, 220, 0);
    let now = 0;
    let r = null;
    while (now < 12000) {
      now += 16;
      sim.updateCursor(420, 220, now);
      r = sim.step(16, now);
    }
    expect(r.x).toBeGreaterThan(220);
    expect(r.x).toBeLessThan(680);
    expect(r.y).toBeLessThan(150);
    expect(r.y).toBeGreaterThan(20);
  });

  it("offsetが小さくてもカーソル直下を避ける", () => {
    const sim = createFollowerSim({ rootDir: mkdtempSync(join(tmpdir(), "pf-no-wasm-avoid-")) });
    sim.setMeta(META);
    sim.setConfig({ vcp1_offset: 0, vcp1_lerp: 0.5, vcp1_edgeRest: false });
    sim.resetTo(400, 300, 0);
    let now = 0;
    let r = null;
    for (let i = 0; i < 120; i++) {
      now += 16;
      sim.updateCursor(400, 300, now);
      r = sim.step(16, now);
    }
    expect(Math.hypot(r.x - 400, r.y - 300)).toBeGreaterThan(40);
  });

  it("カーソル回避は設定OFFで無効化できる", () => {
    const sim = createFollowerSim({ rootDir: mkdtempSync(join(tmpdir(), "pf-no-wasm-avoid-off-")) });
    sim.setMeta(META);
    sim.setConfig({ vcp1_offset: 0, vcp1_lerp: 0.5, vcp1_edgeRest: false, vcp1_avoidCursor: false });
    sim.resetTo(400, 300, 0);
    let now = 0;
    let r = null;
    for (let i = 0; i < 120; i++) {
      now += 16;
      sim.updateCursor(400, 300, now);
      r = sim.step(16, now);
    }
    expect(Math.hypot(r.x - 400, r.y - 300)).toBeLessThan(5);
  });

  it("カーソル退避強度strongはnormalより大きく離れる", () => {
    const normal = createFollowerSim({ rootDir: mkdtempSync(join(tmpdir(), "pf-no-wasm-avoid-normal-")) });
    const strong = createFollowerSim({ rootDir: mkdtempSync(join(tmpdir(), "pf-no-wasm-avoid-strong-")) });
    for (const sim of [normal, strong]) {
      sim.setMeta(META);
      sim.setConfig({ vcp1_offset: 0, vcp1_lerp: 0.5, vcp1_edgeRest: false });
      sim.resetTo(400, 300, 0);
    }
    strong.setConfig({ vcp1_avoidCursorStrength: "strong" });
    let now = 0;
    let n = null;
    let s = null;
    for (let i = 0; i < 160; i++) {
      now += 16;
      normal.updateCursor(400, 300, now);
      strong.updateCursor(400, 300, now);
      n = normal.step(16, now);
      s = strong.step(16, now);
    }
    expect(Math.hypot(s.x - 400, s.y - 300)).toBeGreaterThan(Math.hypot(n.x - 400, n.y - 300) + 20);
  });

  it("作業見守りのreactionModeは作業中に距離を広げ、休憩時に近づける", () => {
    const calm = createFollowerSim({ rootDir: mkdtempSync(join(tmpdir(), "pf-no-wasm-reaction-calm-")) });
    const breakMode = createFollowerSim({ rootDir: mkdtempSync(join(tmpdir(), "pf-no-wasm-reaction-break-")) });
    for (const sim of [calm, breakMode]) {
      sim.setMeta(META);
      sim.setConfig({ vcp1_edgeRest: false, vcp1_avoidCursor: false, vcp1_offset: 70, vcp1_lerp: 0.5 });
      sim.resetTo(400, 300, 0);
    }
    calm.setConfig({ vcp1_reactionMode: "calm" });
    breakMode.setConfig({ vcp1_reactionMode: "break" });
    let now = 0;
    let c = null;
    let b = null;
    for (let i = 0; i < 160; i++) {
      now += 16;
      calm.updateCursor(400, 300, now);
      breakMode.updateCursor(400, 300, now);
      c = calm.step(16, now);
      b = breakMode.step(16, now);
    }
    expect(Math.hypot(c.x - 400, c.y - 300)).toBeGreaterThan(Math.hypot(b.x - 400, b.y - 300));
  });

  it("性格プリセット friendly は標準より近い距離へ寄る", () => {
    const standard = createFollowerSim({ rootDir: mkdtempSync(join(tmpdir(), "pf-no-wasm-personality-standard-")) });
    const friendly = createFollowerSim({ rootDir: mkdtempSync(join(tmpdir(), "pf-no-wasm-personality-friendly-")) });
    for (const sim of [standard, friendly]) {
      sim.setMeta(META);
      sim.setConfig({ vcp1_edgeRest: false, vcp1_avoidCursor: false, vcp1_offset: 70, vcp1_lerp: 0.5 });
      sim.resetTo(400, 300, 0);
    }
    friendly.setConfig({ vcp1_personality: "friendly" });
    let now = 0;
    let s = null;
    let f = null;
    for (let i = 0; i < 160; i++) {
      now += 16;
      standard.updateCursor(400, 300, now);
      friendly.updateCursor(400, 300, now);
      s = standard.step(16, now);
      f = friendly.step(16, now);
    }
    expect(Math.hypot(f.x - 400, f.y - 300)).toBeLessThan(Math.hypot(s.x - 400, s.y - 300));
  });

  it("性格プリセット relaxed は edge rest を早める", () => {
    const standard = createFollowerSim({ rootDir: mkdtempSync(join(tmpdir(), "pf-no-wasm-edge-standard-")) });
    const relaxed = createFollowerSim({ rootDir: mkdtempSync(join(tmpdir(), "pf-no-wasm-edge-relaxed-")) });
    for (const sim of [standard, relaxed]) {
      sim.setMeta(META);
      sim.setDisplayBounds([{ x: 0, y: 0, width: 800, height: 600 }]);
      sim.resetTo(400, 300, 0);
    }
    relaxed.setConfig({ vcp1_personality: "relaxed" });
    let now = 0;
    let s = null;
    let r = null;
    while (now < 7000) {
      now += 16;
      standard.updateCursor(400, 300, now);
      relaxed.updateCursor(400, 300, now);
      s = standard.step(16, now);
      r = relaxed.step(16, now);
    }
    expect(s.y).toBeGreaterThan(200);
    expect(r.y).toBeLessThan(180);
  });

  it("散歩モードはカーソルを直接追わず画面内を自律移動する", () => {
    const sim = createFollowerSim({ rootDir: mkdtempSync(join(tmpdir(), "pf-no-wasm-roam-")) });
    sim.setMeta(META);
    sim.setDisplayBounds([{ x: 0, y: 0, width: 800, height: 600 }]);
    sim.setConfig({ vcp1_mode: "roam", vcp1_lerp: 0.5 });
    sim.resetTo(400, 300, 0);
    let now = 0;
    let r = null;
    for (let i = 0; i < 240; i++) {
      now += 16;
      sim.updateCursor(790, 590, now);
      r = sim.step(16, now);
    }
    expect(r.x).toBeGreaterThan(40);
    expect(r.x).toBeLessThan(760);
    expect(r.y).toBeGreaterThan(40);
    expect(r.y).toBeLessThan(560);
    expect(Math.hypot(r.x - 790, r.y - 590)).toBeGreaterThan(250);
  });

  it("散歩モードから追従モードへ戻せる", () => {
    const sim = createFollowerSim({ rootDir: mkdtempSync(join(tmpdir(), "pf-no-wasm-roam-follow-")) });
    sim.setMeta(META);
    sim.setDisplayBounds([{ x: 0, y: 0, width: 800, height: 600 }]);
    sim.setConfig({ vcp1_mode: "roam", vcp1_lerp: 0.5, vcp1_edgeRest: false });
    sim.resetTo(400, 300, 0);
    let now = 0;
    for (let i = 0; i < 60; i++) {
      now += 16;
      sim.updateCursor(790, 590, now);
      sim.step(16, now);
    }
    sim.setConfig({ vcp1_mode: "follow", vcp1_offset: 0, vcp1_avoidCursor: false });
    let r = null;
    for (let i = 0; i < 240; i++) {
      now += 16;
      sim.updateCursor(790, 590, now);
      r = sim.step(16, now);
    }
    expect(Math.hypot(r.x - 790, r.y - 590)).toBeLessThan(12);
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
    // 遠いと速足になるため、十分遠く(3000)へ飛ばして frame120 時点でも歩行中にする。
    for (let i = 0; i < 120; i++) {
      now += 16;
      sim.updateCursor(3000, 0, now);
      r = sim.step(16, now);
    }
    // この時点でもポケモンは目標へ歩行中（右へ移動中）。
    expect(r.state).toBe("walk");
    expect(r.x).toBeGreaterThan(350);
    expect(r.x).toBeLessThan(2900);
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

  it("散歩モードは移動先到着後にidle/sleepへ遷移する", () => {
    const sim = createFollowerSim({ rootDir: mkdtempSync(join(tmpdir(), "pf-no-wasm-roam-sleep-")) });
    sim.setMeta(META_DIR);
    sim.setDisplayBounds([{ x: 0, y: 0, width: 260, height: 220 }]);
    sim.setConfig({ vcp1_mode: "roam", vcp1_lerp: 0.5, vcp1_personality: "relaxed" });
    sim.resetTo(130, 110, 0);
    let now = 0;
    const states = [];
    for (let i = 0; i < 1500; i++) {
      now += 16;
      sim.updateCursor(250, 210, now);
      states.push(sim.step(16, now).state);
    }
    expect(states).toContain("walk");
    expect(states).toContain("idle");
    expect(states).toContain("sleep");
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

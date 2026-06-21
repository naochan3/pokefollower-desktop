// 追従＋アニメーションの状態機械（グローバル画面座標）。
// 旧 overlay.js のロジックを移植。DOM 非依存・メインプロセスが駆動し、
// 各ウィンドウへ「どこに描くか」を渡す。これによりモニター間移動が
// ワープ無しで連続する（座標がグローバルなので境界をなめらかに越える）。

const path = require("node:path");
const { createRustFollowerCore } = require("./rust-follower-core.js");

const SLEEP_TIMEOUT_MS = 30000; // 無操作30sで sleep
const ARRIVE_RADIUS_PX = 6;
const SLOW_RADIUS_PX = 60;
const WALK_SPEED_MIN_PXPS = 80;
const WALK_SPEED_MAX_PXPS = 640;
const SPEED_CONFIG_MIN = 0.05;
const SPEED_CONFIG_MAX = 0.50;
const IDLE_OFFSET_DIR = { x: 0, y: -1 }; // 待機時はカーソルの真上に寄る（本家拡張と同じ）
const MOVE_DIR_MIN_PX = 0.75; // 平滑後の移動量がこれ未満なら front（停止＝正面）
const MOVE_DIR_SMOOTHING = 0.25; // 向き用移動ベクトルのEMA係数。到着間際のパタつき(ぶるぶる)を抑える
const IDLE_ANIM_SPEED = 0.7; // 待機(idle)アニメの再生速度倍率（1未満で遅く）
const EDGE_REST_IDLE_MS = 8000;
const EDGE_REST_PADDING_PX = 8;
const CURSOR_CLEARANCE_PX = 48;
const PERSONALITY_PRESETS = {
  standard: { offset: 1.0, lerp: 1.0, idleAnim: 1.0, edgeRestIdle: 1.0 },
  active: { offset: 0.85, lerp: 1.25, idleAnim: 1.25, edgeRestIdle: 1.25 },
  relaxed: { offset: 1.25, lerp: 0.75, idleAnim: 0.75, edgeRestIdle: 0.75 },
  friendly: { offset: 0.70, lerp: 1.10, idleAnim: 1.10, edgeRestIdle: 0.90 },
};

function createFollowerSim(options = {}) {
  const CONFIG = { scale: 1.25, offset: 70, lerp: 0.20, edgeRest: true, avoidCursor: true, personality: "standard" };
  const rustCore = createRustFollowerCore(options.rootDir || path.join(__dirname, "..", ".."));
  let displayBounds = [];
  let meta = null;
  const R = {
    anim: { name: "idle", frame: 0, row: 0, accMs: 0 },
    lastMoveTs: 0,
    lastMouse: { x: 0, y: 0, t: 0 },
    pos: { x: 0, y: 0 },
    target: { x: 0, y: 0 },
    offsetDir: { ...IDLE_OFFSET_DIR },
    isWalking: false,
    pendingState: null,
    velAvg: { x: 0, y: 0 },
    speedAvg: 0,
    moveDir: { x: 0, y: 0 }, // ポケモン自身の進行方向（向き選択に使う。カーソル速度ではない）
    restTarget: null,
  };

  function hasState(name) { return !!(meta && meta.states && meta.states[name]); }

  function walkSpeedFromConfig() {
    const t = (effectiveLerp() - SPEED_CONFIG_MIN) / (SPEED_CONFIG_MAX - SPEED_CONFIG_MIN);
    const c = Math.min(1, Math.max(0, t));
    return WALK_SPEED_MIN_PXPS + c * (WALK_SPEED_MAX_PXPS - WALK_SPEED_MIN_PXPS);
  }

  function personalityPreset() {
    return PERSONALITY_PRESETS[CONFIG.personality] || PERSONALITY_PRESETS.standard;
  }

  function effectiveOffset() {
    return Math.max(0, CONFIG.offset * personalityPreset().offset);
  }

  function effectiveLerp() {
    return clamp(CONFIG.lerp * personalityPreset().lerp, SPEED_CONFIG_MIN, SPEED_CONFIG_MAX);
  }

  function effectiveIdleAnimSpeed() {
    return IDLE_ANIM_SPEED * personalityPreset().idleAnim;
  }

  function effectiveEdgeRestIdleMs() {
    return EDGE_REST_IDLE_MS * personalityPreset().edgeRestIdle;
  }

  function frameSizeForCurrentState() {
    const st = meta && meta.states ? meta.states[R.anim.name] : null;
    const frame = st && st.frame ? st.frame : { w: 96, h: 96 };
    return { w: frame.w * CONFIG.scale, h: frame.h * CONFIG.scale };
  }

  function displayForPoint(x, y) {
    const containing = displayBounds.find((b) =>
      x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height);
    if (containing) return containing;
    let best = displayBounds[0] || null;
    let bestDist = Infinity;
    for (const b of displayBounds) {
      const cx = Math.min(Math.max(x, b.x), b.x + b.width);
      const cy = Math.min(Math.max(y, b.y), b.y + b.height);
      const dist = Math.hypot(x - cx, y - cy);
      if (dist < bestDist) { best = b; bestDist = dist; }
    }
    return best;
  }

  function clamp(n, min, max) {
    return Math.min(max, Math.max(min, n));
  }

  function computeEdgeRestTarget() {
    if (!CONFIG.edgeRest || displayBounds.length === 0) return null;
    const idleMs = Math.max(0, R.lastMouse.t - R.lastMoveTs);
    if (idleMs < effectiveEdgeRestIdleMs()) return null;
    const bounds = displayForPoint(R.lastMouse.x, R.lastMouse.y);
    if (!bounds) return null;
    const size = frameSizeForCurrentState();
    const halfW = size.w / 2;
    const halfH = size.h / 2;
    const left = bounds.x + halfW + EDGE_REST_PADDING_PX;
    const right = bounds.x + bounds.width - halfW - EDGE_REST_PADDING_PX;
    const top = bounds.y + halfH + EDGE_REST_PADDING_PX;
    const bottom = bounds.y + bounds.height - halfH - EDGE_REST_PADDING_PX;
    if (right < left || bottom < top) return null;
    const midY = bounds.y + bounds.height / 2;
    return {
      x: clamp(R.lastMouse.x, left, right),
      y: R.lastMouse.y < midY ? bottom : top,
    };
  }

  function setCoreRestTarget(target) {
    R.restTarget = target;
    if (!rustCore) return;
    if (target) rustCore.setRestTarget(target.x, target.y);
    else rustCore.clearRestTarget();
  }

  function refreshRestTarget() {
    setCoreRestTarget(computeEdgeRestTarget());
  }

  function computeTarget() {
    if (R.restTarget) {
      R.target.x = R.restTarget.x;
      R.target.y = R.restTarget.y;
      return;
    }
    const speed = R.speedAvg || 0;
    const hasDir = speed > 40;
    const OFFSET = effectiveOffset();
    // 移動中だけ offsetDir を進行方向の逆へ更新。停止中は凍結＝直前の隅に留まる（真上へ戻さない）。
    if (hasDir) {
      const dX = -(R.velAvg.x / (speed || 1));
      const dY = -(R.velAvg.y / (speed || 1));
      const OD_LERP = 0.08;
      R.offsetDir.x += (dX - R.offsetDir.x) * OD_LERP;
      R.offsetDir.y += (dY - R.offsetDir.y) * OD_LERP;
    }
    R.target.x = R.lastMouse.x + R.offsetDir.x * OFFSET;
    R.target.y = R.lastMouse.y + R.offsetDir.y * OFFSET;
    if (CONFIG.avoidCursor) {
      const dx = R.target.x - R.lastMouse.x;
      const dy = R.target.y - R.lastMouse.y;
      const dist = Math.hypot(dx, dy);
      if (dist < CURSOR_CLEARANCE_PX) {
        const ux = dist > 0.001 ? dx / dist : R.offsetDir.x;
        const uy = dist > 0.001 ? dy / dist : R.offsetDir.y;
        R.target.x = R.lastMouse.x + ux * CURSOR_CLEARANCE_PX;
        R.target.y = R.lastMouse.y + uy * CURSOR_CLEARANCE_PX;
      }
    }
  }

  function pickDir8(vx, vy) {
    const dead = 0.3;
    if (Math.abs(vx) <= dead && Math.abs(vy) <= dead) return "front";
    const angle = Math.atan2(vy, vx);
    const norm = (angle + 2 * Math.PI) % (2 * Math.PI);
    const idx = Math.floor((norm + Math.PI / 8) / (Math.PI / 4)) % 8;
    const keys8 = ["right", "frontRight", "front", "frontLeft", "left", "backLeft", "back", "backRight"];
    return keys8[idx];
  }

  function pickRowForState(stateName) {
    const st = meta && meta.states ? meta.states[stateName] : null;
    if (!st) return 0;
    const rows = st.rows || { front: 0 };
    // 向きはカーソル速度ではなくポケモン自身の(平滑化した)移動方向で決める。
    // カーソルが止まっても到着まで進行方向を向き、停止中(移動量小)は front で安定する。
    const mag = Math.hypot(R.moveDir.x, R.moveDir.y);
    const dir8 = mag < MOVE_DIR_MIN_PX ? "front" : pickDir8(R.moveDir.x, R.moveDir.y);
    if (dir8 in rows) return rows[dir8];
    const fallbackMap = { frontRight: "front", frontLeft: "front", backRight: "back", backLeft: "back" };
    const fb = fallbackMap[dir8] || dir8;
    return (fb in rows) ? rows[fb] : (rows.front != null ? rows.front : 0);
  }

  function pickStateBySpeed(now) {
    if (hasState("sleep") && (now - R.lastMoveTs) > SLEEP_TIMEOUT_MS) return "sleep";
    return R.isWalking ? "walk" : "idle";
  }

  function applyConfigPatch(obj = {}) {
    if (typeof obj.vcp1_scale === "number" && !Number.isNaN(obj.vcp1_scale)) CONFIG.scale = obj.vcp1_scale;
    if (typeof obj.vcp1_offset === "number" && !Number.isNaN(obj.vcp1_offset)) CONFIG.offset = obj.vcp1_offset;
    if (typeof obj.vcp1_lerp === "number" && !Number.isNaN(obj.vcp1_lerp)) CONFIG.lerp = obj.vcp1_lerp;
    if (typeof obj.vcp1_edgeRest === "boolean") CONFIG.edgeRest = obj.vcp1_edgeRest;
    if (typeof obj.vcp1_avoidCursor === "boolean") CONFIG.avoidCursor = obj.vcp1_avoidCursor;
    if (typeof obj.vcp1_personality === "string" && PERSONALITY_PRESETS[obj.vcp1_personality]) CONFIG.personality = obj.vcp1_personality;
    if (rustCore) rustCore.setConfig({ offset: effectiveOffset(), lerp: effectiveLerp(), avoidCursor: CONFIG.avoidCursor });
    if (!CONFIG.edgeRest) setCoreRestTarget(null);
  }

  return {
    backend() { return rustCore ? rustCore.backend : "js"; },
    setConfig: applyConfigPatch,
    setMeta(m) { meta = m; R.anim = { name: "idle", frame: 0, row: 0, accMs: 0 }; },
    setDisplayBounds(bounds = []) {
      displayBounds = bounds
        .filter((b) => b && Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.width) && Number.isFinite(b.height))
        .map((b) => ({ x: b.x, y: b.y, width: b.width, height: b.height }));
    },
    hasMeta() { return !!meta; },
    // 有効化時などにカーソル位置へ配置
    resetTo(x, y, now) {
      R.pos.x = x; R.pos.y = y; R.target.x = x; R.target.y = y;
      R.lastMouse.x = x; R.lastMouse.y = y; R.lastMouse.t = now;
      R.offsetDir.x = IDLE_OFFSET_DIR.x; R.offsetDir.y = IDLE_OFFSET_DIR.y;
      R.velAvg.x = 0; R.velAvg.y = 0; R.speedAvg = 0; R.lastMoveTs = now;
      R.moveDir.x = 0; R.moveDir.y = 0;
      setCoreRestTarget(null);
      if (rustCore) rustCore.resetTo(x, y, now);
    },
    updateCursor(x, y, now) {
      // 実際にカーソルが動いた時だけ無操作タイマーを更新する。
      // sim ループは静止中も毎フレーム updateCursor を呼ぶため、無条件更新だと
      // sleep の無操作判定が永遠に発火しない。
      const moved = x !== R.lastMouse.x || y !== R.lastMouse.y;
      const dt = Math.max(1, now - (R.lastMouse.t || now));
      const vx = (x - R.lastMouse.x) * (1000 / dt);
      const vy = (y - R.lastMouse.y) * (1000 / dt);
      const S = 0.2;
      R.velAvg.x = R.velAvg.x * (1 - S) + vx * S;
      R.velAvg.y = R.velAvg.y * (1 - S) + vy * S;
      R.speedAvg = Math.hypot(R.velAvg.x, R.velAvg.y);
      R.lastMouse.x = x; R.lastMouse.y = y; R.lastMouse.t = now;
      if (moved) {
        R.lastMoveTs = now;
        setCoreRestTarget(null);
      }
      if (rustCore) rustCore.updateCursor(x, y, now);
    },
    // 1フレーム進める。グローバル座標の描画情報を返す（meta未設定なら null）。
    step(dtMs, now) {
      if (!meta) return null;
      const desired = pickStateBySpeed(now);
      if (desired !== R.anim.name) {
        if (!R.pendingState || R.pendingState.name !== desired) R.pendingState = { name: desired, queuedAt: now };
        const cur = meta.states[R.anim.name];
        const atEnd = R.anim.frame >= cur.frames - 1;
        const timedOut = (now - R.pendingState.queuedAt) > 300;
        if (atEnd || timedOut) {
          R.anim.name = R.pendingState.name;
          R.anim.row = pickRowForState(R.anim.name);
          R.pendingState = null;
        }
      } else {
        R.pendingState = null;
      }

      const prevX = R.pos.x;
      const prevY = R.pos.y;
      refreshRestTarget();

      if (rustCore) {
        const next = rustCore.step(dtMs);
        R.pos.x = next.x;
        R.pos.y = next.y;
        R.isWalking = next.walking;
      } else {
        computeTarget();
        const dx = R.target.x - R.pos.x;
        const dy = R.target.y - R.pos.y;
        const dist = Math.hypot(dx, dy);
        if (dist > ARRIVE_RADIUS_PX) {
          const ws = walkSpeedFromConfig();
          const sp = dist < SLOW_RADIUS_PX ? ws * (dist / SLOW_RADIUS_PX) : ws;
          const mdt = Math.min(dtMs, 50);
          const md = Math.min(dist, sp * (mdt / 1000));
          R.pos.x += (dx / dist) * md;
          R.pos.y += (dy / dist) * md;
          R.isWalking = true;
        } else {
          R.isWalking = false;
        }
      }

      // 向き選択用に、ポケモン自身の移動方向をEMAで平滑化して記録する。
      // 平滑化により、到着間際の極小・不安定な1フレーム移動で向きがパタつくのを防ぐ。
      const moveX = R.pos.x - prevX;
      const moveY = R.pos.y - prevY;
      R.moveDir.x += (moveX - R.moveDir.x) * MOVE_DIR_SMOOTHING;
      R.moveDir.y += (moveY - R.moveDir.y) * MOVE_DIR_SMOOTHING;

      const st = meta.states[R.anim.name];
      // 待機(idle)だけ再生速度を落とす。止まっている時の動きを少しゆっくりに。
      const animSpeed = R.anim.name === "idle" ? effectiveIdleAnimSpeed() : 1;
      const mspf = (1000 / st.fps) / animSpeed;
      R.anim.accMs += dtMs;
      while (R.anim.accMs >= mspf) { R.anim.accMs -= mspf; R.anim.frame = (R.anim.frame + 1) % st.frames; }
      R.anim.row = pickRowForState(R.anim.name);

      return {
        x: R.pos.x,
        y: R.pos.y,
        state: R.anim.name,
        frame: R.anim.frame % st.frames,
        row: R.anim.row,
        scale: CONFIG.scale,
      };
    },
  };
}

module.exports = { createFollowerSim };

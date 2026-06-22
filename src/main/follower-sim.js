// 追従＋アニメーションの状態機械（グローバル画面座標）。
// 旧 overlay.js のロジックを移植。DOM 非依存・メインプロセスが駆動し、
// 各ウィンドウへ「どこに描くか」を渡す。これによりモニター間移動が
// ワープ無しで連続する（座標がグローバルなので境界をなめらかに越える）。

const path = require("node:path");
const { createRustFollowerCore } = require("./rust-follower-core.js");

const SLEEP_TIMEOUT_MS = 30000; // 無操作30sで sleep
const ARRIVE_RADIUS_PX = 6;
const SLOW_RADIUS_PX = 60;
// 「遠いと速足」: 遠いほど速く（最大QUICK_MULT倍）。START以下=通常、FULL以上=最大、間は線形。
// スプライト・向きは変えない。Rustコア(quick_step_mult)と同ロジック。
const QUICK_START_PX = 120;
const QUICK_FULL_PX = 320;
const QUICK_MULT = 2.2;
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
const CURSOR_CLEARANCE_STRONG_PX = 88;
const ROAM_PADDING_PX = 24;
const ROAM_ARRIVE_RADIUS_PX = 12;
const ROAM_POINTS = [
  { x: 0.18, y: 0.24 },
  { x: 0.76, y: 0.30 },
  { x: 0.42, y: 0.70 },
  { x: 0.84, y: 0.64 },
  { x: 0.26, y: 0.56 },
];
const PERSONALITY_PRESETS = {
  standard: { offset: 1.0, lerp: 1.0, idleAnim: 1.0, edgeRestIdle: 1.0, roamIdle: 1.0, roamSleepEvery: 5 },
  active: { offset: 0.85, lerp: 1.25, idleAnim: 1.25, edgeRestIdle: 1.25, roamIdle: 0.55, roamSleepEvery: 7 },
  relaxed: { offset: 1.25, lerp: 0.75, idleAnim: 0.75, edgeRestIdle: 0.75, roamIdle: 1.75, roamSleepEvery: 3 },
  friendly: { offset: 0.70, lerp: 1.10, idleAnim: 1.10, edgeRestIdle: 0.90, roamIdle: 0.85, roamSleepEvery: 5 },
};
const REACTION_MODES = {
  normal: { offset: 1.0, lerp: 1.0, idleAnim: 1.0, edgeRestIdle: 1.0 },
  calm: { offset: 1.18, lerp: 0.82, idleAnim: 0.78, edgeRestIdle: 0.75 },
  break: { offset: 0.66, lerp: 1.18, idleAnim: 1.18, edgeRestIdle: 1.2 },
  focus: { offset: 1.35, lerp: 0.72, idleAnim: 0.72, edgeRestIdle: 0.65 },
  busy: { offset: 1.45, lerp: 0.70, idleAnim: 0.68, edgeRestIdle: 0.55 },
  friendly: { offset: 0.78, lerp: 1.08, idleAnim: 1.08, edgeRestIdle: 1.0 },
};

function createFollowerSim(options = {}) {
  const CONFIG = { scale: 1.25, offset: 70, lerp: 0.20, edgeRest: true, avoidCursor: true, avoidCursorStrength: "normal", personality: "standard", mode: "follow", reactionMode: "normal" };
  const rustCore = createRustFollowerCore(options.rootDir || path.join(__dirname, "..", ".."));
  let displayBounds = [];
  let restSurfaces = [];
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
    roamTarget: null,
    roamWaitUntil: 0,
    roamSleepUntil: 0,
    roamStep: 0,
  };

  function hasState(name) { return !!(meta && meta.states && meta.states[name]); }

  function walkSpeedFromConfig() {
    const t = (effectiveLerp() - SPEED_CONFIG_MIN) / (SPEED_CONFIG_MAX - SPEED_CONFIG_MIN);
    const c = Math.min(1, Math.max(0, t));
    return WALK_SPEED_MIN_PXPS + c * (WALK_SPEED_MAX_PXPS - WALK_SPEED_MIN_PXPS);
  }

  // 距離に応じた速度倍率。START以下=1.0、FULL以上=QUICK_MULT、間は線形（Rust quick_step_mult と一致）。
  function quickStepMult(dist) {
    const t = Math.min(1, Math.max(0, (dist - QUICK_START_PX) / (QUICK_FULL_PX - QUICK_START_PX)));
    return 1 + t * (QUICK_MULT - 1);
  }

  function personalityPreset() {
    return PERSONALITY_PRESETS[CONFIG.personality] || PERSONALITY_PRESETS.standard;
  }

  function reactionPreset() {
    return REACTION_MODES[CONFIG.reactionMode] || REACTION_MODES.normal;
  }

  function effectiveOffset() {
    return Math.max(0, CONFIG.offset * personalityPreset().offset * reactionPreset().offset);
  }

  function effectiveLerp() {
    return clamp(CONFIG.lerp * personalityPreset().lerp * reactionPreset().lerp, SPEED_CONFIG_MIN, SPEED_CONFIG_MAX);
  }

  function effectiveIdleAnimSpeed() {
    return IDLE_ANIM_SPEED * personalityPreset().idleAnim * reactionPreset().idleAnim;
  }

  function effectiveEdgeRestIdleMs() {
    return EDGE_REST_IDLE_MS * personalityPreset().edgeRestIdle * reactionPreset().edgeRestIdle;
  }

  function effectiveCursorClearance() {
    return CONFIG.avoidCursorStrength === "strong" ? CURSOR_CLEARANCE_STRONG_PX : CURSOR_CLEARANCE_PX;
  }

  function effectiveRoamIdleMs() {
    return 1400 * personalityPreset().roamIdle;
  }

  function effectiveRoamSleepMs() {
    return 2600 * personalityPreset().roamIdle;
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
    const windowTarget = computeWindowEdgeRestTarget(bounds, size);
    if (windowTarget) return windowTarget;
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

  function computeWindowEdgeRestTarget(display, size) {
    const halfW = size.w / 2;
    const halfH = size.h / 2;
    const candidates = restSurfaces
      .filter((s) => s && s.kind === "window" && Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.width) && Number.isFinite(s.height))
      .filter((s) => s.width > size.w + EDGE_REST_PADDING_PX * 2 && s.height > size.h + EDGE_REST_PADDING_PX * 2)
      .filter((s) => R.lastMouse.x >= s.x && R.lastMouse.x <= s.x + s.width && R.lastMouse.y >= s.y && R.lastMouse.y <= s.y + s.height);
    if (candidates.length === 0) return null;
    const surface = candidates[0];
    const displayLeft = display.x + halfW + EDGE_REST_PADDING_PX;
    const displayRight = display.x + display.width - halfW - EDGE_REST_PADDING_PX;
    const displayTop = display.y + halfH + EDGE_REST_PADDING_PX;
    const displayBottom = display.y + display.height - halfH - EDGE_REST_PADDING_PX;
    const left = clamp(surface.x + halfW + EDGE_REST_PADDING_PX, displayLeft, displayRight);
    const right = clamp(surface.x + surface.width - halfW - EDGE_REST_PADDING_PX, displayLeft, displayRight);
    if (right < left) return null;
    const topCandidate = clamp(surface.y - halfH, displayTop, displayBottom);
    const bottomCandidate = clamp(surface.y + surface.height + halfH, displayTop, displayBottom);
    const y = R.lastMouse.y < surface.y + surface.height / 2 ? topCandidate : bottomCandidate;
    return {
      x: clamp(R.lastMouse.x, left, right),
      y,
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

  function clampToDisplay(target, bounds) {
    const size = frameSizeForCurrentState();
    const halfW = size.w / 2;
    const halfH = size.h / 2;
    const left = bounds.x + halfW + ROAM_PADDING_PX;
    const right = bounds.x + bounds.width - halfW - ROAM_PADDING_PX;
    const top = bounds.y + halfH + ROAM_PADDING_PX;
    const bottom = bounds.y + bounds.height - halfH - ROAM_PADDING_PX;
    if (right < left || bottom < top) return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    return {
      x: clamp(target.x, left, right),
      y: clamp(target.y, top, bottom),
    };
  }

  function chooseRoamTarget() {
    const bounds = displayForPoint(R.pos.x, R.pos.y) || displayForPoint(R.lastMouse.x, R.lastMouse.y);
    if (!bounds) return { x: R.pos.x, y: R.pos.y };
    if (CONFIG.personality === "friendly" && R.roamStep % 4 === 3) {
      const side = R.roamStep % 2 === 0 ? 1 : -1;
      return clampToDisplay({ x: R.lastMouse.x + side * 90, y: R.lastMouse.y - 70 }, bounds);
    }
    const point = ROAM_POINTS[R.roamStep % ROAM_POINTS.length];
    return clampToDisplay({
      x: bounds.x + bounds.width * point.x,
      y: bounds.y + bounds.height * point.y,
    }, bounds);
  }

  function prepareRoamTarget(now) {
    if (R.roamSleepUntil > now || R.roamWaitUntil > now) {
      setCoreRestTarget({ x: R.pos.x, y: R.pos.y });
      return;
    }
    if (!R.roamTarget) R.roamTarget = chooseRoamTarget();
    setCoreRestTarget(R.roamTarget);
  }

  function finishRoamTargetIfArrived(now) {
    if (!R.roamTarget) return;
    if (Math.hypot(R.pos.x - R.roamTarget.x, R.pos.y - R.roamTarget.y) > ROAM_ARRIVE_RADIUS_PX) return;
    R.roamStep += 1;
    R.roamTarget = null;
    R.roamWaitUntil = now + effectiveRoamIdleMs();
    const sleepEvery = personalityPreset().roamSleepEvery;
    if (hasState("sleep") && sleepEvery > 0 && R.roamStep % sleepEvery === 0) {
      R.roamSleepUntil = now + effectiveRoamSleepMs();
      R.roamWaitUntil = R.roamSleepUntil;
    }
    setCoreRestTarget({ x: R.pos.x, y: R.pos.y });
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
      const clearance = effectiveCursorClearance();
      if (dist < clearance) {
        const ux = dist > 0.001 ? dx / dist : R.offsetDir.x;
        const uy = dist > 0.001 ? dy / dist : R.offsetDir.y;
        R.target.x = R.lastMouse.x + ux * clearance;
        R.target.y = R.lastMouse.y + uy * clearance;
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
    if (CONFIG.mode === "roam") {
      if (hasState("sleep") && R.roamSleepUntil > now) return "sleep";
      if (R.roamWaitUntil > now) return "idle";
      return R.roamTarget ? "walk" : "idle";
    }
    if (hasState("sleep") && (now - R.lastMoveTs) > SLEEP_TIMEOUT_MS) return "sleep";
    return R.isWalking ? "walk" : "idle";
  }

  function applyConfigPatch(obj = {}) {
    if (typeof obj.vcp1_scale === "number" && !Number.isNaN(obj.vcp1_scale)) CONFIG.scale = obj.vcp1_scale;
    if (typeof obj.vcp1_offset === "number" && !Number.isNaN(obj.vcp1_offset)) CONFIG.offset = obj.vcp1_offset;
    if (typeof obj.vcp1_lerp === "number" && !Number.isNaN(obj.vcp1_lerp)) CONFIG.lerp = obj.vcp1_lerp;
    if (typeof obj.vcp1_edgeRest === "boolean") CONFIG.edgeRest = obj.vcp1_edgeRest;
    if (typeof obj.vcp1_avoidCursor === "boolean") CONFIG.avoidCursor = obj.vcp1_avoidCursor;
    if (obj.vcp1_avoidCursorStrength === "normal" || obj.vcp1_avoidCursorStrength === "strong") CONFIG.avoidCursorStrength = obj.vcp1_avoidCursorStrength;
    if (typeof obj.vcp1_personality === "string" && PERSONALITY_PRESETS[obj.vcp1_personality]) CONFIG.personality = obj.vcp1_personality;
    if (typeof obj.vcp1_reactionMode === "string" && REACTION_MODES[obj.vcp1_reactionMode]) CONFIG.reactionMode = obj.vcp1_reactionMode;
    if (obj.vcp1_mode === "follow" || obj.vcp1_mode === "roam") {
      CONFIG.mode = obj.vcp1_mode;
      R.roamTarget = null;
      R.roamWaitUntil = 0;
      R.roamSleepUntil = 0;
      setCoreRestTarget(null);
    }
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
    setRestSurfaces(surfaces = []) {
      restSurfaces = surfaces
        .filter((s) => s && Number.isFinite(s.x) && Number.isFinite(s.y) && Number.isFinite(s.width) && Number.isFinite(s.height))
        .map((s) => ({ kind: s.kind || "window", x: s.x, y: s.y, width: s.width, height: s.height }));
    },
    hasMeta() { return !!meta; },
    // 有効化時などにカーソル位置へ配置
    resetTo(x, y, now) {
      R.pos.x = x; R.pos.y = y; R.target.x = x; R.target.y = y;
      R.lastMouse.x = x; R.lastMouse.y = y; R.lastMouse.t = now;
      R.offsetDir.x = IDLE_OFFSET_DIR.x; R.offsetDir.y = IDLE_OFFSET_DIR.y;
      R.velAvg.x = 0; R.velAvg.y = 0; R.speedAvg = 0; R.lastMoveTs = now;
      R.moveDir.x = 0; R.moveDir.y = 0;
      R.roamTarget = null; R.roamWaitUntil = 0; R.roamSleepUntil = 0; R.roamStep = 0;
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
      if (moved && CONFIG.mode === "follow") {
        R.lastMoveTs = now;
        setCoreRestTarget(null);
      }
      if (rustCore) rustCore.updateCursor(x, y, now);
    },
    // 1フレーム進める。グローバル座標の描画情報を返す（meta未設定なら null）。
    step(dtMs, now) {
      if (!meta) return null;
      if (CONFIG.mode === "roam") prepareRoamTarget(now);
      else refreshRestTarget();
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
          const sp = dist < SLOW_RADIUS_PX
            ? ws * (dist / SLOW_RADIUS_PX) // 到着減速
            : ws * quickStepMult(dist); // 遠いほど速足
          const mdt = Math.min(dtMs, 50);
          const md = Math.min(dist, sp * (mdt / 1000));
          R.pos.x += (dx / dist) * md;
          R.pos.y += (dy / dist) * md;
          R.isWalking = true;
        } else {
          R.isWalking = false;
        }
      }

      if (CONFIG.mode === "roam") finishRoamTargetIfArrived(now);

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

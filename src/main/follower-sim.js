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
const IDLE_OFFSET_DIR = { x: 0.72, y: 0.69 };

function createFollowerSim() {
  const CONFIG = { scale: 1.25, offset: 70, lerp: 0.20 };
  const rustCore = createRustFollowerCore(path.join(__dirname, "..", ".."));
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
  };

  function hasState(name) { return !!(meta && meta.states && meta.states[name]); }

  function walkSpeedFromConfig() {
    const t = (CONFIG.lerp - SPEED_CONFIG_MIN) / (SPEED_CONFIG_MAX - SPEED_CONFIG_MIN);
    const c = Math.min(1, Math.max(0, t));
    return WALK_SPEED_MIN_PXPS + c * (WALK_SPEED_MAX_PXPS - WALK_SPEED_MIN_PXPS);
  }

  function computeTarget() {
    const speed = R.speedAvg || 0;
    const hasDir = speed > 40;
    const OFFSET = CONFIG.offset;
    let dX, dY;
    if (hasDir) { dX = -(R.velAvg.x / (speed || 1)); dY = -(R.velAvg.y / (speed || 1)); }
    else { dX = IDLE_OFFSET_DIR.x; dY = IDLE_OFFSET_DIR.y; }
    const OD_LERP = 0.08;
    R.offsetDir.x += (dX - R.offsetDir.x) * OD_LERP;
    R.offsetDir.y += (dY - R.offsetDir.y) * OD_LERP;
    R.target.x = R.lastMouse.x + R.offsetDir.x * OFFSET;
    R.target.y = R.lastMouse.y + R.offsetDir.y * OFFSET;
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
    const dir8 = pickDir8(R.velAvg.x, R.velAvg.y);
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
    if (rustCore) rustCore.setConfig({ offset: CONFIG.offset, lerp: CONFIG.lerp });
  }

  return {
    backend() { return rustCore ? rustCore.backend : "js"; },
    setConfig: applyConfigPatch,
    setMeta(m) { meta = m; R.anim = { name: "idle", frame: 0, row: 0, accMs: 0 }; },
    hasMeta() { return !!meta; },
    // 有効化時などにカーソル位置へ配置
    resetTo(x, y, now) {
      R.pos.x = x; R.pos.y = y; R.target.x = x; R.target.y = y;
      R.lastMouse.x = x; R.lastMouse.y = y; R.lastMouse.t = now;
      R.offsetDir.x = IDLE_OFFSET_DIR.x; R.offsetDir.y = IDLE_OFFSET_DIR.y;
      R.velAvg.x = 0; R.velAvg.y = 0; R.speedAvg = 0; R.lastMoveTs = now;
      if (rustCore) rustCore.resetTo(x, y, now);
    },
    updateCursor(x, y, now) {
      const dt = Math.max(1, now - (R.lastMouse.t || now));
      const vx = (x - R.lastMouse.x) * (1000 / dt);
      const vy = (y - R.lastMouse.y) * (1000 / dt);
      const S = 0.2;
      R.velAvg.x = R.velAvg.x * (1 - S) + vx * S;
      R.velAvg.y = R.velAvg.y * (1 - S) + vy * S;
      R.speedAvg = Math.hypot(R.velAvg.x, R.velAvg.y);
      R.lastMouse.x = x; R.lastMouse.y = y; R.lastMouse.t = now; R.lastMoveTs = now;
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

      const st = meta.states[R.anim.name];
      const mspf = 1000 / st.fps;
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

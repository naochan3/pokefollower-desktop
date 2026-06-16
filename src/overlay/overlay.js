// === VCP1 content script: load pack JSON + animate idle/walk with left/right flip ===
const DEFAULT_PACK = "retro/gen-1/009-blastoise";

const STATE = {
  enabled: false,
  pack: DEFAULT_PACK,  // default
  facingLeft: false
};

let followerEl = null;
let rafId = null;
let running = false;

const RUNTIME = {
  meta: null,                 // loaded JSON pack
  images: {},                 // { idle: Image, walk: Image }
  anim: { name: "idle", frame: 0, row: 0, accMs: 0 },
  lastMoveTs: 0,
  lastMouse: { x: 0, y: 0, t: 0 },

  // position/target and smoothed velocity
  pos:       { x: 0, y: 0 },
  target:    { x: 0, y: 0 },
  offsetDir:    { x: 0, y: -1 }, // lerped unit vector for idle→walk glide (perch placement)
  isWalking:    false,           // true while the follower is actively walking toward its target
  pendingState: null,             // { name, queuedAt } — deferred state switch
  velAvg:    { x: 0, y: 0 },
  speedAvg:  0
};

// --- behavior thresholds ---
const SLEEP_TIMEOUT_MS = 30000; // 30s of no movement -> sleep
const ARRIVE_RADIUS_PX = 6;     // close enough to target to call it "arrived" and settle into idle
const SLOW_RADIUS_PX   = 60;    // ease walking speed down within this distance for a soft landing

function hasState(name) {
  return !!(RUNTIME.meta && RUNTIME.meta.states && RUNTIME.meta.states[name]);
}
// --- UI-configurable tuning (persisted by the main process) ---
const CONFIG = {
  scale: 1.25,   // visual scale multiplier
  offset: 30,    // px distance from cursor (trail/perch)
  lerp: 0.20     // follow smoothing (0..1), lower = floatier
};
function applyConfigPatch(obj = {}) {
  if (typeof obj.vcp1_scale  === "number" && !Number.isNaN(obj.vcp1_scale))  CONFIG.scale  = obj.vcp1_scale;
  if (typeof obj.vcp1_offset === "number" && !Number.isNaN(obj.vcp1_offset)) CONFIG.offset = obj.vcp1_offset;
  if (typeof obj.vcp1_lerp   === "number" && !Number.isNaN(obj.vcp1_lerp))   CONFIG.lerp   = obj.vcp1_lerp;
}

// Map the popup's "SPEED" slider (stored/transmitted as vcp1_lerp, internal range ~0.05–0.50)
// onto a walking speed in px/s, so the follower travels at a steady, natural pace
// instead of being eased toward a moving point (which is what produced the "leash" drag).
const WALK_SPEED_MIN_PXPS = 80;   // px/s at the slowest "speed" setting
const WALK_SPEED_MAX_PXPS = 640;  // px/s at the fastest "speed" setting
const SPEED_CONFIG_MIN = 0.05;
const SPEED_CONFIG_MAX = 0.50;
function walkSpeedFromConfig() {
  const t = (CONFIG.lerp - SPEED_CONFIG_MIN) / (SPEED_CONFIG_MAX - SPEED_CONFIG_MIN);
  const clamped = Math.min(1, Math.max(0, t));
  return WALK_SPEED_MIN_PXPS + clamped * (WALK_SPEED_MAX_PXPS - WALK_SPEED_MIN_PXPS);
}

// --- follow targeting: trail the cursor when moving; perch above when idle
function computeTarget() {
  const speed = RUNTIME.speedAvg || 0;
  const hasDir = speed > 40;
  const OFFSET = CONFIG.offset;

  // Desired offset direction (unit vector)
  let desiredX, desiredY;
  if (hasDir) {
    desiredX = -(RUNTIME.velAvg.x / (speed || 1));
    desiredY = -(RUNTIME.velAvg.y / (speed || 1));
  } else {
    desiredX = 0;
    desiredY = -1; // idle: above cursor
  }

  // Lerp offset direction so idle→walk transition glides instead of snapping
  const OD_LERP = 0.08;
  RUNTIME.offsetDir.x += (desiredX - RUNTIME.offsetDir.x) * OD_LERP;
  RUNTIME.offsetDir.y += (desiredY - RUNTIME.offsetDir.y) * OD_LERP;

  RUNTIME.target.x = (RUNTIME.lastMouse?.x || 0) + RUNTIME.offsetDir.x * OFFSET;
  RUNTIME.target.y = (RUNTIME.lastMouse?.y || 0) + RUNTIME.offsetDir.y * OFFSET;
}

// --- 8-way facing from a direction vector (octants) ---
function pickDir8FromVector(vx, vy) {
  const dead = 0.3; // small deadzone to reduce jitter
  if (Math.abs(vx) <= dead && Math.abs(vy) <= dead) return "front";
  // DOM coords: +y is downward => vy>0 means "front"
  const angle = Math.atan2(vy, vx);                  // -PI..PI, 0 = right
  const norm  = (angle + 2 * Math.PI) % (2 * Math.PI); // 0..2PI
  const idx   = Math.floor((norm + Math.PI / 8) / (Math.PI / 4)) % 8;
  // clockwise from right
  const keys8 = [
    "right",      // 0
    "frontRight", // 1
    "front",      // 2
    "frontLeft",  // 3
    "left",       // 4
    "backLeft",   // 5
    "back",       // 6
    "backRight"   // 7
  ];
  return keys8[idx];
}

// Map that direction to a row index using the pack's rows table for the given state
function pickRowForState(stateName) {
  const st = RUNTIME.meta?.states?.[stateName];
  if (!st) return 0;
  const rows = st.rows || { front: 0 };

  // Prefer 8-way if present, else fall back to nearest cardinal.
  // Face based on the cursor's own direction of travel — the follower's path
  // can lag/curve while it catches up, but it should still visibly look like
  // it's heading toward (or alongside) the cursor, not its own catch-up route.
  const dir8 = pickDir8FromVector(RUNTIME.velAvg.x, RUNTIME.velAvg.y);
  if (dir8 in rows) return rows[dir8];

  // Map diagonal to nearest cardinal if diagonal key missing
  const fallbackMap = {
    frontRight: "front",
    frontLeft:  "front",
    backRight:  "back",
    backLeft:   "back"
  };
  const fallback = fallbackMap[dir8] || dir8; // if already cardinal, keep it
  return (fallback in rows) ? rows[fallback] : (rows.front ?? 0);
}

function extUrl(rel) { return "app://bundle/" + String(rel).replace(/^\/+/, ""); }

function createFollower() {
  if (followerEl) return;
  followerEl = document.createElement("div");
  followerEl.id = "__vcp1_follower";
  Object.assign(followerEl.style, {
    position: "fixed",
    left: "0px",
    top: "0px",
    width: "40px",
    height: "40px",
    pointerEvents: "none",
    zIndex: "2147483647",
    willChange: "transform, background-position, background-image",
    backgroundRepeat: "no-repeat",
    imageRendering: "pixelated", // crisp for retro sheets
    transition: "transform 120ms linear, width 120ms linear, height 120ms linear"
  });
  document.documentElement.appendChild(followerEl);
}

function removeFollower() {
  if (followerEl?.parentNode) followerEl.parentNode.removeChild(followerEl);
  followerEl = null;
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
}

function packSlug() {
  // STATE.pack like "retro/gen-1/009-blastoise" -> "009-blastoise"
  const parts = STATE.pack.split("/");
  return parts[parts.length - 1];
}

function sheetUrlFor(stateName) {
  const st = RUNTIME.meta && RUNTIME.meta.states ? RUNTIME.meta.states[stateName] : null;
  const sheetFilename = st && st.sheet ? st.sheet : "";
  const metaPath = typeof RUNTIME.meta?.rawPath === "string" ? RUNTIME.meta.rawPath.trim() : "";
  const slug = metaPath ? metaPath.replace(/^\/+|\/+$/g, "") : packSlug();
  const rawFolder = `assets/raw/${slug}/`;
  return extUrl(rawFolder + sheetFilename);
}

function ensureImagesLoaded(meta) {
  const tasks = [];
  Object.keys(meta.states).forEach((k) => {
    const img = new Image();
    img.src = sheetUrlFor(k);
    RUNTIME.images[k] = img;
    tasks.push(new Promise((resolve) => {
      img.onload = resolve; img.onerror = resolve;
    }));
  });
  return Promise.all(tasks);
}
function resetAnimationForNewPack() {
  // Start from idle; row will be resolved in tick() via pickRowForState
  RUNTIME.anim = { name: "idle", frame: 0, row: 0, accMs: 0 };
}

function applyFrame() {
  const st = RUNTIME.meta && RUNTIME.meta.states && RUNTIME.meta.states[RUNTIME.anim.name];
  if (!st || !st.frame || typeof st.frames !== "number" || !Number.isFinite(st.frames)) {
    // Defensive: if pack schema is missing or wrong, skip this frame rather than crash
    return;
  }
  const { w, h } = st.frame;
  const frame = RUNTIME.anim.frame % st.frames;
  const rowIndex = RUNTIME.anim.row || 0;
  const bpx = -(frame * w);
  const bpy = -(rowIndex * h);

  followerEl.style.width  = `${w}px`;
  followerEl.style.height = `${h}px`;
  followerEl.style.backgroundImage = `url("${sheetUrlFor(RUNTIME.anim.name)}")`;
  // Keep sheet at natural size so backgroundPosition aligns to frame pixels
  const img = RUNTIME.images[RUNTIME.anim.name];
  if (img?.naturalWidth && img?.naturalHeight) {
    followerEl.style.backgroundSize = `${img.naturalWidth}px ${img.naturalHeight}px`;
  }
  followerEl.style.backgroundRepeat = "no-repeat";
  followerEl.style.imageRendering = "pixelated";
  followerEl.style.backgroundPosition = `${bpx}px ${bpy}px`;

  const SCALE_VAL = CONFIG.scale;
  followerEl.style.transform =
    `translate(${Math.round(RUNTIME.pos.x)}px, ${Math.round(RUNTIME.pos.y)}px) ` +
    `translate(-50%, -50%) ` +
    `scale(${SCALE_VAL})`;
  followerEl.style.transformOrigin = "center center";
}

function pickStateBySpeed() {
  const now = performance.now();
  // If the pack has a 'sleep' state and we've been inactive long enough, sleep.
  if (hasState("sleep") && (now - RUNTIME.lastMoveTs) > SLEEP_TIMEOUT_MS) {
    return "sleep";
  }
  // Otherwise mirror the follower's own motion: walking while it's actually
  // travelling toward its target, idle once it arrives — so the animation
  // always matches what's happening on screen rather than the cursor's speed.
  return RUNTIME.isWalking ? "walk" : "idle";
}

function tick(dtMs) {
  const desired = pickStateBySpeed();
  const nextRow = pickRowForState(desired);
  if (desired !== RUNTIME.anim.name) {
    // Queue the switch; wait for current cycle to finish before committing
    if (!RUNTIME.pendingState || RUNTIME.pendingState.name !== desired) {
      RUNTIME.pendingState = { name: desired, queuedAt: performance.now() };
    }
    const st = RUNTIME.meta.states[RUNTIME.anim.name];
    const atCycleEnd = RUNTIME.anim.frame >= st.frames - 1;
    const timedOut = (performance.now() - RUNTIME.pendingState.queuedAt) > 300;
    if (atCycleEnd || timedOut) {
      RUNTIME.anim.name = RUNTIME.pendingState.name;
      RUNTIME.anim.row  = pickRowForState(RUNTIME.anim.name);
      RUNTIME.pendingState = null;
    }
  } else {
    RUNTIME.pendingState = null;
  }

  // follow feel: walk toward the target at a steady pace, like it's actually
  // travelling there on its own — not eased/snapped toward a moving point on a
  // leash. Direction is recomputed every frame, so it turns naturally as the
  // target (cursor) moves, and eases to a stop on arrival instead of overshooting.
  computeTarget();
  const dx = RUNTIME.target.x - RUNTIME.pos.x;
  const dy = RUNTIME.target.y - RUNTIME.pos.y;
  const dist = Math.hypot(dx, dy);

  if (dist > ARRIVE_RADIUS_PX) {
    const walkSpeed = walkSpeedFromConfig(); // px/s
    const speed = dist < SLOW_RADIUS_PX ? walkSpeed * (dist / SLOW_RADIUS_PX) : walkSpeed;
    // Clamp the per-frame delta so a long frame gap (e.g. tab was backgrounded)
    // can't teleport the follower — it just keeps walking once frames resume.
    const moveDtMs = Math.min(dtMs, 50);
    const moveDist = Math.min(dist, speed * (moveDtMs / 1000));

    RUNTIME.pos.x += (dx / dist) * moveDist;
    RUNTIME.pos.y += (dy / dist) * moveDist;
    RUNTIME.isWalking = true;
  } else {
    RUNTIME.isWalking = false;
  }

  const st = RUNTIME.meta.states[RUNTIME.anim.name];
  const msPerFrame = 1000 / st.fps;
  RUNTIME.anim.accMs += dtMs;
  while (RUNTIME.anim.accMs >= msPerFrame) {
    RUNTIME.anim.accMs -= msPerFrame;
    RUNTIME.anim.frame = (RUNTIME.anim.frame + 1) % st.frames;
  }

  // Keep the row updated continuously for natural facing
  if (RUNTIME.meta && RUNTIME.meta.states) {
    RUNTIME.anim.row = pickRowForState(RUNTIME.anim.name);
  }
  applyFrame();
}

function loop() {
  let last = performance.now();
  const step = () => {
    const now = performance.now();
    const dt = now - last;
    last = now;
    if (followerEl && RUNTIME.meta) tick(dt);
    rafId = requestAnimationFrame(step);
  };
  rafId = requestAnimationFrame(step);
}

function updateCursor(x, y) {
  const now = performance.now();
  const dt = Math.max(1, now - (RUNTIME.lastMouse.t || now)); // ms
  const vx = (x - RUNTIME.lastMouse.x) * (1000 / dt);
  const vy = (y - RUNTIME.lastMouse.y) * (1000 / dt);
  const SMOOTH = 0.2;
  RUNTIME.velAvg.x = RUNTIME.velAvg.x * (1 - SMOOTH) + vx * SMOOTH;
  RUNTIME.velAvg.y = RUNTIME.velAvg.y * (1 - SMOOTH) + vy * SMOOTH;
  RUNTIME.speedAvg = Math.hypot(RUNTIME.velAvg.x, RUNTIME.velAvg.y);
  RUNTIME.lastMouse.x = x;
  RUNTIME.lastMouse.y = y;
  RUNTIME.lastMouse.t = now;
  RUNTIME.lastMoveTs = now;
}

function start() {
  if (running) return;
  running = true;
  createFollower();
  RUNTIME.lastMoveTs = performance.now();
  // initialize position/target around current mouse (in case no movement yet)
  RUNTIME.pos.x = RUNTIME.lastMouse.x;
  RUNTIME.pos.y = RUNTIME.lastMouse.y;
  RUNTIME.target.x = RUNTIME.lastMouse.x;
  RUNTIME.target.y = RUNTIME.lastMouse.y;

  loop();
}

function stop() {
  if (!running) return;
  running = false;
  removeFollower();
}

async function loadPack(packKey) {
  const result = await window.pokeapi.loadPack(packKey); // { resolvedKey, meta }
  STATE.pack = result.resolvedKey;
  RUNTIME.meta = result.meta;
  resetAnimationForNewPack();
  await ensureImagesLoaded(RUNTIME.meta);
  if (followerEl) removeFollower();
  if (running) { createFollower(); loop(); }
}

function applyState() {
  if (STATE.enabled) start(); else stop();
}

// --- デスクトップ版ブート ---
window.pokeapi.onCursor(({ x, y }) => updateCursor(x, y));
window.pokeapi.onConfig((patch) => {
  applyConfigPatch(patch);
  if (followerEl && RUNTIME.meta) applyFrame();
});
window.pokeapi.onPack(async (key) => {
  const prev = STATE.pack;
  try { await loadPack(key); if (followerEl) applyFrame(); }
  catch (_) { STATE.pack = prev; }
});
window.pokeapi.onEnabled((on) => {
  STATE.enabled = !!on;
  applyState();
});

window.pokeapi.onInit(async (s) => {
  STATE.enabled = !!s.enabled;
  applyConfigPatch({ vcp1_scale: s.scale, vcp1_offset: s.offset, vcp1_lerp: s.lerp });
  try { await loadPack(s.pack); } catch (_) { await loadPack("retro/gen-1/009-blastoise"); }
  applyState();
});

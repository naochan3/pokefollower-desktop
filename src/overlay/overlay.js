// 描画役。追従/アニメの計算はメインプロセス（follower-sim）が行い、
// このウィンドウは「毎フレーム言われた位置・コマでスプライトを描く」だけ。
// 各モニターに1枚ずつ常設され、自分の領域に入った分だけ描画する。

let followerEl = null;
let meta = null;
const images = {};
const sheetUrls = {};
const NOTIFICATION_FALLBACK_WIDTH = 292;
const NOTIFICATION_FALLBACK_HEIGHT = 124;
const NOTIFICATION_SIDE_MARGIN = 24;
const NOTIFICATION_BOTTOM_MARGIN = 96;
const FRAME_INTERPOLATION_FALLBACK_MS = 16;
const FRAME_INTERPOLATION_MAX_MS = 80;
let visible = false;
let appliedState = "";
let appliedSize = "";
let appliedBgSize = "";
let appliedFramePosition = "";
let appliedTransform = "";
let renderFromFrame = null;
let renderToFrame = null;
let renderStartMs = 0;
let renderDurationMs = FRAME_INTERPOLATION_FALLBACK_MS;
let renderRafId = 0;
let lastFrameReceivedMs = 0;
let lastRenderedFrame = null;
let notificationEl = null;
let notificationSourceEl = null;
let notificationTitleEl = null;
let notificationBodyEl = null;
let notificationTimer = null;

function extUrl(rel) {
  return "app://bundle/" + String(rel).replace(/^\/+/, "");
}

function sheetUrlFor(state) {
  if (sheetUrls[state]) return sheetUrls[state];
  const st = meta && meta.states ? meta.states[state] : null;
  const sheet = st && st.sheet ? st.sheet : "";
  const raw = typeof meta?.rawPath === "string" ? meta.rawPath.replace(/^\/+|\/+$/g, "") : "";
  const url = extUrl(`assets/raw/${raw}/${sheet}`);
  sheetUrls[state] = url;
  return url;
}

function ensureEl() {
  if (followerEl) return;
  followerEl = document.createElement("div");
  followerEl.id = "__pf_follower";
  Object.assign(followerEl.style, {
    position: "fixed",
    left: "0px",
    top: "0px",
    pointerEvents: "none",
    zIndex: "2147483647",
    backgroundRepeat: "no-repeat",
    imageRendering: "pixelated",
    backfaceVisibility: "hidden",
    willChange: "transform, background-position, background-image",
    transformOrigin: "center center",
    display: "none",
  });
  document.documentElement.appendChild(followerEl);
}

function nowMs() {
  return window.performance && typeof window.performance.now === "function" ? window.performance.now() : Date.now();
}

function cancelRenderLoop() {
  if (!renderRafId) return;
  window.cancelAnimationFrame(renderRafId);
  renderRafId = 0;
}

function resetInterpolation() {
  cancelRenderLoop();
  renderFromFrame = null;
  renderToFrame = null;
  renderStartMs = 0;
  renderDurationMs = FRAME_INTERPOLATION_FALLBACK_MS;
  lastFrameReceivedMs = 0;
  lastRenderedFrame = null;
}

function hideFollower() {
  if (visible) {
    followerEl.style.display = "none";
    visible = false;
  }
  resetInterpolation();
}

function ensureNotificationEl() {
  if (notificationEl) return;
  notificationEl = document.createElement("div");
  notificationEl.id = "__pf_notification";
  Object.assign(notificationEl.style, {
    position: "fixed",
    left: "0px",
    top: "0px",
    boxSizing: "border-box",
    width: "min(292px, calc(100vw - 24px))",
    height: "124px",
    padding: "0 0 10px",
    border: "4px solid #000",
    borderRadius: "0",
    background: "#fff",
    color: "#000",
    boxShadow: "6px 6px 0 #000",
    font: "800 12px/1.35 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    imageRendering: "pixelated",
    pointerEvents: "none",
    zIndex: "2147483647",
    display: "none",
    whiteSpace: "normal",
  });
  notificationSourceEl = document.createElement("div");
  Object.assign(notificationSourceEl.style, {
    display: "block",
    boxSizing: "border-box",
    minHeight: "22px",
    padding: "4px 9px 3px",
    borderBottom: "4px solid #000",
    background: "#EF4036",
    fontSize: "10px",
    lineHeight: "1.2",
    color: "#fff",
    letterSpacing: "0",
    textTransform: "uppercase",
  });
  notificationTitleEl = document.createElement("div");
  Object.assign(notificationTitleEl.style, {
    padding: "9px 10px 0",
    fontSize: "13px",
    lineHeight: "1.3",
    color: "#000",
  });
  notificationBodyEl = document.createElement("div");
  Object.assign(notificationBodyEl.style, {
    padding: "4px 10px 0",
    color: "#222",
    fontSize: "11px",
    fontWeight: "700",
    lineHeight: "1.35",
  });
  notificationEl.append(notificationSourceEl, notificationTitleEl, notificationBodyEl);
  document.documentElement.appendChild(notificationEl);
}

function showCompanionNotification(n) {
  ensureNotificationEl();
  if (notificationTimer) clearTimeout(notificationTimer);
  notificationSourceEl.textContent = n.source || "通知";
  notificationTitleEl.textContent = n.title || "";
  notificationTitleEl.style.display = n.title ? "block" : "none";
  notificationBodyEl.textContent = n.body || "";
  notificationBodyEl.style.display = n.body ? "block" : "none";
  notificationEl.style.display = "block";
  const bubbleWidth = Math.min(NOTIFICATION_FALLBACK_WIDTH, Math.max(1, window.innerWidth - 24));
  const bubbleHeight = Math.min(NOTIFICATION_FALLBACK_HEIGHT, Math.max(1, window.innerHeight - 24));
  const corner = n.corner === "bottom-left" || n.position === "bottom-left" ? "bottom-left" : "bottom-right";
  const sideMargin = Math.min(NOTIFICATION_SIDE_MARGIN, Math.max(0, window.innerWidth - bubbleWidth));
  const bottomMargin = Math.min(NOTIFICATION_BOTTOM_MARGIN, Math.max(0, window.innerHeight - bubbleHeight));
  const maxX = Math.max(sideMargin, window.innerWidth - bubbleWidth - sideMargin);
  const x = corner === "bottom-left" ? sideMargin : maxX;
  const y = Math.max(0, window.innerHeight - bubbleHeight - bottomMargin);
  notificationEl.style.transform = `translate3d(${x.toFixed(0)}px, ${y.toFixed(0)}px, 0)`;
  notificationTimer = setTimeout(() => {
    notificationEl.style.display = "none";
    notificationTimer = null;
  }, Number(n.ttlMs) || 5200);
}

function preloadImages(m) {
  for (const key of Object.keys(images)) delete images[key];
  for (const key of Object.keys(sheetUrls)) delete sheetUrls[key];
  for (const k of Object.keys(m.states || {})) {
    const img = new Image();
    img.src = sheetUrlFor(k);
    images[k] = img;
  }
}

// メタ（パック情報）を受け取って画像をプリロード
window.pokeapi.onMeta((m) => {
  meta = m;
  appliedState = "";
  appliedSize = "";
  appliedBgSize = "";
  appliedFramePosition = "";
  appliedTransform = "";
  resetInterpolation();
  ensureEl();
  preloadImages(m);
});

function applyFrameVisuals(frame, st) {
  const { w, h } = st.frame;
  if (!visible) {
    followerEl.style.display = "block";
    visible = true;
  }
  const sizeKey = `${w}x${h}`;
  if (appliedSize !== sizeKey) {
    followerEl.style.width = `${w}px`;
    followerEl.style.height = `${h}px`;
    appliedSize = sizeKey;
  }
  if (appliedState !== frame.state) {
    followerEl.style.backgroundImage = `url("${sheetUrlFor(frame.state)}")`;
    appliedState = frame.state;
    appliedBgSize = "";
  }
  const img = images[frame.state];
  if (img && img.naturalWidth && img.naturalHeight) {
    const bgSize = `${img.naturalWidth}px ${img.naturalHeight}px`;
    if (appliedBgSize !== bgSize) {
      followerEl.style.backgroundSize = bgSize;
      appliedBgSize = bgSize;
    }
  }
  const framePosition = `${-(frame.frame * w)}px ${-(frame.row * h)}px`;
  if (appliedFramePosition !== framePosition) {
    followerEl.style.backgroundPosition = framePosition;
    appliedFramePosition = framePosition;
  }
}

function applyFrameTransform(frame) {
  const transform = `translate3d(${frame.x.toFixed(2)}px, ${frame.y.toFixed(2)}px, 0) translate(-50%, -50%) scale(${frame.scale})`;
  if (appliedTransform !== transform) {
    followerEl.style.transform = transform;
    appliedTransform = transform;
  }
  lastRenderedFrame = frame;
}

function interpolateFrame(from, to, progress) {
  const p = Math.min(1, Math.max(0, progress));
  return {
    ...to,
    x: from.x + ((to.x - from.x) * p),
    y: from.y + ((to.y - from.y) * p),
    scale: from.scale + ((to.scale - from.scale) * p),
  };
}

function renderInterpolatedFrame(ts) {
  renderRafId = 0;
  if (!visible || !renderFromFrame || !renderToFrame) return;
  const progress = renderDurationMs > 0 ? (ts - renderStartMs) / renderDurationMs : 1;
  const frame = interpolateFrame(renderFromFrame, renderToFrame, progress);
  applyFrameTransform(frame);
  if (progress < 1) {
    renderRafId = window.requestAnimationFrame(renderInterpolatedFrame);
  }
}

function beginInterpolatedRender(frame) {
  const ts = nowMs();
  const elapsed = lastFrameReceivedMs > 0 ? ts - lastFrameReceivedMs : FRAME_INTERPOLATION_FALLBACK_MS;
  const duration = Math.min(FRAME_INTERPOLATION_MAX_MS, Math.max(FRAME_INTERPOLATION_FALLBACK_MS, elapsed));
  renderFromFrame = lastRenderedFrame || frame;
  renderToFrame = frame;
  renderStartMs = ts;
  renderDurationMs = duration;
  lastFrameReceivedMs = ts;
  cancelRenderLoop();
  renderInterpolatedFrame(ts);
}

// 毎フレームの描画指示（座標はこのウィンドウのローカル座標）
window.pokeapi.onFrame((f) => {
  ensureEl();
  if (!f || !f.visible || !meta) {
    hideFollower();
    return;
  }
  const st = meta.states ? meta.states[f.state] : null;
  if (!st || !st.frame || typeof st.frames !== "number") {
    hideFollower();
    return;
  }
  applyFrameVisuals(f, st);
  beginInterpolatedRender(f);
});

window.pokeapi.onCompanionNotification((n) => {
  showCompanionNotification(n);
});

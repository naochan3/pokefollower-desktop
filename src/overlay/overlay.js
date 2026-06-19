// 描画役。追従/アニメの計算はメインプロセス（follower-sim）が行い、
// このウィンドウは「毎フレーム言われた位置・コマでスプライトを描く」だけ。
// 各モニターに1枚ずつ常設され、自分の領域に入った分だけ描画する。

let followerEl = null;
let meta = null;
const images = {};
const sheetUrls = {};
let visible = false;
let appliedState = "";
let appliedSize = "";
let appliedBgSize = "";
let appliedFramePosition = "";
let appliedTransform = "";

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
  ensureEl();
  preloadImages(m);
});

// 毎フレームの描画指示（座標はこのウィンドウのローカル座標）
window.pokeapi.onFrame((f) => {
  ensureEl();
  if (!f || !f.visible || !meta) {
    if (visible) {
      followerEl.style.display = "none";
      visible = false;
    }
    return;
  }
  const st = meta.states ? meta.states[f.state] : null;
  if (!st || !st.frame || typeof st.frames !== "number") {
    if (visible) {
      followerEl.style.display = "none";
      visible = false;
    }
    return;
  }
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
  if (appliedState !== f.state) {
    followerEl.style.backgroundImage = `url("${sheetUrlFor(f.state)}")`;
    appliedState = f.state;
    appliedBgSize = "";
  }
  const img = images[f.state];
  if (img && img.naturalWidth && img.naturalHeight) {
    const bgSize = `${img.naturalWidth}px ${img.naturalHeight}px`;
    if (appliedBgSize !== bgSize) {
      followerEl.style.backgroundSize = bgSize;
      appliedBgSize = bgSize;
    }
  }
  const framePosition = `${-(f.frame * w)}px ${-(f.row * h)}px`;
  if (appliedFramePosition !== framePosition) {
    followerEl.style.backgroundPosition = framePosition;
    appliedFramePosition = framePosition;
  }
  const transform = `translate3d(${f.x.toFixed(2)}px, ${f.y.toFixed(2)}px, 0) translate(-50%, -50%) scale(${f.scale})`;
  if (appliedTransform !== transform) {
    followerEl.style.transform = transform;
    appliedTransform = transform;
  }
});

// 描画役。追従/アニメの計算はメインプロセス（follower-sim）が行い、
// このウィンドウは「毎フレーム言われた位置・コマでスプライトを描く」だけ。
// 各モニターに1枚ずつ常設され、自分の領域に入った分だけ描画する。

let followerEl = null;
let meta = null;
const images = {};

function extUrl(rel) {
  return "app://bundle/" + String(rel).replace(/^\/+/, "");
}

function sheetUrlFor(state) {
  const st = meta && meta.states ? meta.states[state] : null;
  const sheet = st && st.sheet ? st.sheet : "";
  const raw = typeof meta?.rawPath === "string" ? meta.rawPath.replace(/^\/+|\/+$/g, "") : "";
  return extUrl(`assets/raw/${raw}/${sheet}`);
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
    display: "none",
  });
  document.documentElement.appendChild(followerEl);
}

function preloadImages(m) {
  for (const k of Object.keys(m.states || {})) {
    const img = new Image();
    img.src = sheetUrlFor(k);
    images[k] = img;
  }
}

// メタ（パック情報）を受け取って画像をプリロード
window.pokeapi.onMeta((m) => {
  meta = m;
  ensureEl();
  preloadImages(m);
});

// 毎フレームの描画指示（座標はこのウィンドウのローカル座標）
window.pokeapi.onFrame((f) => {
  ensureEl();
  if (!f || !f.visible || !meta) {
    followerEl.style.display = "none";
    return;
  }
  const st = meta.states ? meta.states[f.state] : null;
  if (!st || !st.frame || typeof st.frames !== "number") {
    followerEl.style.display = "none";
    return;
  }
  const { w, h } = st.frame;
  followerEl.style.display = "block";
  followerEl.style.width = `${w}px`;
  followerEl.style.height = `${h}px`;
  followerEl.style.backgroundImage = `url("${sheetUrlFor(f.state)}")`;
  const img = images[f.state];
  if (img && img.naturalWidth && img.naturalHeight) {
    followerEl.style.backgroundSize = `${img.naturalWidth}px ${img.naturalHeight}px`;
  }
  followerEl.style.backgroundPosition = `${-(f.frame * w)}px ${-(f.row * h)}px`;
  followerEl.style.transform =
    `translate3d(${f.x.toFixed(2)}px, ${f.y.toFixed(2)}px, 0) translate(-50%, -50%) scale(${f.scale})`;
  followerEl.style.transformOrigin = "center center";
});

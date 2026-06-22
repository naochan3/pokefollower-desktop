// あいぼうの相棒大表示: パックメタの Idle アニメを背景位置送りで再生する（overlay.js と同方式）。
export function idleSheetUrl(packMeta) {
  const meta = packMeta && packMeta.meta ? packMeta.meta : {};
  const idle = meta.states && meta.states.idle ? meta.states.idle : {};
  return `app://bundle/assets/raw/${meta.rawPath}/${idle.sheet}`;
}
export function frameBackgroundPosition(frameIndex, row, frame) {
  return `${-(frameIndex * frame.w)}px ${-(row * frame.h)}px`;
}
// 整数倍率を返す: フレームが fit(px) の箱に収まる最大の整数倍（くっきり拡大用）。
export function fitScale(frame, fit) {
  if (!fit || fit <= 0) return 1;
  return Math.max(1, Math.floor(fit / Math.max(frame.w, frame.h)));
}
// el: 表示器。packMeta: getPackMeta() の戻り。fit を渡すとその箱に収まる整数倍で拡大（maxScale で上限）。戻り値 stop() でアニメ停止。
export function mountIdleSprite(el, packMeta, { row = 0, fit = 0, maxScale = 4 } = {}) {
  const meta = packMeta && packMeta.meta ? packMeta.meta : null;
  const idle = meta && meta.states && meta.states.idle ? meta.states.idle : null;
  if (!el || !idle) return () => {};
  const { w, h } = idle.frame;
  const frames = Number(idle.frames) || 1;
  const fps = Number(idle.fps) || 8;
  const scale = Math.min(maxScale, fitScale(idle.frame, fit));
  el.style.backgroundImage = `url("${idleSheetUrl(packMeta)}")`;
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
  el.style.backgroundRepeat = "no-repeat";
  el.style.imageRendering = "pixelated";
  // PMDのIdleコマはキャラが上寄り(中身の中心≈0.35h・下35%は影/接地の空白)。
  // 0.15h 下げると見た目がほぼ中央に揃う（全種で中心位置がほぼ一定なので固定比でOK）。
  const dy = (0.15 * h).toFixed(2);
  el.style.transform = `scale(${scale}) translateY(${dy}px)`;
  el.style.transformOrigin = "center";
  el.style.backgroundPosition = frameBackgroundPosition(0, row, idle.frame); // 初期フレームを即表示
  let i = 0, last = 0, raf = 0, running = true;
  const tick = (t) => {
    if (!running) return;
    if (!last) last = t;
    if (t - last >= 1000 / fps) {
      el.style.backgroundPosition = frameBackgroundPosition(i, row, idle.frame);
      i = (i + 1) % frames;
      last = t;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => { running = false; cancelAnimationFrame(raf); };
}

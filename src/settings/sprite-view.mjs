// あいぼうの相棒大表示: パックメタの Idle アニメを背景位置送りで再生する（overlay.js と同方式）。
export function idleSheetUrl(packMeta) {
  const meta = packMeta && packMeta.meta ? packMeta.meta : {};
  const idle = meta.states && meta.states.idle ? meta.states.idle : {};
  return `app://bundle/assets/raw/${meta.rawPath}/${idle.sheet}`;
}
export function frameBackgroundPosition(frameIndex, row, frame) {
  return `${-(frameIndex * frame.w)}px ${-(row * frame.h)}px`;
}
// el: 表示器。packMeta: getPackMeta() の戻り。戻り値 stop() でアニメ停止。
export function mountIdleSprite(el, packMeta, { row = 0 } = {}) {
  const meta = packMeta && packMeta.meta ? packMeta.meta : null;
  const idle = meta && meta.states && meta.states.idle ? meta.states.idle : null;
  if (!el || !idle) return () => {};
  const { w, h } = idle.frame;
  const frames = Number(idle.frames) || 1;
  const fps = Number(idle.fps) || 8;
  el.style.backgroundImage = `url("${idleSheetUrl(packMeta)}")`;
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
  el.style.backgroundRepeat = "no-repeat";
  el.style.imageRendering = "pixelated";
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

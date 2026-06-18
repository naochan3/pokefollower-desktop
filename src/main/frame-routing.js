function spriteGlobalBounds(render, meta) {
  const st = meta && meta.states ? meta.states[render.state] : null;
  const frame = st && st.frame ? st.frame : { w: 96, h: 96 };
  const halfW = (frame.w * render.scale) / 2;
  const halfH = (frame.h * render.scale) / 2;
  return {
    x: render.x - halfW,
    y: render.y - halfH,
    width: halfW * 2,
    height: halfH * 2,
  };
}

function intersects(a, b) {
  return !!a && !!b &&
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y;
}

function frameForOverlay(render, bounds, meta) {
  if (!render || !intersects(bounds, spriteGlobalBounds(render, meta))) return { visible: false };
  return {
    visible: true,
    x: render.x - bounds.x,
    y: render.y - bounds.y,
    state: render.state,
    frame: render.frame,
    row: render.row,
    scale: render.scale,
  };
}

module.exports = { frameForOverlay, intersects, spriteGlobalBounds };

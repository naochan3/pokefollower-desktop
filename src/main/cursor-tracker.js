const { screen } = require("electron");
const { screenPointToOverlay } = require("./cursor-mapping.js");

// onPoint(localPoint) を約60fpsで呼ぶ。停止関数を返す。
function startCursorTracker(getOverlayBounds, onPoint) {
  const timer = setInterval(() => {
    const bounds = getOverlayBounds();
    if (!bounds) return;
    const screenPt = screen.getCursorScreenPoint();
    onPoint(screenPointToOverlay(screenPt, bounds));
  }, 16);
  return () => clearInterval(timer);
}

module.exports = { startCursorTracker };

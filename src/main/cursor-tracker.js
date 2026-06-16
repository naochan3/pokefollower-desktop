const { screen } = require("electron");

// onScreenPoint(screenPoint) を約60fpsで呼ぶ。停止関数を返す。
function startCursorTracker(onScreenPoint) {
  const timer = setInterval(() => {
    onScreenPoint(screen.getCursorScreenPoint());
  }, 16);
  return () => clearInterval(timer);
}

module.exports = { startCursorTracker };

const SHELL_CLASSES = new Set(["Progman", "WorkerW", "Shell_TrayWnd", "Shell_SecondaryTrayWnd", ""]);

function isFullscreenForeground(info, displays) {
  if (!info || SHELL_CLASSES.has(info.cls)) return false;
  if (info.isFullscreen) return true;
  return displays.some((display) => {
    const sf = display.scaleFactor || 1;
    return info.w >= display.bounds.width * sf - 2 && info.h >= display.bounds.height * sf - 2;
  });
}

module.exports = { SHELL_CLASSES, isFullscreenForeground };

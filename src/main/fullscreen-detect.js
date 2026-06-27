// 前面（フォアグラウンド）ウィンドウのサイズとクラス名を取得する。
// 「前面アプリがモニター全体を覆っている＝全画面」かどうかの判定に使い、
// 全画面ゲーム等の上ではポケモンを自動で隠す。
// - 最大化（Chrome等）は作業領域までしか覆わない → 全画面と判定されない
// - デスクトップ/タスクバー等のシェル窓は画面全体サイズだが「クラス名」で除外する

const { execFile, execFileSync } = require("node:child_process");

let getForegroundInfo = () => null;
const MAC_FOREGROUND_FAILURE_BACKOFF_MS = 30000;

function execText(command, args) {
  return execFileSync(command, args, { encoding: "utf8", timeout: 500, windowsHide: true }).trim();
}

function execTextAsync(command, args) {
  return new Promise((resolve) => {
    execFile(command, args, { encoding: "utf8", timeout: 500, windowsHide: true }, (error, stdout) => {
      if (error) resolve(null);
      else resolve(String(stdout || "").trim());
    });
  });
}

function parseNumber(value) {
  const n = Number.parseInt(String(value || "").trim(), 10);
  return Number.isFinite(n) ? n : 0;
}

function parseMacForegroundInfo(output) {
  if (!output) return null;
  const [cls, x, y, w, h, isFullscreen] = String(output).split("\t");
  return { cls: cls || "", x: parseNumber(x), y: parseNumber(y), w: parseNumber(w), h: parseNumber(h), isFullscreen: isFullscreen === "true" };
}

function createFailureBackoffCommandRunner(runCommand, { failureBackoffMs = MAC_FOREGROUND_FAILURE_BACKOFF_MS, now = Date.now } = {}) {
  let nextAllowedAt = 0;
  return async (command, args) => {
    const current = now();
    if (current < nextAllowedAt) return null;
    const output = await runCommand(command, args);
    if (output) {
      nextAllowedAt = 0;
      return output;
    }
    nextAllowedAt = current + failureBackoffMs;
    return null;
  };
}

function createMacForegroundInfoGetter(runCommand = execTextAsync, options = {}) {
  const runWithBackoff = createFailureBackoffCommandRunner(runCommand, options);
  const script = [
    'tell application "System Events"',
    'set frontApp to first application process whose frontmost is true',
    'set appName to name of frontApp',
    'if (count of windows of frontApp) is 0 then return appName & tab & "0" & tab & "0" & tab & "0" & tab & "0" & tab & "false"',
    'set frontWindow to window 1 of frontApp',
    'try',
    'set isFs to value of attribute "AXFullScreen" of frontWindow',
    'on error',
    'set isFs to false',
    'end try',
    'try',
    'set windowPosition to position of frontWindow',
    'set winX to item 1 of windowPosition',
    'set winY to item 2 of windowPosition',
    'on error',
    'set winX to 0',
    'set winY to 0',
    'end try',
    'try',
    'set windowSize to size of frontWindow',
    'set winWidth to item 1 of windowSize',
    'set winHeight to item 2 of windowSize',
    'on error',
    'set winWidth to 0',
    'set winHeight to 0',
    'end try',
    'return appName & tab & winX & tab & winY & tab & winWidth & tab & winHeight & tab & isFs',
    "end tell",
  ].join("\n");
  return async () => parseMacForegroundInfo(await runWithBackoff("osascript", ["-e", script]));
}

function parseLinuxForegroundInfo(state, wmClass, geometry) {
  if (!state || !wmClass || !geometry) return null;
  const widthMatch = geometry.match(/Width:\s+(\d+)/);
  const heightMatch = geometry.match(/Height:\s+(\d+)/);
  const xMatch = geometry.match(/Absolute upper-left X:\s+(-?\d+)/);
  const yMatch = geometry.match(/Absolute upper-left Y:\s+(-?\d+)/);
  const classMatch = wmClass.match(/WM_CLASS\(STRING\) = (.+)$/);
  return {
    cls: classMatch ? classMatch[1] : "",
    x: xMatch ? parseNumber(xMatch[1]) : 0,
    y: yMatch ? parseNumber(yMatch[1]) : 0,
    w: widthMatch ? parseNumber(widthMatch[1]) : 0,
    h: heightMatch ? parseNumber(heightMatch[1]) : 0,
    isFullscreen: state.includes("_NET_WM_STATE_FULLSCREEN"),
  };
}

function createLinuxForegroundInfoGetter(runCommand = execTextAsync) {
  return async () => {
    const windowId = await runCommand("xdotool", ["getactivewindow"]);
    if (!windowId) return null;
    const [state, wmClass, geometry] = await Promise.all([
      runCommand("xprop", ["-id", windowId, "_NET_WM_STATE"]),
      runCommand("xprop", ["-id", windowId, "WM_CLASS"]),
      runCommand("xwininfo", ["-id", windowId]),
    ]);
    return parseLinuxForegroundInfo(state, wmClass, geometry);
  };
}

if (process.platform === "win32") {
  try {
    const koffi = require("koffi");
    const user32 = koffi.load("user32.dll");
    koffi.struct("RECT", { left: "int32", top: "int32", right: "int32", bottom: "int32" });
    const GetForegroundWindow = user32.func("void* __stdcall GetForegroundWindow()");
    const GetWindowRect = user32.func("bool __stdcall GetWindowRect(void* hwnd, _Out_ RECT* rect)");
    const GetClassNameA = user32.func("int __stdcall GetClassNameA(void* hwnd, _Out_ char* buf, int count)");

    getForegroundInfo = () => {
      const h = GetForegroundWindow();
      if (!h) return null;
      const r = {};
      if (!GetWindowRect(h, r)) return null;
      const buf = Buffer.alloc(256);
      const len = GetClassNameA(h, buf, 256);
      const cls = len > 0 ? buf.toString("latin1", 0, len) : "";
      return { x: r.left, y: r.top, w: r.right - r.left, h: r.bottom - r.top, cls };
    };
  } catch (e) {
    // koffi が読めない場合は全画面検知を無効化（アプリは通常どおり動く）
    getForegroundInfo = () => null;
    console.error("[fullscreen-detect] koffi load failed; 全画面自動隠しは無効:", e && e.message);
  }
} else if (process.platform === "darwin") {
  getForegroundInfo = createMacForegroundInfoGetter(execTextAsync);
} else if (process.platform === "linux") {
  getForegroundInfo = createLinuxForegroundInfoGetter(execTextAsync);
}

module.exports = {
  MAC_FOREGROUND_FAILURE_BACKOFF_MS,
  createLinuxForegroundInfoGetter,
  createFailureBackoffCommandRunner,
  createMacForegroundInfoGetter,
  getForegroundInfo,
  parseLinuxForegroundInfo,
  parseMacForegroundInfo,
};

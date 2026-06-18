// 前面（フォアグラウンド）ウィンドウのサイズとクラス名を取得する。
// 「前面アプリがモニター全体を覆っている＝全画面」かどうかの判定に使い、
// 全画面ゲーム等の上ではポケモンを自動で隠す。
// - 最大化（Chrome等）は作業領域までしか覆わない → 全画面と判定されない
// - デスクトップ/タスクバー等のシェル窓は画面全体サイズだが「クラス名」で除外する

const { execFileSync } = require("node:child_process");

let getForegroundInfo = () => null;
let cachedInfo = null;
let cachedAt = 0;

function parseNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
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
  const script = [
    'tell application "System Events"',
    'set frontApp to first application process whose frontmost is true',
    'set appName to name of frontApp',
    'try',
    'set frontWindow to window 1 of frontApp',
    'on error',
    'return appName & "\\tfalse\\t0\\t0\\t0\\t0"',
    'end try',
    'set fullScreenValue to false',
    'try',
    'set fullScreenValue to value of attribute "AXFullScreen" of frontWindow',
    'end try',
    'set posValue to position of frontWindow',
    'set sizeValue to size of frontWindow',
    'return appName & "\\t" & fullScreenValue & "\\t" & item 1 of posValue & "\\t" & item 2 of posValue & "\\t" & item 1 of sizeValue & "\\t" & item 2 of sizeValue',
    'end tell',
  ].join("\n");

  getForegroundInfo = () => {
    const now = Date.now();
    if (cachedInfo && now - cachedAt < 1000) return cachedInfo;
    try {
      const out = execFileSync("/usr/bin/osascript", ["-e", script], { encoding: "utf8", timeout: 500 }).trim();
      const [cls, full, x, y, w, h] = out.split("\t");
      cachedInfo = {
        cls: cls || "",
        isFullscreen: String(full).toLowerCase() === "true",
        x: parseNumber(x),
        y: parseNumber(y),
        w: parseNumber(w),
        h: parseNumber(h),
      };
      cachedAt = now;
      return cachedInfo;
    } catch (e) {
      cachedInfo = null;
      cachedAt = now;
      return null;
    }
  };
} else if (process.platform === "linux") {
  getForegroundInfo = () => {
    const now = Date.now();
    if (cachedInfo && now - cachedAt < 1000) return cachedInfo;
    try {
      const id = execFileSync("xdotool", ["getactivewindow"], { encoding: "utf8", timeout: 250 }).trim();
      const geom = execFileSync("xdotool", ["getwindowgeometry", "--shell", id], { encoding: "utf8", timeout: 250 });
      const state = execFileSync("xprop", ["-id", id, "_NET_WM_STATE"], { encoding: "utf8", timeout: 250 });
      const values = Object.fromEntries(geom.trim().split(/\n+/).map((line) => line.split("=")));
      cachedInfo = {
        cls: "",
        isFullscreen: state.includes("_NET_WM_STATE_FULLSCREEN"),
        x: parseNumber(values.X),
        y: parseNumber(values.Y),
        w: parseNumber(values.WIDTH),
        h: parseNumber(values.HEIGHT),
      };
      cachedAt = now;
      return cachedInfo;
    } catch (e) {
      cachedInfo = null;
      cachedAt = now;
      return null;
    }
  };
}

module.exports = { getForegroundInfo };

// 前面（フォアグラウンド）ウィンドウのサイズとクラス名を取得する。
// 「前面アプリがモニター全体を覆っている＝全画面」かどうかの判定に使い、
// 全画面ゲーム等の上ではポケモンを自動で隠す。
// - 最大化（Chrome等）は作業領域までしか覆わない → 全画面と判定されない
// - デスクトップ/タスクバー等のシェル窓は画面全体サイズだが「クラス名」で除外する

const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

let getForegroundInfo = () => null;

function execText(command, args, options = {}) {
  return execFileSync(command, args, { encoding: "utf8", timeout: 500, windowsHide: true, ...options }).trim();
}

function parseNumber(value) {
  const n = Number.parseInt(String(value || "").trim(), 10);
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
      return { w: r.right - r.left, h: r.bottom - r.top, cls };
    };
  } catch (e) {
    // koffi が読めない場合は全画面検知を無効化（アプリは通常どおり動く）
    getForegroundInfo = () => null;
    console.error("[fullscreen-detect] koffi load failed; 全画面自動隠しは無効:", e && e.message);
  }
} else if (process.platform === "darwin") {
  let cachedInfo = null;
  let cachedAt = 0;

  function nativePath(relativePath) {
    const sourcePath = path.join(__dirname, "../../", relativePath);
    const unpackedPath = sourcePath.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`);
    return fs.existsSync(unpackedPath) ? unpackedPath : sourcePath;
  }

  function execMacForegroundInfo() {
    const nativeBin = nativePath("native/macos-frontwindow");
    const swiftSrc = nativePath("native/macos-frontwindow.swift");

    if (fs.existsSync(nativeBin)) {
      return execText(nativeBin, []);
    }

    return execText("swift", [swiftSrc], { timeout: 2000 });
  }

  getForegroundInfo = () => {
    const now = Date.now();
    if (cachedInfo && now - cachedAt < 1000) return cachedInfo;

    try {
      const [cls, isFullscreen, x, y, w, h] = execMacForegroundInfo().split("\t");
      cachedInfo = {
        cls: cls || "",
        x: parseNumber(x),
        y: parseNumber(y),
        w: parseNumber(w),
        h: parseNumber(h),
        isFullscreen: isFullscreen === "true",
      };
      cachedAt = now;
      return cachedInfo;
    } catch (_) {
      return null;
    }
  };
} else if (process.platform === "linux") {
  getForegroundInfo = () => {
    try {
      const windowId = execText("xdotool", ["getactivewindow"]);
      if (!windowId) return null;
      const state = execText("xprop", ["-id", windowId, "_NET_WM_STATE"]);
      const wmClass = execText("xprop", ["-id", windowId, "WM_CLASS"]);
      const geometry = execText("xwininfo", ["-id", windowId]);
      const widthMatch = geometry.match(/Width:\s+(\d+)/);
      const heightMatch = geometry.match(/Height:\s+(\d+)/);
      const classMatch = wmClass.match(/WM_CLASS\(STRING\) = (.+)$/);
      return {
        cls: classMatch ? classMatch[1] : "",
        w: widthMatch ? parseNumber(widthMatch[1]) : 0,
        h: heightMatch ? parseNumber(heightMatch[1]) : 0,
        isFullscreen: state.includes("_NET_WM_STATE_FULLSCREEN"),
      };
    } catch (_) {
      return null;
    }
  };
}

module.exports = { getForegroundInfo };

// 前面（フォアグラウンド）ウィンドウのサイズとクラス名を取得する（Windows専用）。
// 「前面アプリがモニター全体を覆っている＝全画面」かどうかの判定に使い、
// 全画面ゲーム等の上ではポケモンを自動で隠す。
// - 最大化（Chrome等）は作業領域までしか覆わない → 全画面と判定されない
// - デスクトップ/タスクバー等のシェル窓は画面全体サイズだが「クラス名」で除外する

let getForegroundInfo = () => null;

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
}

module.exports = { getForegroundInfo };

// 前面（フォアグラウンド）ウィンドウのサイズを取得する（Windows専用）。
// これを使い「前面アプリがモニター全体を覆っているか＝全画面か」を判定して、
// 全画面ゲーム等の上ではポケモンを自動で隠す。
// 最大化（Chrome等）は作業領域までしか覆わない＝全画面と判定されないので隠れない。

let getForegroundSize = () => null;

if (process.platform === "win32") {
  try {
    const koffi = require("koffi");
    const user32 = koffi.load("user32.dll");
    koffi.struct("RECT", { left: "int32", top: "int32", right: "int32", bottom: "int32" });
    const GetForegroundWindow = user32.func("void* __stdcall GetForegroundWindow()");
    const GetWindowRect = user32.func("bool __stdcall GetWindowRect(void* hwnd, _Out_ RECT* rect)");

    getForegroundSize = () => {
      const h = GetForegroundWindow();
      if (!h) return null;
      const r = {};
      if (!GetWindowRect(h, r)) return null;
      return { w: r.right - r.left, h: r.bottom - r.top };
    };
  } catch (e) {
    // koffi が読めない場合は全画面検知を無効化（アプリは通常どおり動く）
    getForegroundSize = () => null;
    console.error("[fullscreen-detect] koffi load failed; 全画面自動隠しは無効:", e && e.message);
  }
}

module.exports = { getForegroundSize };

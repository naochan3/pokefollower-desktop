import { describe, it, expect } from "vitest";
import { isFullscreenForeground } from "../src/main/fullscreen-policy.js";

describe("fullscreen-policy", () => {
  const displays = [
    { bounds: { width: 1920, height: 1080 }, scaleFactor: 1 },
    { bounds: { width: 2560, height: 1440 }, scaleFactor: 1.25 },
  ];

  it("前面情報が無い場合は全画面扱いしない", () => {
    expect(isFullscreenForeground(null, displays)).toBe(false);
  });

  it("デスクトップやタスクバーの shell 窓は画面全体サイズでも除外する", () => {
    expect(isFullscreenForeground({ w: 1920, h: 1080, cls: "Progman" }, displays)).toBe(false);
    expect(isFullscreenForeground({ w: 1920, h: 1080, cls: "Shell_TrayWnd" }, displays)).toBe(false);
  });

  it("補助shell窓やclass名なしも全画面扱いしない", () => {
    expect(isFullscreenForeground({ w: 1920, h: 1080, cls: "WorkerW" }, displays)).toBe(false);
    expect(isFullscreenForeground({ w: 1920, h: 1080, cls: "Shell_SecondaryTrayWnd" }, displays)).toBe(false);
    expect(isFullscreenForeground({ w: 1920, h: 1080, cls: "" }, displays)).toBe(false);
  });

  it("モニター全体を覆う前面ウィンドウは全画面扱いする", () => {
    expect(isFullscreenForeground({ w: 1920, h: 1080, cls: "GameWindow" }, displays)).toBe(true);
  });

  it("OSが明示した全画面状態はサイズに依存せず全画面扱いする", () => {
    expect(isFullscreenForeground({ w: 1, h: 1, cls: "GameWindow", isFullscreen: true }, displays)).toBe(true);
  });

  it("DPI scale を考慮して物理ピクセル相当のサイズを判定する", () => {
    expect(isFullscreenForeground({ w: 3200, h: 1800, cls: "GameWindow" }, displays)).toBe(true);
  });

  it("通常の最大化相当でモニター全体に届かない場合は全画面扱いしない", () => {
    expect(isFullscreenForeground({ w: 1920, h: 1040, cls: "Chrome_WidgetWin_1" }, displays)).toBe(false);
  });

  it("2pxまでの誤差は全画面扱いし、3px不足は除外する", () => {
    expect(isFullscreenForeground({ w: 1918, h: 1078, cls: "GameWindow" }, displays)).toBe(true);
    expect(isFullscreenForeground({ w: 1917, h: 1077, cls: "GameWindow" }, displays)).toBe(false);
  });
});

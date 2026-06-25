import { describe, it, expect } from "vitest";
import { isFullscreenForeground } from "../src/main/fullscreen-detect.js";

const displays = [
  { bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 },
  { bounds: { x: 1920, y: 0, width: 2560, height: 1440 }, scaleFactor: 1.5 },
];

describe("fullscreen-detect", () => {
  it("前面ウィンドウがモニター全体を覆う場合だけ全画面扱いにする", () => {
    expect(isFullscreenForeground({ w: 1920, h: 1080, cls: "GameWindow" }, displays)).toBe(true);
    expect(isFullscreenForeground({ w: 3840, h: 2160, cls: "GameWindow" }, displays)).toBe(true);
    expect(isFullscreenForeground({ w: 1920, h: 1040, cls: "Chrome_WidgetWin_1" }, displays)).toBe(false);
  });

  it("デスクトップやタスクバー由来のシェル窓は除外する", () => {
    expect(isFullscreenForeground({ w: 1920, h: 1080, cls: "Progman" }, displays)).toBe(false);
    expect(isFullscreenForeground({ w: 1920, h: 1080, cls: "WorkerW" }, displays)).toBe(false);
    expect(isFullscreenForeground({ w: 1920, h: 1080, cls: "Shell_TrayWnd" }, displays)).toBe(false);
  });
});

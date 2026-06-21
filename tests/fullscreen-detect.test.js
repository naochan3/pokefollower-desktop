import { describe, expect, it } from "vitest";
import { parseLinuxForegroundInfo, parseMacForegroundInfo } from "../src/main/fullscreen-detect.js";

describe("fullscreen-detect parsers", () => {
  it("macOS の System Events 出力を前面ウィンドウ情報へ変換する", () => {
    expect(parseMacForegroundInfo("Game\t12\t34\t1920\t1080\ttrue")).toEqual({
      cls: "Game",
      x: 12,
      y: 34,
      w: 1920,
      h: 1080,
      isFullscreen: true,
    });
  });

  it("macOS の権限不足や取得失敗では null に戻す", () => {
    expect(parseMacForegroundInfo("")).toBe(null);
    expect(parseMacForegroundInfo(null)).toBe(null);
  });

  it("Linux の X11 出力を前面ウィンドウ情報へ変換する", () => {
    const state = '_NET_WM_STATE(ATOM) = _NET_WM_STATE_FULLSCREEN, _NET_WM_STATE_ABOVE';
    const wmClass = 'WM_CLASS(STRING) = "game", "GameWindow"';
    const geometry = [
      "xwininfo: Window id: 0x123",
      "  Absolute upper-left X:  -10",
      "  Absolute upper-left Y:  20",
      "  Width: 2560",
      "  Height: 1440",
    ].join("\n");

    expect(parseLinuxForegroundInfo(state, wmClass, geometry)).toEqual({
      cls: '"game", "GameWindow"',
      x: -10,
      y: 20,
      w: 2560,
      h: 1440,
      isFullscreen: true,
    });
  });

  it("Linux の外部コマンド出力が欠けた場合は null に戻す", () => {
    expect(parseLinuxForegroundInfo("", 'WM_CLASS(STRING) = "game"', "Width: 100\nHeight: 100")).toBe(null);
    expect(parseLinuxForegroundInfo("_NET_WM_STATE(ATOM) =", "", "Width: 100\nHeight: 100")).toBe(null);
    expect(parseLinuxForegroundInfo("_NET_WM_STATE(ATOM) =", 'WM_CLASS(STRING) = "game"', "")).toBe(null);
  });
});

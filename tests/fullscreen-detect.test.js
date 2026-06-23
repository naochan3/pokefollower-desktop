import { describe, expect, it } from "vitest";
import {
  MAC_FOREGROUND_FAILURE_BACKOFF_MS,
  createFailureBackoffCommandRunner,
  createLinuxForegroundInfoGetter,
  createMacForegroundInfoGetter,
  parseLinuxForegroundInfo,
  parseMacForegroundInfo,
} from "../src/main/fullscreen-detect.js";

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

  it("macOS の window なし出力を安定した前面情報へ変換する", () => {
    expect(parseMacForegroundInfo("Finder\t0\t0\t0\t0\tfalse")).toEqual({
      cls: "Finder",
      x: 0,
      y: 0,
      w: 0,
      h: 0,
      isFullscreen: false,
    });
  });

  it("macOS の権限不足や取得失敗では null に戻す", () => {
    expect(parseMacForegroundInfo("")).toBe(null);
    expect(parseMacForegroundInfo(null)).toBe(null);
  });

  it("macOS の System Events 実行失敗では null に戻す", async () => {
    const getForegroundInfo = createMacForegroundInfoGetter(async () => null);
    await expect(getForegroundInfo()).resolves.toBe(null);
  });

  it("macOS の System Events 実行結果を前面ウィンドウ情報へ変換する", async () => {
    const getForegroundInfo = createMacForegroundInfoGetter(async (command, args) => {
      expect(command).toBe("osascript");
      expect(args).toHaveLength(2);
      return "Game\t12\t34\t1920\t1080\ttrue";
    });
    await expect(getForegroundInfo()).resolves.toEqual({
      cls: "Game",
      x: 12,
      y: 34,
      w: 1920,
      h: 1080,
      isFullscreen: true,
    });
  });

  it("macOS の System Events 失敗後は一定時間コマンド再実行を避ける", async () => {
    let now = 1000;
    let calls = 0;
    const runCommand = createFailureBackoffCommandRunner(async () => {
      calls += 1;
      return null;
    }, { now: () => now, failureBackoffMs: 30000 });

    await expect(runCommand("osascript", ["-e", "test"])).resolves.toBe(null);
    await expect(runCommand("osascript", ["-e", "test"])).resolves.toBe(null);
    expect(calls).toBe(1);

    now += 30000;
    await expect(runCommand("osascript", ["-e", "test"])).resolves.toBe(null);
    expect(calls).toBe(2);
  });

  it("macOS の foreground getter は失敗バックオフ既定値を使う", async () => {
    let now = 2000;
    let calls = 0;
    const getForegroundInfo = createMacForegroundInfoGetter(async () => {
      calls += 1;
      return null;
    }, { now: () => now });

    await expect(getForegroundInfo()).resolves.toBe(null);
    now += MAC_FOREGROUND_FAILURE_BACKOFF_MS - 1;
    await expect(getForegroundInfo()).resolves.toBe(null);
    expect(calls).toBe(1);

    now += 1;
    await expect(getForegroundInfo()).resolves.toBe(null);
    expect(calls).toBe(2);
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

  it("Linux の active window 取得失敗では null に戻す", async () => {
    const getForegroundInfo = createLinuxForegroundInfoGetter(async () => null);
    await expect(getForegroundInfo()).resolves.toBe(null);
  });

  it("Linux の X11 コマンド結果を前面ウィンドウ情報へ変換する", async () => {
    const getForegroundInfo = createLinuxForegroundInfoGetter(async (command, args) => {
      if (command === "xdotool") return "123";
      if (command === "xprop" && args[2] === "_NET_WM_STATE") return "_NET_WM_STATE(ATOM) = _NET_WM_STATE_FULLSCREEN";
      if (command === "xprop" && args[2] === "WM_CLASS") return 'WM_CLASS(STRING) = "game", "GameWindow"';
      if (command === "xwininfo") return "Absolute upper-left X: 10\nAbsolute upper-left Y: 20\nWidth: 800\nHeight: 600";
      throw new Error(`unexpected command: ${command}`);
    });
    await expect(getForegroundInfo()).resolves.toEqual({
      cls: '"game", "GameWindow"',
      x: 10,
      y: 20,
      w: 800,
      h: 600,
      isFullscreen: true,
    });
  });
});

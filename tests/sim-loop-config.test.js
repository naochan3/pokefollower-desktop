import { describe, it, expect } from "vitest";
import { DEFAULT_AC_INTERVAL_MS, DEFAULT_BATTERY_INTERVAL_MS, getSimIntervalMs, parseInterval } from "../src/main/sim-loop-config.js";

describe("sim-loop-config", () => {
  it("AC電源では常駐負荷を抑える16msを使う", () => {
    expect(getSimIntervalMs({ env: {}, isOnBattery: false })).toBe(DEFAULT_AC_INTERVAL_MS);
  });

  it("バッテリー駆動では16msに落として常駐負荷を抑える", () => {
    expect(getSimIntervalMs({ env: {}, isOnBattery: true })).toBe(DEFAULT_BATTERY_INTERVAL_MS);
  });

  it("環境変数で明示指定できる", () => {
    expect(getSimIntervalMs({ env: { POKEFOLLOWER_SIM_INTERVAL_MS: "12" }, isOnBattery: true })).toBe(12);
    expect(getSimIntervalMs({ env: { POKEFOLLOWER_SIM_INTERVAL_MS: "8" }, isOnBattery: false })).toBe(8);
  });

  it("不正な値は無視し、極端な値は範囲内に丸める", () => {
    expect(parseInterval("bad")).toBe(null);
    expect(parseInterval("1")).toBe(4);
    expect(parseInterval("5000")).toBe(1000);
  });
});

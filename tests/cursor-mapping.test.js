import { describe, it, expect } from "vitest";
import { screenPointToOverlay } from "../src/main/cursor-mapping.js";

describe("cursor-mapping", () => {
  it("原点0,0のディスプレイではそのまま", () => {
    expect(screenPointToOverlay({ x: 100, y: 200 }, { x: 0, y: 0 })).toEqual({ x: 100, y: 200 });
  });

  it("オフセットのあるディスプレイでは原点を引く", () => {
    expect(screenPointToOverlay({ x: 1920, y: 50 }, { x: 1920, y: 0 })).toEqual({ x: 0, y: 50 });
  });
});

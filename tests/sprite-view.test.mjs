import { describe, it, expect } from "vitest";
import { idleSheetUrl, frameBackgroundPosition } from "../src/settings/sprite-view.mjs";

describe("sprite-view", () => {
  it("builds the idle sheet url from rawPath + sheet", () => {
    const meta = { meta: { rawPath: "gen-1/025-pikachu", states: { idle: { sheet: "Idle-Anim.png" } } } };
    expect(idleSheetUrl(meta)).toBe("app://bundle/assets/raw/gen-1/025-pikachu/Idle-Anim.png");
  });
  it("computes frame background position like the overlay", () => {
    expect(frameBackgroundPosition(2, 1, { w: 32, h: 40 })).toBe("-64px -40px");
  });
});

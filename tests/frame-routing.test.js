import { describe, it, expect } from "vitest";
import { frameForOverlay, frameKey, intersects, spriteGlobalBounds } from "../src/main/frame-routing.js";

describe("frame-routing", () => {
  const meta = {
    states: {
      walk: { frame: { w: 40, h: 40 } },
    },
  };
  const left = { x: 0, y: 0, width: 100, height: 100 };
  const right = { x: 100, y: 0, width: 100, height: 100 };

  it("スプライトの中心とmeta frameからグローバルboundsを作る", () => {
    expect(spriteGlobalBounds({ x: 50, y: 60, state: "walk", scale: 2 }, meta))
      .toEqual({ x: 10, y: 20, width: 80, height: 80 });
  });

  it("境界に半分かかるスプライトは両方のモニターに配信する", () => {
    const render = { x: 100, y: 50, state: "walk", frame: 1, row: 2, scale: 1 };
    expect(frameForOverlay(render, left, meta).visible).toBe(true);
    expect(frameForOverlay(render, right, meta)).toMatchObject({ visible: true, x: 0, y: 50 });
  });

  it("完全に片側にいるときは反対側へ配信しない", () => {
    const render = { x: 50, y: 50, state: "walk", frame: 1, row: 2, scale: 1 };
    expect(frameForOverlay(render, left, meta).visible).toBe(true);
    expect(frameForOverlay(render, right, meta)).toEqual({ visible: false });
  });

  it("render が null の場合は非表示frameにする", () => {
    expect(frameForOverlay(null, left, meta)).toEqual({ visible: false });
  });

  it("矩形が辺で接するだけなら交差扱いしない", () => {
    expect(intersects(left, { x: 100, y: 0, width: 20, height: 20 })).toBe(false);
  });

  it("metaが無い場合は96pxのfallback frameで判定する", () => {
    const render = { x: 96, y: 50, state: "missing", frame: 0, row: 0, scale: 1 };
    expect(frameForOverlay(render, right, null).visible).toBe(true);
  });

  it("frameKeyは同一描画frameを同じキーに丸める", () => {
    const a = { visible: true, x: 10.004, y: 20.004, state: "walk", frame: 1, row: 0, scale: 1.25 };
    const b = { visible: true, x: 10.0041, y: 20.0041, state: "walk", frame: 1, row: 0, scale: 1.25 };
    const c = { visible: true, x: 10.02, y: 20.004, state: "walk", frame: 1, row: 0, scale: 1.25 };
    expect(frameKey(a)).toBe(frameKey(b));
    expect(frameKey(a)).not.toBe(frameKey(c));
    expect(frameKey({ visible: false })).toBe("hidden");
  });
});

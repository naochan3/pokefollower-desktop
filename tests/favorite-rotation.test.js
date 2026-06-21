import { describe, it, expect } from "vitest";
import { clampRotationMinutes, nextFavoritePack } from "../src/main/favorite-rotation.js";

describe("favorite-rotation", () => {
  it("待機列が空なら現在のポケモンを維持する", () => {
    expect(nextFavoritePack("retro/gen-1/025-pikachu", [])).toBe("retro/gen-1/025-pikachu");
  });

  it("現在の次の待機列ポケモンを返し、末尾なら先頭へ戻る", () => {
    const queue = ["retro/gen-1/001-bulbasaur", "retro/gen-1/004-charmander", "retro/gen-1/007-squirtle"];
    expect(nextFavoritePack(queue[0], queue)).toBe(queue[1]);
    expect(nextFavoritePack(queue[2], queue)).toBe(queue[0]);
    expect(nextFavoritePack("retro/gen-1/025-pikachu", queue)).toBe(queue[0]);
  });

  it("交代間隔は1〜120分に丸める", () => {
    expect(clampRotationMinutes(0)).toBe(1);
    expect(clampRotationMinutes(15.4)).toBe(15);
    expect(clampRotationMinutes(999)).toBe(120);
    expect(clampRotationMinutes("bad")).toBe(15);
  });
});

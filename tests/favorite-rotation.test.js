import { describe, it, expect } from "vitest";
import {
  MAX_FAVORITE_PACKS,
  addFavoritePack,
  clampRotationMinutes,
  nextFavoritePack,
  normalizeFavoritePacks,
  removeFavoritePack,
} from "../src/main/favorite-rotation.js";

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

  it("お気に入り追加は安全なpackだけを重複なしで末尾に追加する", () => {
    const queue = ["retro/gen-1/001-bulbasaur"];
    expect(addFavoritePack("retro/gen-1/025-pikachu", queue)).toEqual([
      "retro/gen-1/001-bulbasaur",
      "retro/gen-1/025-pikachu",
    ]);
    expect(addFavoritePack("retro/gen-1/001-bulbasaur", queue)).toEqual(queue);
    expect(addFavoritePack("../secret", queue)).toEqual(queue);
  });

  it("お気に入り削除は対象だけを外し、不正な既存値も正規化する", () => {
    const queue = ["retro/gen-1/001-bulbasaur", "../secret", "retro/gen-1/025-pikachu"];
    expect(removeFavoritePack("retro/gen-1/001-bulbasaur", queue)).toEqual(["retro/gen-1/025-pikachu"]);
  });

  it("お気に入り正規化は最大件数で打ち切る", () => {
    const queue = Array.from({ length: 20 }, (_, i) => `retro/gen-1/${String(i + 1).padStart(3, "0")}-test`);
    expect(normalizeFavoritePacks(queue)).toHaveLength(MAX_FAVORITE_PACKS);
    expect(addFavoritePack("retro/gen-1/025-pikachu", queue)).toHaveLength(MAX_FAVORITE_PACKS);
  });
});

import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { makePackReader } from "../src/main/pack-reader.js";

describe("pack-reader", () => {
  const root = resolve(".");
  const reader = makePackReader(root);

  it("世代なしpack keyから推定世代のmetadataを解決する", () => {
    const { resolvedKey, meta } = reader.readPackMeta("retro/025-pikachu");

    expect(resolvedKey).toBe("retro/gen-1/025-pikachu");
    expect(meta.states.idle).toBeTruthy();
    expect(meta.states.walk).toBeTruthy();
  });

  it("pack listをdex順・日本語名付きで返す", () => {
    const list = reader.readPackList();

    expect(list.length).toBe(493);
    expect(list[0]).toMatchObject({
      id: "retro/gen-1/001-bulbasaur",
      num: 1,
      ja: "フシギダネ",
      en: "Bulbasaur",
    });
    expect(list.at(-1)).toMatchObject({
      id: "retro/gen-4/493-arceus",
      num: 493,
      ja: "アルセウス",
      en: "Arceus",
    });
    expect(list.map((item) => item.num)).toEqual([...list].map((item) => item.num).sort((a, b) => a - b));
  });

  it("存在しないpack keyは明示的に失敗する", () => {
    expect(() => reader.readPackMeta("retro/gen-9/999-missingno")).toThrow(/pack not found/);
  });
});

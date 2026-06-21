import { describe, expect, it } from "vitest";
import { GENERATION_LABELS, generationLabelFor } from "../src/settings/generation-labels.js";

describe("generation labels", () => {
  it("第1〜9世代の短縮ラベルと tooltip を持つ", () => {
    expect(GENERATION_LABELS.map((item) => item.gen)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(GENERATION_LABELS.map((item) => item.short)).toEqual(["赤緑", "金銀", "RS", "DP", "BW", "XY", "SM", "剣盾", "SV"]);
    for (const item of GENERATION_LABELS) {
      expect(item.title).toContain(`第${item.gen}世代`);
      expect(item.aliases.length).toBeGreaterThan(2);
    }
  });

  it("主要な日本語 alias を定義する", () => {
    expect(generationLabelFor(1).aliases).toEqual(expect.arrayContaining(["初代", "赤緑", "カントー"]));
    expect(generationLabelFor(8).aliases).toEqual(expect.arrayContaining(["剣盾", "ガラル", "ヒスイ"]));
    expect(generationLabelFor(9).aliases).toEqual(expect.arrayContaining(["SV", "パルデア"]));
  });
});

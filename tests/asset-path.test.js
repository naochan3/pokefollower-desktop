import { describe, it, expect } from "vitest";
import { dexFromSlug, generationForDex, packSlug, buildPackCandidates, GENERATION_DIRS } from "../src/main/asset-path.js";

describe("asset-path", () => {
  it("slugからdex番号を取り出す", () => {
    expect(dexFromSlug("009-blastoise")).toBe(9);
    expect(dexFromSlug("025-pikachu")).toBe(25);
    expect(dexFromSlug("bad")).toBe(null);
  });

  it("dexから世代を判定する", () => {
    expect(generationForDex(9)).toBe("gen-1");
    expect(generationForDex(152)).toBe("gen-2");
    expect(generationForDex(400)).toBe("gen-4");
  });

  it("Gen 1-9 の境界dexを判定する", () => {
    expect(GENERATION_DIRS).toEqual(["gen-1", "gen-2", "gen-3", "gen-4", "gen-5", "gen-6", "gen-7", "gen-8", "gen-9"]);
    expect(generationForDex(1)).toBe("gen-1");
    expect(generationForDex(151)).toBe("gen-1");
    expect(generationForDex(152)).toBe("gen-2");
    expect(generationForDex(251)).toBe("gen-2");
    expect(generationForDex(252)).toBe("gen-3");
    expect(generationForDex(386)).toBe("gen-3");
    expect(generationForDex(387)).toBe("gen-4");
    expect(generationForDex(493)).toBe("gen-4");
    expect(generationForDex(494)).toBe("gen-5");
    expect(generationForDex(649)).toBe("gen-5");
    expect(generationForDex(650)).toBe("gen-6");
    expect(generationForDex(721)).toBe("gen-6");
    expect(generationForDex(722)).toBe("gen-7");
    expect(generationForDex(809)).toBe("gen-7");
    expect(generationForDex(810)).toBe("gen-8");
    expect(generationForDex(905)).toBe("gen-8");
    expect(generationForDex(906)).toBe("gen-9");
  });

  it("packKeyからslugを取り出す", () => {
    expect(packSlug("retro/gen-1/009-blastoise")).toBe("009-blastoise");
  });

  it("世代付きキーはそのまま候補先頭になる", () => {
    expect(buildPackCandidates("retro/gen-1/009-blastoise")[0]).toBe("retro/gen-1/009-blastoise");
  });

  it("世代が無いキーは推定世代を補完する", () => {
    const cands = buildPackCandidates("retro/025-pikachu");
    expect(cands).toContain("retro/gen-1/025-pikachu");
  });

  it("世代が無いGen 5-9キーも推定世代を候補先頭近くに補完する", () => {
    expect(buildPackCandidates("retro/494-victini").slice(0, 2)).toEqual([
      "retro/494-victini",
      "retro/gen-5/494-victini",
    ]);
    expect(buildPackCandidates("retro/650-chespin").slice(0, 2)).toEqual([
      "retro/650-chespin",
      "retro/gen-6/650-chespin",
    ]);
    expect(buildPackCandidates("retro/722-rowlet").slice(0, 2)).toEqual([
      "retro/722-rowlet",
      "retro/gen-7/722-rowlet",
    ]);
    expect(buildPackCandidates("retro/810-grookey").slice(0, 2)).toEqual([
      "retro/810-grookey",
      "retro/gen-8/810-grookey",
    ]);
    expect(buildPackCandidates("retro/906-sprigatito").slice(0, 2)).toEqual([
      "retro/906-sprigatito",
      "retro/gen-9/906-sprigatito",
    ]);
  });
});

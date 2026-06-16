import { describe, it, expect } from "vitest";
import { dexFromSlug, generationForDex, packSlug, buildPackCandidates } from "../src/main/asset-path.js";

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
});

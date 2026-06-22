import { describe, it, expect } from "vitest";
import { buildTypeData, pokeapiSlug } from "../scripts/gen-type-data.mjs";

describe("gen-type-data", () => {
  it("derives pokeapi slug for normal and form entries", () => {
    expect(pokeapiSlug({ id: "retro/gen-1/025-pikachu" })).toBe("pikachu");
    expect(pokeapiSlug({ id: "retro/forms/alola/026-raichu", region: "alola" })).toBe("raichu-alola");
  });
  it("builds a packId -> types map", async () => {
    const entries = [
      { id: "retro/gen-1/025-pikachu" },
      { id: "retro/forms/alola/026-raichu", region: "alola" },
    ];
    const fake = async (slug) =>
      slug === "pikachu" ? ["electric"] : ["electric", "psychic"];
    const out = await buildTypeData(entries, fake);
    expect(out["retro/gen-1/025-pikachu"]).toEqual({ types: ["electric"] });
    expect(out["retro/forms/alola/026-raichu"]).toEqual({ types: ["electric", "psychic"] });
  });
});

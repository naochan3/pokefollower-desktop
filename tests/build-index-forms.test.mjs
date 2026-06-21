import { test, expect } from "vitest";
import { buildEntries } from "../scripts/build-index.mjs";

test("form entry gets region and composed ja", () => {
  const jp = { "26": { ja: "ライチュウ", romaji: "Raichu" } };
  const entries = buildEntries({
    "gen-1": ["026-raichu"],
    "forms/alola": ["026-raichu"],
  }, jp, new Map());
  const form = entries.find((e) => e.id === "retro/forms/alola/026-raichu");
  expect(form.region).toBe("alola");
  expect(form.ja).toBe("アローラライチュウ");
  const base = entries.find((e) => e.id === "retro/gen-1/026-raichu");
  expect(base.region).toBeUndefined();
});

test("form entry gets region and composed ja", async () => {
  const { buildEntries } = await import("../scripts/build-index.mjs");
  const raichuJa = "\u30e9\u30a4\u30c1\u30e5\u30a6";
  const alolaRaichuJa = "\u30a2\u30ed\u30fc\u30e9\u30e9\u30a4\u30c1\u30e5\u30a6";
  const jp = { "26": { ja: raichuJa, romaji: "Raichu" } };
  const entries = buildEntries({
    "gen-1": ["026-raichu"],
    "forms/alola": ["026-raichu"],
  }, jp, new Map());
  const form = entries.find((e) => e.id === "retro/forms/alola/026-raichu");
  expect(form.region).toBe("alola");
  expect(form.ja).toBe(alolaRaichuJa);
  const base = entries.find((e) => e.id === "retro/gen-1/026-raichu");
  expect(base.region).toBeUndefined();
});

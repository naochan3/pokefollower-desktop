const fs = require("node:fs");
const path = require("node:path");

test("generated form entry gets region and composed ja", () => {
  const alolaRaichuJa = "\u30a2\u30ed\u30fc\u30e9\u30e9\u30a4\u30c1\u30e5\u30a6";
  const indexPath = path.join(__dirname, "..", "assets", "packs", "index.json");
  const entries = JSON.parse(fs.readFileSync(indexPath, "utf8")).retro;
  const form = entries.find((e) => e.id === "retro/forms/alola/026-raichu");
  expect(form.region).toBe("alola");
  expect(form.ja).toBe(alolaRaichuJa);
  const base = entries.find((e) => e.id === "retro/gen-1/026-raichu");
  expect(base.region).toBeUndefined();
});

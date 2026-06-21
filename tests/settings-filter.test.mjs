import { test, expect } from "vitest";
import { matchTile } from "../src/settings/filter.mjs";

const base = { region: "", gen: "1", search: " raichu " };
const alola = { region: "alola", gen: "1", search: " アローラライチュウ " };

test("normal kind hides forms", () => {
  expect(matchTile(base, { kind: "normal", gen: "all", region: "all", q: "" })).toBe(true);
  expect(matchTile(alola, { kind: "normal", gen: "all", region: "all", q: "" })).toBe(false);
});
test("forms kind shows only forms, filtered by region", () => {
  expect(matchTile(alola, { kind: "forms", gen: "all", region: "alola", q: "" })).toBe(true);
  expect(matchTile(alola, { kind: "forms", gen: "all", region: "galar", q: "" })).toBe(false);
  expect(matchTile(base, { kind: "forms", gen: "all", region: "all", q: "" })).toBe(false);
});

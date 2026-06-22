// tests/settings-filter-type.test.mjs
import { describe, it, expect } from "vitest";
import { matchTile } from "../src/settings/filter.mjs";

const base = { region: "", gen: "1", search: "ぴかちゅう", types: ["electric"] };

describe("matchTile type filter", () => {
  it("passes when type matches", () => {
    expect(matchTile(base, { kind: "normal", gen: "all", region: "all", type: "electric", q: "" })).toBe(true);
  });
  it("filters out non-matching type", () => {
    expect(matchTile(base, { kind: "normal", gen: "all", region: "all", type: "water", q: "" })).toBe(false);
  });
  it("type=all keeps all", () => {
    expect(matchTile(base, { kind: "normal", gen: "all", region: "all", type: "all", q: "" })).toBe(true);
  });
});

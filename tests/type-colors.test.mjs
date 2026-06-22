import { describe, it, expect } from "vitest";
import { TYPE_COLORS, typeColor, typeJa } from "../src/settings/type-colors.mjs";

describe("type-colors", () => {
  it("defines all 18 types", () => {
    expect(Object.keys(TYPE_COLORS).length).toBe(18);
  });
  it("maps english type to color and ja", () => {
    expect(typeColor("electric")).toBe("#F8D030");
    expect(typeJa("electric")).toBe("でんき");
    expect(typeColor("water")).toBe("#6890F0");
  });
  it("falls back for unknown types", () => {
    expect(typeColor("mystery")).toBe("#888888");
    expect(typeJa("mystery")).toBe("mystery");
  });
});

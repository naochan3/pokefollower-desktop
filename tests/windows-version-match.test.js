import { describe, expect, it } from "vitest";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "scripts", "verify-win-distribution.cjs"), "utf8");
const declaration = source.match(/function matchesWindowsVersion\s*\([^)]*\)\s*\{[\s\S]*?^\}/m);

describe("Windows product version matching", () => {
  it("requires exact semantic version or a dot-delimited Windows suffix", () => {
    expect(declaration, "verify-win-distribution must expose its version matcher").not.toBeNull();
    if (!declaration) return;
    const matchesWindowsVersion = vm.runInNewContext("(" + declaration[0] + ")");
    expect(matchesWindowsVersion("1.4.1", "1.4.1")).toBe(true);
    expect(matchesWindowsVersion("1.4.1.0", "1.4.1")).toBe(true);
    expect(matchesWindowsVersion("1.4.10", "1.4.1")).toBe(false);
    expect(matchesWindowsVersion("1.4.1-beta", "1.4.1")).toBe(false);
  });
});

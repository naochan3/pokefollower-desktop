import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRustFollowerCore } from "../src/main/rust-follower-core.js";

describe("rust-follower-core", () => {
  it("WASM が見つからない場合は null を返し JS fallback を可能にする", () => {
    const missingRoot = mkdtempSync(join(tmpdir(), "pf-no-wasm-"));
    expect(createRustFollowerCore(missingRoot)).toBe(null);
  });
});

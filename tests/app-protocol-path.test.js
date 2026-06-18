import { describe, it, expect } from "vitest";
import { join, resolve } from "node:path";
import { resolveAppProtocolPath, isInsideRoot } from "../src/main/app-protocol-path.js";

describe("app-protocol-path", () => {
  const root = resolve("/tmp/pokefollower-root");

  it("通常のasset pathをroot配下に解決する", () => {
    expect(resolveAppProtocolPath(root, "app://bundle/assets/ui/gen-1/025-pikachu.png"))
      .toBe(join(root, "assets", "ui", "gen-1", "025-pikachu.png"));
  });

  it(".. を含むroot外参照を拒否する", () => {
    expect(resolveAppProtocolPath(root, "app://bundle/assets/../../secret.txt")).toBe(null);
  });

  it("エンコードされたroot外参照も拒否する", () => {
    expect(resolveAppProtocolPath(root, "app://bundle/assets/%2e%2e/%2e%2e/secret.txt")).toBe(null);
  });

  it("root境界のprefix一致だけでは許可しない", () => {
    expect(isInsideRoot(root, resolve("/tmp/pokefollower-root-other/file.txt"))).toBe(false);
  });
});

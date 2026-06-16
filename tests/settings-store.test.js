import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSettingsStore, DEFAULTS } from "../src/main/settings-store.js";

describe("settings-store", () => {
  let dir, file;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "pf-"));
    file = join(dir, "settings.json");
  });

  it("ファイルが無ければデフォルトを返す", () => {
    const store = createSettingsStore(file);
    expect(store.getAll()).toEqual(DEFAULTS);
  });

  it("set した値が get で返り、再読込でも保持される", () => {
    const store = createSettingsStore(file);
    store.set({ pack: "retro/gen-1/025-pikachu", scale: 2 });
    expect(store.get("pack")).toBe("retro/gen-1/025-pikachu");
    const reopened = createSettingsStore(file);
    expect(reopened.get("scale")).toBe(2);
    expect(reopened.get("pack")).toBe("retro/gen-1/025-pikachu");
  });

  it("不正な数値は無視してデフォルトを保つ", () => {
    const store = createSettingsStore(file);
    store.set({ scale: "abc", offset: NaN });
    expect(store.get("scale")).toBe(DEFAULTS.scale);
    expect(store.get("offset")).toBe(DEFAULTS.offset);
  });
});

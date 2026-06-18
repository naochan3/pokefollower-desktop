import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
    expect(store.get("offset")).toBe(70);
  });

  it("既存 settings.json の offset を新デフォルトで上書きしない", () => {
    writeFileSync(file, JSON.stringify({ offset: 30 }), "utf8");
    const store = createSettingsStore(file);
    expect(store.get("offset")).toBe(30);
    expect(store.get("scale")).toBe(DEFAULTS.scale);
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

  it("未知キーと空packは読み込み時に無視する", () => {
    writeFileSync(file, JSON.stringify({ pack: "  ", offset: 42, unknown: "x" }), "utf8");
    const store = createSettingsStore(file);
    expect(store.get("pack")).toBe(DEFAULTS.pack);
    expect(store.get("offset")).toBe(42);
    expect(store.getAll()).not.toHaveProperty("unknown");
  });

  it("set時も未知キーと空packを永続化しない", () => {
    const store = createSettingsStore(file);
    store.set({ pack: "", offset: 55, debug: true });
    const reopened = createSettingsStore(file);
    expect(reopened.get("pack")).toBe(DEFAULTS.pack);
    expect(reopened.get("offset")).toBe(55);
    expect(reopened.getAll()).not.toHaveProperty("debug");
  });

  it("enabledはbooleanとして保存する", () => {
    const store = createSettingsStore(file);
    store.set({ enabled: 0 });
    expect(store.get("enabled")).toBe(false);
    store.set({ enabled: "yes" });
    expect(store.get("enabled")).toBe(true);
  });
});

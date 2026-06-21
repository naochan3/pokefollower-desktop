import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSettingsStore, DEFAULTS, LIMITS, sanitize, hasStateChange } from "../src/main/settings-store.js";

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
    expect(store.get("notificationCompanionEnabled")).toBe(false);
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

  it("既存互換の短縮pack IDは保持する", () => {
    writeFileSync(file, JSON.stringify({ pack: "retro/025-pikachu" }), "utf8");
    const store = createSettingsStore(file);
    expect(store.get("pack")).toBe("retro/025-pikachu");
  });

  it("不正な数値は無視してデフォルトを保つ", () => {
    const store = createSettingsStore(file);
    store.set({ scale: "abc", offset: NaN });
    expect(store.get("scale")).toBe(DEFAULTS.scale);
    expect(store.get("offset")).toBe(DEFAULTS.offset);
  });

  it("数値設定はmain側でもUI範囲にclampする", () => {
    const store = createSettingsStore(file);
    store.set({ scale: 999, offset: -10, lerp: 99 });
    expect(store.get("scale")).toBe(LIMITS.scale.max);
    expect(store.get("offset")).toBe(LIMITS.offset.min);
    expect(store.get("lerp")).toBe(LIMITS.lerp.max);
    store.set({ scale: -1, lerp: -1 });
    expect(store.get("scale")).toBe(LIMITS.scale.min);
    expect(store.get("lerp")).toBe(LIMITS.lerp.min);
  });

  it("未知キーと空packと不正packは読み込み時に無視する", () => {
    writeFileSync(file, JSON.stringify({ pack: "../secret", offset: 42, unknown: "x" }), "utf8");
    const store = createSettingsStore(file);
    expect(store.get("pack")).toBe(DEFAULTS.pack);
    expect(store.get("offset")).toBe(42);
    expect(store.getAll()).not.toHaveProperty("unknown");
  });

  it("set時も未知キーと空packと不正packを永続化しない", () => {
    const store = createSettingsStore(file);
    store.set({ pack: "", offset: 55, debug: true, notificationCompanionEnabled: true });
    store.set({ pack: "retro/../../secret" });
    const reopened = createSettingsStore(file);
    expect(reopened.get("pack")).toBe(DEFAULTS.pack);
    expect(reopened.get("offset")).toBe(55);
    expect(reopened.get("notificationCompanionEnabled")).toBe(true);
    expect(reopened.getAll()).not.toHaveProperty("debug");
  });

  it("nullや配列patchは無視する", () => {
    expect(sanitize(null)).toEqual({});
    expect(sanitize(["scale", 2])).toEqual({});
    const store = createSettingsStore(file);
    store.set(null);
    expect(store.getAll()).toEqual(DEFAULTS);
  });

  it("同値または無効patchでは永続化を省略する", () => {
    let writes = 0;
    const fileSystem = {
      readFileSync: () => { throw new Error("missing"); },
      writeFileSync: () => { writes += 1; },
    };
    const store = createSettingsStore(file, fileSystem);
    store.set(null);
    store.set({ scale: "abc", pack: "../secret" });
    store.set({ scale: DEFAULTS.scale });
    expect(writes).toBe(0);
    store.set({ scale: 2 });
    expect(writes).toBe(1);
  });

  it("hasStateChangeは実効差分だけを検出する", () => {
    expect(hasStateChange(DEFAULTS, {})).toBe(false);
    expect(hasStateChange(DEFAULTS, { scale: DEFAULTS.scale })).toBe(false);
    expect(hasStateChange(DEFAULTS, { scale: 2 })).toBe(true);
  });

  it("enabledはbooleanとして保存する", () => {
    const store = createSettingsStore(file);
    store.set({ enabled: 0 });
    expect(store.get("enabled")).toBe(false);
    store.set({ enabled: "yes" });
    expect(store.get("enabled")).toBe(true);
    store.set({ notificationCompanionEnabled: 1 });
    expect(store.get("notificationCompanionEnabled")).toBe(true);
  });
});

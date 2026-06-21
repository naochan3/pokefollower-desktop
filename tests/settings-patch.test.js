import { describe, it, expect } from "vitest";
import { applySettingsPatch } from "../src/main/settings-patch.js";
import { DEFAULTS } from "../src/main/settings-store.js";

function makeDeps(initial = {}, { resolvePack = (pack) => pack } = {}) {
  let state = { ...DEFAULTS, ...initial };
  const calls = [];
  return {
    calls,
    deps: {
      settingsStore: {
        getAll: () => ({ ...state }),
        set: (patch) => {
          calls.push(["settings:set", patch]);
          state = { ...state, ...patch };
          return { ...state };
        },
      },
      sim: {
        setConfig: (config) => calls.push(["sim:setConfig", config]),
      },
      loadPackIntoSim: (pack) => {
        calls.push(["pack:load", pack]);
        return resolvePack(pack);
      },
      setEnabled: (enabled) => calls.push(["enabled:set", enabled]),
      refreshTrayMenu: () => calls.push(["tray:refresh"]),
    },
  };
}

describe("settings-patch", () => {
  it("nullや不正patchではstore更新も副作用も起こさない", () => {
    const { deps, calls } = makeDeps();
    expect(applySettingsPatch(null, deps)).toEqual(DEFAULTS);
    expect(applySettingsPatch({ scale: "bad", pack: "../secret" }, deps)).toEqual(DEFAULTS);
    expect(calls).toEqual([]);
  });

  it("同値patchではstore更新も副作用も起こさない", () => {
    const { deps, calls } = makeDeps();
    expect(applySettingsPatch({ scale: DEFAULTS.scale, pack: DEFAULTS.pack, enabled: DEFAULTS.enabled }, deps))
      .toEqual(DEFAULTS);
    expect(calls).toEqual([]);
  });

  it("数値patchはsanitize後の値でsim設定を更新する", () => {
    const { deps, calls } = makeDeps();
    const next = applySettingsPatch({ scale: 999, offset: -10, lerp: 99 }, deps);
    expect(next).toMatchObject({ scale: 5, offset: 0, lerp: 0.5 });
    expect(calls).toEqual([
      ["settings:set", { scale: 5, offset: 0, lerp: 0.5 }],
      ["sim:setConfig", {
        vcp1_scale: 5,
        vcp1_offset: 0,
        vcp1_lerp: 0.5,
        vcp1_edgeRest: true,
        vcp1_avoidCursor: true,
        vcp1_avoidCursorStrength: "normal",
        vcp1_personality: "standard",
        vcp1_mode: "follow",
      }],
    ]);
  });

  it("edgeRest patchはsim設定を更新する", () => {
    const { deps, calls } = makeDeps();
    const next = applySettingsPatch({ edgeRest: false }, deps);
    expect(next.edgeRest).toBe(false);
    expect(calls).toEqual([
      ["settings:set", { edgeRest: false }],
      ["sim:setConfig", {
        vcp1_scale: 1.25,
        vcp1_offset: 70,
        vcp1_lerp: 0.2,
        vcp1_edgeRest: false,
        vcp1_avoidCursor: true,
        vcp1_avoidCursorStrength: "normal",
        vcp1_personality: "standard",
        vcp1_mode: "follow",
      }],
    ]);
  });

  it("avoidCursor patchはsim設定を更新する", () => {
    const { deps, calls } = makeDeps();
    const next = applySettingsPatch({ avoidCursor: false }, deps);
    expect(next.avoidCursor).toBe(false);
    expect(calls).toEqual([
      ["settings:set", { avoidCursor: false }],
      ["sim:setConfig", {
        vcp1_scale: 1.25,
        vcp1_offset: 70,
        vcp1_lerp: 0.2,
        vcp1_edgeRest: true,
        vcp1_avoidCursor: false,
        vcp1_avoidCursorStrength: "normal",
        vcp1_personality: "standard",
        vcp1_mode: "follow",
      }],
    ]);
  });

  it("avoidCursorStrength patchはsim設定を更新する", () => {
    const { deps, calls } = makeDeps();
    const next = applySettingsPatch({ avoidCursorStrength: "strong" }, deps);
    expect(next.avoidCursorStrength).toBe("strong");
    expect(calls).toEqual([
      ["settings:set", { avoidCursorStrength: "strong" }],
      ["sim:setConfig", {
        vcp1_scale: 1.25,
        vcp1_offset: 70,
        vcp1_lerp: 0.2,
        vcp1_edgeRest: true,
        vcp1_avoidCursor: true,
        vcp1_avoidCursorStrength: "strong",
        vcp1_personality: "standard",
        vcp1_mode: "follow",
      }],
    ]);
  });

  it("personality patchはsim設定を更新する", () => {
    const { deps, calls } = makeDeps();
    const next = applySettingsPatch({ personality: "friendly" }, deps);
    expect(next.personality).toBe("friendly");
    expect(calls).toEqual([
      ["settings:set", { personality: "friendly" }],
      ["sim:setConfig", {
        vcp1_scale: 1.25,
        vcp1_offset: 70,
        vcp1_lerp: 0.2,
        vcp1_edgeRest: true,
        vcp1_avoidCursor: true,
        vcp1_avoidCursorStrength: "normal",
        vcp1_personality: "friendly",
        vcp1_mode: "follow",
      }],
    ]);
  });

  it("mode patchはsim設定を更新する", () => {
    const { deps, calls } = makeDeps();
    const next = applySettingsPatch({ mode: "roam" }, deps);
    expect(next.mode).toBe("roam");
    expect(calls).toEqual([
      ["settings:set", { mode: "roam" }],
      ["sim:setConfig", {
        vcp1_scale: 1.25,
        vcp1_offset: 70,
        vcp1_lerp: 0.2,
        vcp1_edgeRest: true,
        vcp1_avoidCursor: true,
        vcp1_avoidCursorStrength: "normal",
        vcp1_personality: "standard",
        vcp1_mode: "roam",
      }],
    ]);
  });

  it("pack patchは解決結果が変わった時だけ保存し直す", () => {
    const { deps, calls } = makeDeps({}, { resolvePack: () => "retro/gen-1/025-pikachu" });
    applySettingsPatch({ pack: "retro/025-pikachu" }, deps);
    expect(calls).toEqual([
      ["settings:set", { pack: "retro/025-pikachu" }],
      ["pack:load", "retro/025-pikachu"],
      ["settings:set", { pack: "retro/gen-1/025-pikachu" }],
    ]);
  });

  it("enabled patchは状態更新とtray更新だけを走らせる", () => {
    const { deps, calls } = makeDeps();
    applySettingsPatch({ enabled: false }, deps);
    expect(calls).toEqual([
      ["settings:set", { enabled: false }],
      ["enabled:set", false],
      ["tray:refresh"],
    ]);
  });
});

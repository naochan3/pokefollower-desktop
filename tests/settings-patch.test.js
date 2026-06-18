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

  it("数値patchはsanitize後の値でsim設定を更新する", () => {
    const { deps, calls } = makeDeps();
    const next = applySettingsPatch({ scale: 999, offset: -10, lerp: 99 }, deps);
    expect(next).toMatchObject({ scale: 5, offset: 0, lerp: 0.5 });
    expect(calls).toEqual([
      ["settings:set", { scale: 5, offset: 0, lerp: 0.5 }],
      ["sim:setConfig", { vcp1_scale: 5, vcp1_offset: 0, vcp1_lerp: 0.5 }],
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

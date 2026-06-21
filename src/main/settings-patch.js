const { sanitize, hasStateChange } = require("./settings-store.js");

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function applySettingsPatch(patch, {
  settingsStore,
  sim,
  loadPackIntoSim,
  setEnabled,
  refreshTrayMenu,
}) {
  const safePatch = sanitize(patch);
  const current = settingsStore.getAll();
  if (Object.keys(safePatch).length === 0 || !hasStateChange(current, safePatch)) return current;

  const next = settingsStore.set(safePatch);
  if (
    hasOwn(safePatch, "scale") ||
    hasOwn(safePatch, "offset") ||
    hasOwn(safePatch, "lerp") ||
    hasOwn(safePatch, "edgeRest") ||
    hasOwn(safePatch, "avoidCursor") ||
    hasOwn(safePatch, "personality") ||
    hasOwn(safePatch, "mode")
  ) {
    sim.setConfig({
      vcp1_scale: next.scale,
      vcp1_offset: next.offset,
      vcp1_lerp: next.lerp,
      vcp1_edgeRest: next.edgeRest,
      vcp1_avoidCursor: next.avoidCursor,
      vcp1_personality: next.personality,
      vcp1_mode: next.mode,
    });
  }
  if (hasOwn(safePatch, "pack")) {
    try {
      const resolved = loadPackIntoSim(next.pack);
      if (resolved !== next.pack) settingsStore.set({ pack: resolved });
    } catch (_) { /* 解決失敗時は据え置き */ }
  }
  if (hasOwn(safePatch, "enabled")) {
    setEnabled(next.enabled);
    refreshTrayMenu();
  }
  return next;
}

module.exports = { applySettingsPatch };

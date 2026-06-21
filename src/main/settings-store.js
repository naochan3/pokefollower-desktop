const fs = require("node:fs");
const { isSafePackKey } = require("./asset-path.js");

const DEFAULTS = {
  enabled: true,
  pack: "retro/gen-1/009-blastoise",
  scale: 1.25,
  offset: 70,
  lerp: 0.20,
  edgeRest: true,
  avoidCursor: true,
};

const LIMITS = {
  scale: { min: 0.5, max: 5.0 },
  offset: { min: 0, max: 100 },
  lerp: { min: 0.05, max: 0.5 },
};

function clamp(n, { min, max }) {
  return Math.min(max, Math.max(min, n));
}

function sanitize(patch) {
  const out = {};
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return out;
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in DEFAULTS)) continue;
    if (k === "enabled" || k === "edgeRest" || k === "avoidCursor") { out[k] = !!v; continue; }
    if (k === "pack") {
      const pack = typeof v === "string" ? v.trim() : "";
      if (isSafePackKey(pack)) out.pack = pack;
      continue;
    }
    if (k in LIMITS) {
      const n = Number(v);
      if (Number.isFinite(n)) out[k] = clamp(n, LIMITS[k]);
    }
  }
  return out;
}

function hasStateChange(state, patch) {
  return Object.entries(patch).some(([key, value]) => state[key] !== value);
}

function createSettingsStore(filePath, fileSystem = fs) {
  let state = { ...DEFAULTS };
  try {
    const raw = JSON.parse(fileSystem.readFileSync(filePath, "utf8"));
    state = { ...DEFAULTS, ...sanitize(raw) };
  } catch (_) {
    state = { ...DEFAULTS };
  }
  function persist() {
    fileSystem.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf8");
  }
  return {
    getAll: () => ({ ...state }),
    get: (key) => state[key],
    set: (patch) => {
      const next = sanitize(patch);
      if (!hasStateChange(state, next)) return { ...state };
      state = { ...state, ...next };
      persist();
      return { ...state };
    },
  };
}

module.exports = { createSettingsStore, DEFAULTS, LIMITS, sanitize, hasStateChange };

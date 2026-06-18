const fs = require("node:fs");

const DEFAULTS = {
  enabled: true,
  pack: "retro/gen-1/009-blastoise",
  scale: 1.25,
  offset: 70,
  lerp: 0.20,
};

const LIMITS = {
  scale: { min: 0.5, max: 5.0 },
  offset: { min: 0, max: 100 },
  lerp: { min: 0.05, max: 0.5 },
};

const PACK_ID_PATTERN = /^retro\/(?:gen-[1-9]\/)?[0-9]{3,4}-[a-z0-9-]+$/;

function clamp(n, { min, max }) {
  return Math.min(max, Math.max(min, n));
}

function sanitize(patch) {
  const out = {};
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return out;
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in DEFAULTS)) continue;
    if (k === "enabled") { out.enabled = !!v; continue; }
    if (k === "pack") {
      const pack = typeof v === "string" ? v.trim() : "";
      if (PACK_ID_PATTERN.test(pack)) out.pack = pack;
      continue;
    }
    if (k in LIMITS) {
      const n = Number(v);
      if (Number.isFinite(n)) out[k] = clamp(n, LIMITS[k]);
    }
  }
  return out;
}

function createSettingsStore(filePath) {
  let state = { ...DEFAULTS };
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    state = { ...DEFAULTS, ...sanitize(raw) };
  } catch (_) {
    state = { ...DEFAULTS };
  }
  function persist() {
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf8");
  }
  return {
    getAll: () => ({ ...state }),
    get: (key) => state[key],
    set: (patch) => {
      state = { ...state, ...sanitize(patch) };
      persist();
      return { ...state };
    },
  };
}

module.exports = { createSettingsStore, DEFAULTS, LIMITS, PACK_ID_PATTERN, sanitize };

const fs = require("node:fs");

const DEFAULTS = {
  enabled: false,
  pack: "retro/gen-1/009-blastoise",
  scale: 1.25,
  offset: 30,
  lerp: 0.20,
};

const NUMERIC_KEYS = ["scale", "offset", "lerp"];

function sanitize(patch) {
  const out = {};
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in DEFAULTS)) continue;
    if (k === "enabled") { out.enabled = !!v; continue; }
    if (k === "pack") { if (typeof v === "string" && v.trim()) out.pack = v; continue; }
    if (NUMERIC_KEYS.includes(k)) {
      const n = Number(v);
      if (Number.isFinite(n)) out[k] = n;
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

module.exports = { createSettingsStore, DEFAULTS };

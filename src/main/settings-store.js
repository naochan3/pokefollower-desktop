const fs = require("node:fs");
const { isSafePackKey } = require("./asset-path.js");
const { clampRotationMinutes } = require("./favorite-rotation.js");

const DEFAULTS = {
  enabled: true,
  pack: "retro/gen-1/009-blastoise",
  favoritePacks: [],
  rotationEnabled: false,
  rotationIntervalMinutes: 15,
  scale: 1.25,
  offset: 70,
  lerp: 0.20,
  edgeRest: false,
  avoidCursor: true,
  avoidCursorStrength: "normal",
  personality: "standard",
  mode: "follow",
  appReactionsEnabled: false,
  notificationCompanionEnabled: false,
  workWatchEnabled: false,
  workWatchPreset: "25/5",
  nicknames: {},
};

const PERSONALITIES = new Set(["standard", "active", "relaxed", "friendly"]);
const MODES = new Set(["follow", "roam"]);
const AVOID_CURSOR_STRENGTHS = new Set(["normal", "strong"]);
const WORK_WATCH_PRESETS = new Set(["25/5", "50/10"]);

const LIMITS = {
  scale: { min: 0.5, max: 10.0 },
  offset: { min: 0, max: 250 },
  lerp: { min: 0.05, max: 1.0 },
};

function clamp(n, { min, max }) {
  return Math.min(max, Math.max(min, n));
}

function sanitize(patch) {
  const out = {};
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return out;
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in DEFAULTS)) continue;
    if (k === "enabled" || k === "edgeRest" || k === "avoidCursor" || k === "rotationEnabled" || k === "appReactionsEnabled" || k === "notificationCompanionEnabled" || k === "workWatchEnabled") { out[k] = !!v; continue; }
    if (k === "favoritePacks") {
      const packs = Array.isArray(v) ? v : [];
      const safePacks = [];
      for (const pack of packs) {
        const safePack = typeof pack === "string" ? pack.trim() : "";
        if (isSafePackKey(safePack) && !safePacks.includes(safePack)) safePacks.push(safePack);
        if (safePacks.length >= 6) break;
      }
      out.favoritePacks = safePacks;
      continue;
    }
    if (k === "nicknames") {
      const src = (v && typeof v === "object" && !Array.isArray(v)) ? v : {};
      const out2 = {};
      for (const [pk, name] of Object.entries(src)) {
        if (!isSafePackKey(pk)) continue;
        const nm = typeof name === "string" ? name.trim().slice(0, 24) : "";
        if (nm) out2[pk] = nm;
      }
      out.nicknames = out2;
      continue;
    }
    if (k === "rotationIntervalMinutes") {
      out.rotationIntervalMinutes = clampRotationMinutes(v);
      continue;
    }
    if (k === "personality") {
      const personality = typeof v === "string" ? v.trim() : "";
      if (PERSONALITIES.has(personality)) out.personality = personality;
      continue;
    }
    if (k === "mode") {
      const mode = typeof v === "string" ? v.trim() : "";
      if (MODES.has(mode)) out.mode = mode;
      continue;
    }
    if (k === "avoidCursorStrength") {
      const avoidCursorStrength = typeof v === "string" ? v.trim() : "";
      if (AVOID_CURSOR_STRENGTHS.has(avoidCursorStrength)) out.avoidCursorStrength = avoidCursorStrength;
      continue;
    }
    if (k === "workWatchPreset") {
      const workWatchPreset = typeof v === "string" ? v.trim() : "";
      if (WORK_WATCH_PRESETS.has(workWatchPreset)) out.workWatchPreset = workWatchPreset;
      continue;
    }
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

const MIN_ROTATION_MINUTES = 1;
const MAX_ROTATION_MINUTES = 120;
const MAX_FAVORITE_PACKS = 12;

const { isSafePackKey } = require("./asset-path.js");

function clampRotationMinutes(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 15;
  return Math.min(MAX_ROTATION_MINUTES, Math.max(MIN_ROTATION_MINUTES, Math.round(n)));
}

function nextFavoritePack(currentPack, favoritePacks = []) {
  const queue = Array.isArray(favoritePacks) ? favoritePacks.filter(Boolean) : [];
  if (queue.length === 0) return currentPack || null;
  const index = queue.indexOf(currentPack);
  if (index < 0) return queue[0];
  return queue[(index + 1) % queue.length];
}

function normalizeFavoritePacks(favoritePacks = []) {
  const queue = Array.isArray(favoritePacks) ? favoritePacks : [];
  const out = [];
  for (const pack of queue) {
    const safePack = typeof pack === "string" ? pack.trim() : "";
    if (isSafePackKey(safePack) && !out.includes(safePack)) out.push(safePack);
    if (out.length >= MAX_FAVORITE_PACKS) break;
  }
  return out;
}

function addFavoritePack(packKey, favoritePacks = []) {
  const queue = normalizeFavoritePacks(favoritePacks);
  const safePack = typeof packKey === "string" ? packKey.trim() : "";
  if (!isSafePackKey(safePack) || queue.includes(safePack)) return queue;
  return [...queue, safePack].slice(0, MAX_FAVORITE_PACKS);
}

function removeFavoritePack(packKey, favoritePacks = []) {
  const safePack = typeof packKey === "string" ? packKey.trim() : "";
  return normalizeFavoritePacks(favoritePacks).filter((pack) => pack !== safePack);
}

module.exports = {
  MIN_ROTATION_MINUTES,
  MAX_ROTATION_MINUTES,
  MAX_FAVORITE_PACKS,
  clampRotationMinutes,
  nextFavoritePack,
  normalizeFavoritePacks,
  addFavoritePack,
  removeFavoritePack,
};

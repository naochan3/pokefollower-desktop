const MIN_ROTATION_MINUTES = 1;
const MAX_ROTATION_MINUTES = 120;

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

module.exports = { MIN_ROTATION_MINUTES, MAX_ROTATION_MINUTES, clampRotationMinutes, nextFavoritePack };

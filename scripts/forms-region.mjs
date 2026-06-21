/**
 * forms-region.mjs
 *
 * Pure function: regionOf(subgroupName) → "alola"|"galar"|"hisui"|"paldea"|null
 *
 * Matches by prefix so derived forms like "Galar_Zen" → "galar".
 * Non-regional subgroups (Mega, Altcolor, Alternate, etc.) return null.
 */

const REGIONS = ["alola", "galar", "hisui", "paldea"];

/**
 * @param {string} name - Subgroup name from tracker.json (e.g. "Alola", "Galar_Zen")
 * @returns {"alola"|"galar"|"hisui"|"paldea"|null}
 */
export function regionOf(name) {
  const n = String(name || "").toLowerCase();
  return REGIONS.find((r) => n.startsWith(r)) ?? null;
}

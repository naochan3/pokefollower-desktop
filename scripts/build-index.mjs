#!/usr/bin/env node
/**
 * build-index.mjs
 * Scans assets/packs/retro/**\/*.json and regenerates assets/packs/index.json.
 *
 * Name format: "<dex>-<Capitalized>" matching the existing committed format.
 * Example: "025-pikachu" → "025-Pikachu", "122-mr-mime" → "122-Mr-Mime"
 *
 * Existing entries keep their committed name (preserves custom overrides like
 * "175-Togepi (Kats Fave)"). Only newly added entries get auto-generated names.
 *
 * Entries are sorted by dex number ascending. Form entries come right after
 * their base dex, ordered by region name.
 *
 * Usage: node scripts/build-index.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const base = path.join(root, 'assets', 'packs', 'retro');
const outPath = path.join(root, 'assets', 'packs', 'index.json');

/** Regional JA map */
const REGION_JA = {
  alola: 'アローラ',
  galar: 'ガラル',
  hisui: 'ヒスイ',
  paldea: 'パルデア',
};

/**
 * Convert a slug like "025-pikachu" or "122-mr-mime" to display name.
 * e.g. "025-pikachu"  → "025-Pikachu"
 *      "122-mr-mime"  → "122-Mr-Mime"
 *      "474-porygon-z"→ "474-Porygon-Z"
 */
function slugToDisplayName(slug) {
  const m = /^(\d+)-(.+)$/.exec(slug);
  if (!m) return slug;
  const [, dex, rest] = m;
  const titled = rest
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('-');
  return `${dex}-${titled}`;
}

/**
 * Build index entries from an in-memory tree.
 *
 * @param {Record<string, string[]>} tree
 *   Keys are either "gen-N" (normal) or "forms/<region>" (form).
 *   Values are slug arrays (e.g. ["026-raichu"]).
 * @param {Record<string, {ja: string, romaji: string}>} jp
 *   jp-names map keyed by dex string (e.g. "26").
 * @param {Map<string, string>} existingNames
 *   id → committed name map for preservation.
 * @returns {{ id: string, name: string, region?: string, ja?: string }[]}
 */
export function buildEntries(tree, jp, existingNames) {
  const entries = [];

  for (const [dir, slugs] of Object.entries(tree)) {
    const isForm = dir.startsWith('forms/');

    if (isForm) {
      const region = dir.slice('forms/'.length); // e.g. "alola"
      for (const slug of slugs) {
        const id = `retro/forms/${region}/${slug}`;
        // Extract dex number from slug (e.g. "026-raichu" → 26)
        const dexMatch = /^(\d+)-/.exec(slug);
        const dex = dexMatch ? String(parseInt(dexMatch[1], 10)) : null;
        // Base name part (e.g. "026-raichu" → "Raichu")
        const basePart = slug.replace(/^\d+-/, '');
        const baseTitled = basePart
          .split('-')
          .map(w => w.charAt(0).toUpperCase() + w.slice(1))
          .join('-');
        const dexPad = slug.match(/^(\d+)/)[1]; // e.g. "026"
        const regionTitled = region.charAt(0).toUpperCase() + region.slice(1);
        const autoName = `${dexPad}-${baseTitled}-${regionTitled}`;
        const name = existingNames.get(id) ?? autoName;
        const jaBase = (dex && jp[dex]) ? jp[dex].ja : '';
        const jaRegion = REGION_JA[region] ?? region;
        const ja = jaRegion + jaBase;
        entries.push({ id, name, region, ja });
      }
    } else {
      // Normal gen-N entry
      for (const slug of slugs) {
        const id = `retro/${dir}/${slug}`;
        const name = existingNames.get(id) ?? slugToDisplayName(slug);
        entries.push({ id, name });
      }
    }
  }

  // Sort: dex ascending; within same dex, normal before forms, forms by region
  entries.sort((a, b) => {
    const dexA = parseInt(a.id.match(/\/(\d+)-/)[1], 10);
    const dexB = parseInt(b.id.match(/\/(\d+)-/)[1], 10);
    if (dexA !== dexB) return dexA - dexB;
    // Same dex: normal (no region) before forms
    const aIsForm = a.region !== undefined;
    const bIsForm = b.region !== undefined;
    if (aIsForm !== bIsForm) return aIsForm ? 1 : -1;
    // Both forms: sort by region name
    return (a.region ?? '').localeCompare(b.region ?? '');
  });

  return entries;
}

// --- Main: filesystem scan (only when run directly, not when imported) ---
const isMain = process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) { (function main() {

// Load existing index to preserve committed names (e.g. "175-Togepi (Kats Fave)")
const existingNames = new Map();
if (fs.existsSync(outPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    for (const entry of existing.retro || []) {
      if (entry.id && entry.name) existingNames.set(entry.id, entry.name);
    }
  } catch (_) { /* ignore */ }
}

// Build tree by reading filesystem
const tree = {};

for (const entry of fs.readdirSync(base).sort()) {
  const entryPath = path.join(base, entry);
  if (!fs.statSync(entryPath).isDirectory()) continue;

  if (entry.startsWith('gen-')) {
    // Normal gen dir
    const slugs = fs.readdirSync(entryPath)
      .filter(f => f.endsWith('.json'))
      .sort()
      .map(f => f.replace(/\.json$/, ''));
    if (slugs.length > 0) tree[entry] = slugs;
  } else if (entry === 'forms') {
    // forms/<region> sub-dirs
    for (const region of fs.readdirSync(entryPath).sort()) {
      const regionPath = path.join(entryPath, region);
      if (!fs.statSync(regionPath).isDirectory()) continue;
      const slugs = fs.readdirSync(regionPath)
        .filter(f => f.endsWith('.json'))
        .sort()
        .map(f => f.replace(/\.json$/, ''));
      if (slugs.length > 0) tree[`forms/${region}`] = slugs;
    }
  }
}

// Load jp-names for ja composition
let jp = {};
const jpPath = path.join(root, 'assets', 'packs', 'jp-names.json');
if (fs.existsSync(jpPath)) {
  try {
    jp = JSON.parse(fs.readFileSync(jpPath, 'utf8'));
  } catch (_) { /* ignore */ }
}

const entries = buildEntries(tree, jp, existingNames);

// Write without trailing newline to match original file format
fs.writeFileSync(outPath, JSON.stringify({ retro: entries }, null, 2));
console.log(`index.json: ${entries.length} entries`);

})(); } // end isMain

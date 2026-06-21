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
 * Entries are sorted by dex number ascending.
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

const entries = [];

for (const gen of fs.readdirSync(base).sort()) {
  const genDir = path.join(base, gen);
  if (!fs.statSync(genDir).isDirectory()) continue;

  const files = fs.readdirSync(genDir)
    .filter(f => f.endsWith('.json'))
    .sort();

  for (const f of files) {
    const slug = f.replace(/\.json$/, '');
    const id = `retro/${gen}/${slug}`;
    // Prefer committed name to preserve custom overrides; fall back to auto-generated
    const name = existingNames.get(id) ?? slugToDisplayName(slug);
    entries.push({ id, name });
  }
}

// Sort by dex number ascending (stable across gen dirs)
entries.sort((a, b) => {
  const dexA = parseInt(a.id.match(/\/(\d+)-/)[1], 10);
  const dexB = parseInt(b.id.match(/\/(\d+)-/)[1], 10);
  return dexA - dexB;
});

// Write without trailing newline to match original file format
fs.writeFileSync(outPath, JSON.stringify({ retro: entries }, null, 2));
console.log(`index.json: ${entries.length} entries`);

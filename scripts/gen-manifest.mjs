#!/usr/bin/env node
/**
 * gen-manifest.mjs
 *
 * Determines which Gen 5–9 Pokémon (dex 494–1025) have PMD SpriteCollab sprites
 * (both Walk-Anim.png AND AnimData.xml present) and writes the result to
 * assets/packs/gen5-9-manifest.json.
 *
 * Algorithm:
 *  1. Fetch tracker.json from SpriteCollab (~10 MB).
 *  2. Filter dex 494–1025; entries with sprite_complete >= 1 are candidates.
 *  3. For each candidate, call `gh api repos/PMDCollab/SpriteCollab/contents/sprite/0XXX`
 *     and confirm both Walk-Anim.png and AnimData.xml are present.
 *  4. Write assets/packs/gen5-9-manifest.json.
 *
 * Usage: node scripts/gen-manifest.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outPath = path.join(root, 'assets', 'packs', 'gen5-9-manifest.json');

const TRACKER_URL =
  'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/tracker.json';
const CONCURRENCY = 12;
const DEX_START = 494;
const DEX_END = 1025;

/** Map dex number to generation. */
function dexToGen(dex) {
  if (dex <= 649) return 5;
  if (dex <= 721) return 6;
  if (dex <= 809) return 7;
  if (dex <= 905) return 8;
  return 9;
}

/**
 * Slugify an English Pokémon name for use in pack/folder names.
 * e.g. "Zoroark" → "zoroark", "Mr. Rime" → "mr-rime", "Farfetch'd" → "farfetch-d"
 */
function toSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Call `gh api` and return parsed JSON. Throws on failure. */
async function ghApiJson(endpoint) {
  const { stdout } = await execFileAsync('gh', [
    'api',
    endpoint,
    '--jq', '[.[].name]',
  ]);
  return JSON.parse(stdout.trim());
}

/** Run an array of async task factories with bounded concurrency. */
async function pLimit(tasks, limit) {
  const results = new Array(tasks.length);
  let next = 0;

  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, worker);
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log('Fetching tracker.json from SpriteCollab…');
const trackerRes = await fetch(TRACKER_URL);
if (!trackerRes.ok) {
  console.error(`Failed to fetch tracker.json: ${trackerRes.status}`);
  process.exit(1);
}
const tracker = await trackerRes.json();
console.log('tracker.json fetched.');

// Collect candidates (sprite_complete >= 1) and definite missing
const candidates = []; // { dex, name }
const missingEntries = []; // { dex, gen, name }

for (let dex = DEX_START; dex <= DEX_END; dex++) {
  const key = String(dex).padStart(4, '0');
  const entry = tracker[key];
  const name = entry?.name ?? `Unknown-${dex}`;
  const gen = dexToGen(dex);

  if (!entry || (entry.sprite_complete ?? 0) === 0) {
    missingEntries.push({ dex, gen, name });
  } else {
    candidates.push({ dex, name, gen });
  }
}

console.log(
  `Candidates to check: ${candidates.length} | Already missing: ${missingEntries.length}`
);

// For each candidate, verify folder contains both required files via gh api
const includable = [];
const tasks = candidates.map(({ dex, name, gen }) => async () => {
  const d4 = String(dex).padStart(4, '0');
  try {
    const files = await ghApiJson(
      `repos/PMDCollab/SpriteCollab/contents/sprite/${d4}`
    );
    const hasWalk = files.includes('Walk-Anim.png');
    const hasAnim = files.includes('AnimData.xml');
    return { dex, gen, name, ok: hasWalk && hasAnim };
  } catch {
    // API error → treat as missing
    return { dex, gen, name, ok: false };
  }
});

console.log(`Checking ${tasks.length} candidates with ${CONCURRENCY} parallel workers…`);
const checked = await pLimit(tasks, CONCURRENCY);

for (const { dex, gen, name, ok } of checked) {
  if (ok) {
    includable.push({ dex, gen, slug: toSlug(name), name });
  } else {
    missingEntries.push({ dex, gen, name });
  }
}

// Sort both arrays by dex ascending
includable.sort((a, b) => a.dex - b.dex);
missingEntries.sort((a, b) => a.dex - b.dex);

const manifest = {
  generatedFrom: 'PMDCollab/SpriteCollab tracker.json + contents API',
  includable,
  missing: missingEntries,
};

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n');

// Summary
console.log(`\nManifest written to: ${path.relative(root, outPath)}`);
console.log(`Total includable: ${includable.length} | Total missing: ${missingEntries.length}`);

const gens = [5, 6, 7, 8, 9];
const genRanges = { 5: [494, 649], 6: [650, 721], 7: [722, 809], 8: [810, 905], 9: [906, 1025] };
for (const g of gens) {
  const inc = includable.filter(p => p.gen === g).length;
  const mis = missingEntries.filter(p => p.gen === g).length;
  const [lo, hi] = genRanges[g];
  console.log(`  Gen ${g} (${lo}–${hi}): ${inc} includable, ${mis} missing`);
}

// Spot-checks
const z = includable.find(p => p.dex === 571);
console.log('\nSpot-check dex 571 (Zoroark):', z ?? 'NOT FOUND in includable');
const s = missingEntries.find(p => p.dex === 514);
console.log('Spot-check dex 514 (missing):', s ?? 'NOT FOUND in missing');

#!/usr/bin/env node
/**
 * forms-manifest.mjs
 *
 * Determines which regional Pokémon forms (Alola/Galar/Hisui/Paldea) have
 * complete PMD SpriteCollab sprites and writes the result to
 * assets/packs/forms-manifest.json.
 *
 * Algorithm:
 *  1. Fetch tracker.json from SpriteCollab (~10 MB).
 *  2. For each dex entry, iterate subgroups; keep those where:
 *       - regionOf(subgroup.name) is non-null (regional form)
 *       - subgroup.sprite_complete >= 1
 *  3. For each candidate, call `gh api .../sprite/<d4>/<subindex>` and confirm
 *     Idle-Anim.png, Walk-Anim.png, Sleep-Anim.png, AND AnimData.xml are present.
 *     (Sleep is required — stricter than gen-manifest.)
 *  4. Dedupe: if two subgroups map to the same region+dex, keep the first;
 *     push the rest to missing with a logged note.
 *  5. Write assets/packs/forms-manifest.json.
 *
 * Usage: node scripts/forms-manifest.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { regionOf } from './forms-region.mjs';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outPath = path.join(root, 'assets', 'packs', 'forms-manifest.json');

const TRACKER_URL =
  'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/tracker.json';
const CONCURRENCY = 12;

// Required files in each form's sprite subfolder (stricter than gen-manifest: Sleep required)
const REQUIRED_FILES = ['Idle-Anim.png', 'Walk-Anim.png', 'Sleep-Anim.png', 'AnimData.xml'];

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

/** Call `gh api` and return list of file names in the directory. Throws on failure. */
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

// Collect candidates from all dex entries
// candidate: { dex, region, subindex, baseName, name }
const candidates = [];
const missingEntries = []; // { dex, region, name } — filtered out before API check

// Track seen region+dex combos for deduplication
const seenRegionDex = new Map(); // key = `${region}:${dex}` → first candidate's name

for (const [key, entry] of Object.entries(tracker)) {
  const dex = parseInt(key, 10);
  if (!Number.isInteger(dex) || !entry?.subgroups) continue;

  const baseName = entry.name ?? `Unknown-${dex}`;

  for (const [subindex, sub] of Object.entries(entry.subgroups)) {
    const region = regionOf(sub.name);
    if (region === null) continue; // Not a regional form

    if ((sub.sprite_complete ?? 0) < 1) {
      missingEntries.push({ dex, region, name: sub.name });
      continue;
    }

    // Deduplicate region+dex
    const dedupeKey = `${region}:${dex}`;
    if (seenRegionDex.has(dedupeKey)) {
      const firstName = seenRegionDex.get(dedupeKey);
      console.warn(
        `[DEDUPE] dex=${dex} region=${region}: keeping subgroup "${firstName}", ` +
        `skipping "${sub.name}" (subindex=${subindex})`
      );
      missingEntries.push({ dex, region, name: sub.name });
      continue;
    }

    seenRegionDex.set(dedupeKey, sub.name);
    candidates.push({ dex, region, subindex, baseName, name: sub.name });
  }
}

console.log(
  `Candidates to check: ${candidates.length} | Pre-filtered missing: ${missingEntries.length}`
);

// For each candidate, verify the sprite subfolder contains all 4 required files
const includable = [];
const tasks = candidates.map(({ dex, region, subindex, baseName, name }) => async () => {
  const d4 = String(dex).padStart(4, '0');
  try {
    const files = await ghApiJson(
      `repos/PMDCollab/SpriteCollab/contents/sprite/${d4}/${subindex}`
    );
    const hasAll = REQUIRED_FILES.every((f) => files.includes(f));
    return { dex, region, subindex, baseName, name, ok: hasAll, missing: REQUIRED_FILES.filter(f => !files.includes(f)) };
  } catch {
    // API error → treat as missing
    return { dex, region, subindex, baseName, name, ok: false, missing: ['(API error)'] };
  }
});

console.log(`Checking ${tasks.length} candidates with ${CONCURRENCY} parallel workers…`);
const checked = await pLimit(tasks, CONCURRENCY);

for (const { dex, region, subindex, baseName, name, ok, missing } of checked) {
  if (ok) {
    const baseSlug = toSlug(baseName);
    const nnn = String(dex).padStart(3, '0');
    includable.push({ dex, region, subindex, baseSlug, slug: `${nnn}-${baseSlug}` });
  } else {
    if (missing[0] !== '(API error)') {
      console.warn(`[INCOMPLETE] dex=${dex} region=${region} name=${name}: missing ${missing.join(', ')}`);
    }
    missingEntries.push({ dex, region, name });
  }
}

// Sort both arrays by dex then region
includable.sort((a, b) => a.dex - b.dex || a.region.localeCompare(b.region));
missingEntries.sort((a, b) => a.dex - b.dex || (a.region ?? '').localeCompare(b.region ?? ''));

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

const regions = ['alola', 'galar', 'hisui', 'paldea'];
for (const r of regions) {
  const inc = includable.filter((p) => p.region === r).length;
  const mis = missingEntries.filter((p) => p.region === r).length;
  console.log(`  ${r}: ${inc} includable, ${mis} missing`);
}

// Spot-check: Alolan Raichu (dex 26)
const raichu = includable.find((p) => p.dex === 26 && p.region === 'alola');
console.log('\nSpot-check dex 26 alola (Alolan Raichu):', raichu ?? 'NOT FOUND in includable');

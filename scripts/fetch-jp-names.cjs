// fetch-jp-names.cjs
// Fetches Japanese names (katakana + romaji) for Pokédex #1-493 from PokéAPI
// Usage: node scripts/fetch-jp-names.cjs
// Outputs: assets/packs/jp-names.json

'use strict';

const fs = require('fs');
const path = require('path');

const OUTPUT_PATH = path.join(__dirname, '..', 'assets', 'packs', 'jp-names.json');
const BASE_URL = 'https://pokeapi.co/api/v2/pokemon-species';
const TOTAL = 1025;
const CONCURRENCY = 8;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
      }
      return await res.json();
    } catch (err) {
      if (attempt === retries) throw err;
      const delay = RETRY_DELAY_MS * attempt;
      console.warn(`  [retry ${attempt}/${retries - 1}] ${url} — ${err.message}. Waiting ${delay}ms…`);
      await sleep(delay);
    }
  }
}

function extractNames(data) {
  const names = data.names || [];
  let ja = null;
  let romaji = null;

  for (const entry of names) {
    const lang = entry.language?.name;
    if (lang === 'ja' && ja === null) {
      ja = entry.name;
    } else if (lang === 'ja-hrkt' && ja === null) {
      // fallback if 'ja' not present
      ja = entry.name;
    }
    if (lang === 'ja-roma') {
      romaji = entry.name;
    }
  }

  return { ja, romaji };
}

async function runWithConcurrency(ids, worker) {
  const results = new Map();
  let idx = 0;

  async function runNext() {
    while (idx < ids.length) {
      const id = ids[idx++];
      const result = await worker(id);
      results.set(id, result);
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, () => runNext());
  await Promise.all(workers);
  return results;
}

async function main() {
  console.log(`Fetching Japanese names for Pokédex #1–${TOTAL} from PokéAPI…`);
  console.log(`Concurrency: ${CONCURRENCY}, Max retries: ${MAX_RETRIES}`);
  console.log('');

  const ids = Array.from({ length: TOTAL }, (_, i) => i + 1);
  const missing = [];
  let processed = 0;

  const results = await runWithConcurrency(ids, async (id) => {
    const url = `${BASE_URL}/${id}/`;
    try {
      const data = await fetchWithRetry(url);
      const { ja, romaji } = extractNames(data);

      if (!ja) {
        missing.push(id);
        console.warn(`  [WARN] #${id}: no katakana found (romaji: ${romaji ?? 'none'})`);
      }

      processed++;
      if (processed % 50 === 0) {
        console.log(`  Progress: ${processed}/${TOTAL}`);
      }

      return { ja, romaji };
    } catch (err) {
      console.error(`  [ERROR] #${id} failed after retries: ${err.message}`);
      missing.push(id);
      return { ja: null, romaji: null };
    }
  });

  // Build output sorted by numeric dex number
  const output = {};
  for (let id = 1; id <= TOTAL; id++) {
    const entry = results.get(id);
    output[String(id)] = entry ?? { ja: null, romaji: null };
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2) + '\n', 'utf8');

  console.log('');
  console.log(`Written: ${OUTPUT_PATH}`);
  console.log(`Total entries: ${Object.keys(output).length}`);

  if (missing.length > 0) {
    console.warn(`\nMissing/fallback IDs (${missing.length}): ${missing.join(', ')}`);
    if (missing.length > 10) {
      console.error('Too many missing — please check your network and re-run before committing.');
      process.exit(1);
    }
  } else {
    console.log(`All ${TOTAL} entries have katakana names.`);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});

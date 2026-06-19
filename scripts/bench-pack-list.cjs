const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { makePackReader } = require("../src/main/pack-reader.js");

const root = path.join(__dirname, "..");
const reader = makePackReader(root);
const iterations = Number(process.env.PF_PACK_BENCH_ITERATIONS || 1000);
const targetCount = Number(process.env.PF_PACK_BENCH_TARGET_COUNT || 1025);
const queries = ["ピカ", "pikachu", "025", "#025", "arceus", "アルセウス", "1025"];

function toHira(s) {
  return String(s || "").replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

function tileSearchText(p) {
  const num = p.num == null ? "" : String(p.num);
  const padded = num ? num.padStart(3, "0") : "";
  return [p.ja, toHira(p.ja), p.romaji, p.en, num, padded, `#${padded}`].join(" ").toLowerCase();
}

function time(label, fn) {
  const started = performance.now();
  const result = fn();
  const elapsed = performance.now() - started;
  return { label, elapsed, result };
}

function makeSyntheticList(base, count) {
  const list = [...base];
  for (let n = list.length + 1; n <= count; n += 1) {
    const padded = String(n).padStart(3, "0");
    list.push({
      id: `retro/gen-${generationForDex(n)}/${padded}-synthetic-${n}`,
      num: n,
      ja: `Synthetic ${n}`,
      romaji: `synthetic-${n}`,
      en: `Synthetic ${n}`,
    });
  }
  return list;
}

function generationForDex(num) {
  if (num <= 151) return 1;
  if (num <= 251) return 2;
  if (num <= 386) return 3;
  if (num <= 493) return 4;
  if (num <= 649) return 5;
  if (num <= 721) return 6;
  if (num <= 809) return 7;
  if (num <= 905) return 8;
  return 9;
}

function buildSearchRows(list) {
  return list.map((p) => ({ id: p.id, search: tileSearchText(p) }));
}

function runSearch(rows) {
  let matches = 0;
  for (let i = 0; i < iterations; i += 1) {
    const raw = queries[i % queries.length].trim().toLowerCase();
    const hira = toHira(raw);
    for (const row of rows) {
      if (!raw || row.search.includes(raw) || row.search.includes(hira)) matches += 1;
    }
  }
  return matches;
}

const read = time("readPackList", () => reader.readPackList());
const current = read.result;
const currentRows = time("current search index", () => buildSearchRows(current));
const currentSearch = time("current search loop", () => runSearch(currentRows.result));

const synthetic = time(`synthetic ${targetCount} list`, () => makeSyntheticList(current, targetCount));
const syntheticRows = time(`synthetic ${targetCount} search index`, () => buildSearchRows(synthetic.result));
const syntheticSearch = time(`synthetic ${targetCount} search loop`, () => runSearch(syntheticRows.result));

console.log(`[bench-pack-list] iterations: ${iterations}`);
console.log(`[bench-pack-list] current entries: ${current.length}`);
console.log(`[bench-pack-list] target entries: ${synthetic.result.length}`);
for (const item of [read, currentRows, currentSearch, synthetic, syntheticRows, syntheticSearch]) {
  console.log(`[bench-pack-list] ${item.label}: ${item.elapsed.toFixed(4)}ms`);
}
console.log(`[bench-pack-list] current matches: ${currentSearch.result}`);
console.log(`[bench-pack-list] synthetic matches: ${syntheticSearch.result}`);

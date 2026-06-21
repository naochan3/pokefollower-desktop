const fs = require("node:fs");
const path = require("node:path");
const { makePackReader } = require("../src/main/pack-reader.js");
const { buildPokemonSearchIndex, searchPokemon } = require("../src/settings/search-engine.js");

const root = path.join(__dirname, "..");
const packReader = makePackReader(root);
const packs = packReader.readPackList();
const metadata = packReader.readSearchMetadata();
const queries = ["ほのお", "赤緑 でんき", "初代 御三家", "映画 ミュウ", "カントー 伝説", "ピカチュウ", "チコリータ"];

function nowMs() {
  const [sec, ns] = process.hrtime();
  return sec * 1000 + ns / 1e6;
}

const buildStart = nowMs();
const index = buildPokemonSearchIndex(packs, metadata);
const buildMs = nowMs() - buildStart;
const searchStart = nowMs();
let resultCount = 0;
for (let i = 0; i < 200; i++) {
  for (const query of queries) resultCount += searchPokemon(index, query, metadata).length;
}
const searchMs = nowMs() - searchStart;

if (index.length !== packs.length) {
  throw new Error(`search index size ${index.length} does not match pack count ${packs.length}`);
}
if (buildMs > 250) {
  throw new Error(`search index build too slow: ${buildMs.toFixed(2)}ms`);
}
if (searchMs > 500) {
  throw new Error(`search batch too slow: ${searchMs.toFixed(2)}ms`);
}

console.log(`[bench-search-index] ok: ${packs.length} packs, build ${buildMs.toFixed(2)}ms, ${queries.length * 200} searches ${searchMs.toFixed(2)}ms, result count ${resultCount}`);

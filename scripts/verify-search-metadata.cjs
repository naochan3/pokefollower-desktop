const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const metadataPath = path.join(root, "assets", "packs", "search-metadata.json");
const indexPath = path.join(root, "assets", "packs", "index.json");
const docsPath = path.join(root, "docs", "search-metadata.md");
const pkgPath = path.join(root, "package.json");

const errors = [];

function fail(message) {
  errors.push(message);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function hasFacetValue(metadata, facet, value) {
  return Boolean(metadata.facets?.[facet]?.[String(value)]);
}

const metadata = readJson(metadataPath);
const index = readJson(indexPath);
const docs = fs.readFileSync(docsPath, "utf8");
const pkg = readJson(pkgPath);
const packIds = new Set((index.retro || []).map((entry) => entry.id));
const entries = metadata.entries || {};

if (metadata.schemaVersion !== 1) fail("search-metadata schemaVersion must be 1");
if (!metadata.coveragePolicy?.missingEntry?.includes("name")) fail("coveragePolicy must document name-search fallback for missing metadata");
if (!metadata.coveragePolicy?.mediaTags?.includes("sparse")) fail("coveragePolicy must document sparse mediaTags");

for (const facet of ["types", "traits", "generations", "regions", "debutGames", "mediaTags"]) {
  if (!metadata.facets?.[facet] || Object.keys(metadata.facets[facet]).length === 0) {
    fail(`facet ${facet} must be defined`);
  }
}

for (const required of ["electric", "fire", "water", "grass", "poison", "psychic", "flying", "normal", "ice", "steel", "ground", "ghost"]) {
  if (!hasFacetValue(metadata, "types", required)) fail(`types facet missing ${required}`);
}

for (const required of ["starter", "legendary", "mascot", "mouse", "regional-form"]) {
  if (!hasFacetValue(metadata, "traits", required)) fail(`traits facet missing ${required}`);
}

for (const required of ["kanto", "alola", "galar", "hisui", "paldea"]) {
  if (!hasFacetValue(metadata, "regions", required)) fail(`regions facet missing ${required}`);
}

for (const required of ["red-green", "yellow", "sun-moon", "sword-shield", "legends-arceus", "scarlet-violet"]) {
  if (!hasFacetValue(metadata, "debutGames", required)) fail(`debutGames facet missing ${required}`);
}

for (const [id, entry] of Object.entries(entries)) {
  if (!packIds.has(id)) fail(`metadata entry references unknown pack id: ${id}`);
  if (!Array.isArray(entry.types)) fail(`${id}: types must be an array`);
  if (!Array.isArray(entry.traits)) fail(`${id}: traits must be an array`);
  if (!Number.isInteger(entry.generation)) fail(`${id}: generation must be an integer`);
  if (!entry.region) fail(`${id}: region is required`);
  if (!Array.isArray(entry.debutGames) || entry.debutGames.length === 0) fail(`${id}: debutGames must be a non-empty array`);
  if (!Array.isArray(entry.seriesLabels) || entry.seriesLabels.length === 0) fail(`${id}: seriesLabels must be a non-empty array`);
  if (!Array.isArray(entry.mediaTags)) fail(`${id}: mediaTags must be an array`);
  if (typeof entry.categoryJa !== "string" || entry.categoryJa.trim() === "") fail(`${id}: categoryJa is required`);

  for (const type of entry.types || []) {
    if (!hasFacetValue(metadata, "types", type)) fail(`${id}: unknown type ${type}`);
  }
  for (const trait of entry.traits || []) {
    if (!hasFacetValue(metadata, "traits", trait)) fail(`${id}: unknown trait ${trait}`);
  }
  if (!hasFacetValue(metadata, "generations", entry.generation)) fail(`${id}: unknown generation ${entry.generation}`);
  if (!hasFacetValue(metadata, "regions", entry.region)) fail(`${id}: unknown region ${entry.region}`);
  for (const debutGame of entry.debutGames || []) {
    if (!hasFacetValue(metadata, "debutGames", debutGame)) fail(`${id}: unknown debutGame ${debutGame}`);
  }
  for (const mediaTag of entry.mediaTags || []) {
    if (!hasFacetValue(metadata, "mediaTags", mediaTag)) fail(`${id}: unknown mediaTag ${mediaTag}`);
  }
}

for (const requiredEntry of [
  "retro/gen-1/001-bulbasaur",
  "retro/gen-1/004-charmander",
  "retro/gen-1/007-squirtle",
  "retro/gen-1/025-pikachu",
  "retro/forms/alola/026-raichu",
  "retro/forms/galar/052-meowth",
  "retro/forms/hisui/570-zorua",
  "retro/forms/paldea/194-wooper",
]) {
  if (!entries[requiredEntry]) fail(`initial metadata set must include ${requiredEntry}`);
}

if (!docs.includes("Issue #77")) fail("docs/search-metadata.md must mention Issue #77");
if (!docs.includes("metadata がない pack")) fail("docs/search-metadata.md must document missing metadata behavior");
if (!docs.includes("映画・アニメタグ")) fail("docs/search-metadata.md must document media tag scope");
if (pkg.scripts?.["verify:search-metadata"] !== "node scripts/verify-search-metadata.cjs") {
  fail("package.json must expose verify:search-metadata");
}
if (!pkg.scripts?.["verify:local"]?.includes("npm run verify:search-metadata")) {
  fail("verify:local must include verify:search-metadata");
}

if (errors.length > 0) {
  for (const error of errors) console.error(`[verify-search-metadata] ${error}`);
  process.exit(1);
}

const missingCount = packIds.size - Object.keys(entries).length;
console.log(`[verify-search-metadata] ok: ${Object.keys(entries).length} metadata entries, ${missingCount} packs intentionally fall back to name search`);

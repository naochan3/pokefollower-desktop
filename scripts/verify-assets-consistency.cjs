const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const indexPath = path.join(root, "assets", "packs", "index.json");
const namesPath = path.join(root, "assets", "packs", "jp-names.json");
const expectedDirections = [
  "front",
  "frontRight",
  "right",
  "backRight",
  "back",
  "backLeft",
  "left",
  "frontLeft",
];
const expectedStates = ["idle", "walk", "sleep"];

const errors = [];

function fail(message) {
  errors.push(message);
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function exists(file) {
  return fs.existsSync(file);
}

function listFiles(dir, extension) {
  if (!exists(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => entry.name);
}

function dexFromName(name) {
  const match = /^(\d{3,4})-/.exec(name);
  return match ? Number(match[1]) : null;
}

const index = readJson(indexPath);
const entries = index.retro || [];
const names = readJson(namesPath);
const seenIds = new Set();
const seenDex = new Set();
const packIds = new Set();
const uiIds = new Set();

for (const entry of entries) {
  if (!entry.id) fail("index entry missing id");
  if (seenIds.has(entry.id)) fail(`duplicate index id: ${entry.id}`);
  seenIds.add(entry.id);

  const relative = entry.id.replace(/^retro\//, "");
  const packPath = path.join(root, "assets", "packs", "retro", `${relative}.json`);
  if (!exists(packPath)) {
    fail(`pack JSON missing for index id: ${entry.id}`);
    continue;
  }

  const pack = readJson(packPath);
  const expectedRawPath = relative;
  const generation = path.dirname(relative);
  const slug = path.basename(relative);
  const expectedPackName = slug;
  if (pack.rawPath !== expectedRawPath) {
    fail(`${entry.id}: rawPath ${pack.rawPath} != ${expectedRawPath}`);
  }
  if (pack.generation !== generation) {
    fail(`${entry.id}: generation ${pack.generation} != ${generation}`);
  }
  if (pack.name !== expectedPackName) {
    fail(`${entry.id}: pack name ${pack.name} != ${expectedPackName}`);
  }
  if (!entry.name || !entry.name.startsWith(slug.split("-")[0])) {
    fail(`${entry.id}: index display name ${entry.name} does not start with dex number`);
  }

  const dex = dexFromName(slug);
  if (dex === null) fail(`${entry.id}: could not parse dex number`);
  if (dex !== null) {
    if (seenDex.has(dex)) fail(`${entry.id}: duplicate dex number ${dex}`);
    seenDex.add(dex);
    const nameEntry = names[String(dex)];
    if (!nameEntry) {
      fail(`${entry.id}: jp-names missing dex ${dex}`);
    } else {
      if (typeof nameEntry.ja !== "string" || nameEntry.ja.trim() === "") {
        fail(`${entry.id}: jp-names dex ${dex} missing ja`);
      }
      if (typeof nameEntry.romaji !== "string" || nameEntry.romaji.trim() === "") {
        fail(`${entry.id}: jp-names dex ${dex} missing romaji`);
      }
    }
  }

  const uiPng = path.join(root, "assets", "ui", generation, `${slug}.png`);
  if (!exists(uiPng)) fail(`${entry.id}: UI PNG missing`);

  for (const stateName of expectedStates) {
    const state = pack.states?.[stateName];
    if (!state) {
      fail(`${entry.id}: missing state ${stateName}`);
      continue;
    }
    if (typeof state.sheet !== "string" || state.sheet.length === 0) {
      fail(`${entry.id}: ${stateName} sheet is missing`);
      continue;
    }
    const sheet = path.join(root, "assets", "raw", pack.rawPath, state.sheet);
    if (!exists(sheet)) fail(`${entry.id}: ${stateName} sheet missing: ${state.sheet}`);
    for (const direction of expectedDirections) {
      if (!state.rows || !(direction in state.rows)) {
        fail(`${entry.id}: ${stateName} rows missing direction ${direction}`);
      }
    }
  }
}

for (const gen of fs.readdirSync(path.join(root, "assets", "packs", "retro"))) {
  const genDir = path.join(root, "assets", "packs", "retro", gen);
  for (const file of listFiles(genDir, ".json")) {
    packIds.add(`retro/${gen}/${file.replace(/\.json$/, "")}`);
  }
}

for (const gen of fs.readdirSync(path.join(root, "assets", "ui"))) {
  const genDir = path.join(root, "assets", "ui", gen);
  if (!fs.statSync(genDir).isDirectory() || !/^gen-\d+$/.test(gen)) continue;
  for (const file of listFiles(genDir, ".png")) {
    uiIds.add(`retro/${gen}/${file.replace(/\.png$/, "")}`);
  }
}

for (const id of seenIds) {
  if (!packIds.has(id)) fail(`index id missing pack JSON: ${id}`);
  if (!uiIds.has(id)) fail(`index id missing UI PNG: ${id}`);
}
for (const id of packIds) {
  if (!seenIds.has(id)) fail(`pack JSON not listed in index: ${id}`);
}
for (const id of uiIds) {
  if (!seenIds.has(id)) fail(`UI PNG not listed in index: ${id}`);
}

const dexNumbers = entries.map((entry) => dexFromName(path.basename(entry.id))).filter((dex) => dex !== null);
const minDex = Math.min(...dexNumbers);
const maxDex = Math.max(...dexNumbers);
for (let dex = minDex; dex <= maxDex; dex++) {
  if (!dexNumbers.includes(dex)) fail(`missing dex number in current range: ${dex}`);
}

if (errors.length > 0) {
  for (const error of errors) console.error(`[verify-assets-consistency] ${error}`);
  process.exit(1);
}

console.log(
  `[verify-assets-consistency] ok: ${entries.length} indexed entries, dex ${minDex}-${maxDex}, pack/UI/name/raw references consistent`,
);

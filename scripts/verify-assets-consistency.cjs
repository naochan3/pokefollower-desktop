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
const REGION_JA = {
  alola: "アローラ",
  galar: "ガラル",
  hisui: "ヒスイ",
  paldea: "パルデア",
};

const seenIds = new Set();
const seenDex = new Set();
const seenFormKey = new Set(); // "region:dex" uniqueness for form entries
const packIds = new Set();
const uiIds = new Set();

for (const entry of entries) {
  if (!entry.id) fail("index entry missing id");
  if (seenIds.has(entry.id)) fail(`duplicate index id: ${entry.id}`);
  seenIds.add(entry.id);

  const isForm = Boolean(entry.region);
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
    if (isForm) {
      // フォルムは dex 重複が正当。region+dex の組み合わせで一意性を確認
      const formKey = `${entry.region}:${dex}`;
      if (seenFormKey.has(formKey)) fail(`${entry.id}: duplicate form key ${formKey}`);
      seenFormKey.add(formKey);
      // jp-names ではなく entry.ja を直接確認
      if (typeof entry.ja !== "string" || entry.ja.trim() === "") {
        fail(`${entry.id}: form entry missing ja field`);
      } else {
        // ja がリージョンプレフィックスだけでないことを確認（ベース名が含まれているか）
        const regionPrefix = REGION_JA[entry.region];
        if (regionPrefix) {
          if (!entry.ja.startsWith(regionPrefix)) {
            fail(`${entry.id}: form entry ja "${entry.ja}" does not start with region prefix "${regionPrefix}"`);
          } else if (entry.ja === regionPrefix) {
            fail(`${entry.id}: form entry ja "${entry.ja}" is only the region prefix — base Pokémon name is missing`);
          } else if (entry.ja.length <= regionPrefix.length) {
            fail(`${entry.id}: form entry ja "${entry.ja}" has no base name beyond region prefix "${regionPrefix}"`);
          }
        }
      }
    } else {
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
  if (!fs.statSync(genDir).isDirectory()) continue;
  if (gen === "forms") {
    // forms/<region>/*.json — 1レベル深い
    for (const region of fs.readdirSync(genDir)) {
      const regionDir = path.join(genDir, region);
      if (!fs.statSync(regionDir).isDirectory()) continue;
      for (const file of listFiles(regionDir, ".json")) {
        packIds.add(`retro/forms/${region}/${file.replace(/\.json$/, "")}`);
      }
    }
  } else {
    for (const file of listFiles(genDir, ".json")) {
      packIds.add(`retro/${gen}/${file.replace(/\.json$/, "")}`);
    }
  }
}

for (const gen of fs.readdirSync(path.join(root, "assets", "ui"))) {
  const genDir = path.join(root, "assets", "ui", gen);
  if (!fs.statSync(genDir).isDirectory()) continue;
  if (gen === "forms") {
    // forms/<region>/*.png — 1レベル深い
    for (const region of fs.readdirSync(genDir)) {
      const regionDir = path.join(genDir, region);
      if (!fs.statSync(regionDir).isDirectory()) continue;
      for (const file of listFiles(regionDir, ".png")) {
        uiIds.add(`retro/forms/${region}/${file.replace(/\.png$/, "")}`);
      }
    }
  } else if (/^gen-\d+$/.test(gen)) {
    for (const file of listFiles(genDir, ".png")) {
      uiIds.add(`retro/${gen}/${file.replace(/\.png$/, "")}`);
    }
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

// No duplicate dex check is already enforced above (seenDex set, line ~87).
// Gaps within a generation are LEGITIMATE (SpriteCollab is missing sprites for many Pokémon),
// so contiguity is no longer a valid invariant.

// Generation–range agreement: each entry's gen-N folder must match the national-dex range.
const GEN_RANGES = {
  "gen-1": [1, 151],
  "gen-2": [152, 251],
  "gen-3": [252, 386],
  "gen-4": [387, 493],
  "gen-5": [494, 649],
  "gen-6": [650, 721],
  "gen-7": [722, 809],
  "gen-8": [810, 905],
  "gen-9": [906, 1025],
};
// フォルムエントリを除いた通常エントリのみでdex範囲を計算
const normalEntries = entries.filter((e) => !e.region);
const dexNumbers = normalEntries.map((entry) => dexFromName(path.basename(entry.id))).filter((dex) => dex !== null);
const minDex = dexNumbers.length ? Math.min(...dexNumbers) : 0;
const maxDex = dexNumbers.length ? Math.max(...dexNumbers) : 0;

for (const entry of entries) {
  const relative = entry.id.replace(/^retro\//, "");
  const gen = path.dirname(relative); // "gen-1", "gen-5" …、フォルムは "forms/alola"
  // forms/ で始まるエントリはレンジ判定対象外（base Pokémon の gen をまたぐため）
  if (gen.startsWith("forms/")) continue;
  const dex = dexFromName(path.basename(relative));
  if (dex === null) continue;
  const range = GEN_RANGES[gen];
  if (!range) {
    fail(`${entry.id}: unknown generation folder "${gen}"`);
  } else if (dex < range[0] || dex > range[1]) {
    fail(`${entry.id}: dex ${dex} is outside the expected range for ${gen} (${range[0]}–${range[1]})`);
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(`[verify-assets-consistency] ${error}`);
  process.exit(1);
}

const formCount = entries.length - normalEntries.length;
console.log(
  `[verify-assets-consistency] ok: ${normalEntries.length} normal entries (dex ${minDex}-${maxDex}), ${formCount} form entries, pack/UI/name/raw references consistent`,
);

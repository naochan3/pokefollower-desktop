const fs = require("node:fs");
const path = require("node:path");
const { buildPackCandidates, dexFromSlug, packSlug } = require("./asset-path.js");

// ROOT = プロジェクトルート（assets/ の親）
function makePackReader(root, fileSystem = fs) {
  const jsonCache = new Map();

  function readJson(file) {
    if (!jsonCache.has(file)) {
      jsonCache.set(file, JSON.parse(fileSystem.readFileSync(file, "utf8")));
    }
    return jsonCache.get(file);
  }

  function readPackMeta(packKey) {
    const candidates = buildPackCandidates(packKey);
    for (const cand of candidates) {
      const file = path.join(root, "assets", "packs", `${cand}.json`);
      try {
        const meta = readJson(file);
        if (meta && meta.states && meta.states.idle && meta.states.walk) {
          return { resolvedKey: cand, meta };
        }
      } catch (_) { /* 次の候補へ */ }
    }
    throw new Error(`pack not found for key: ${packKey}`);
  }
  function readIndex() {
    const file = path.join(root, "assets", "packs", "index.json");
    return readJson(file);
  }
  function readJpNames() {
    const file = path.join(root, "assets", "packs", "jp-names.json");
    return readJson(file);
  }
  function readPackList() {
    const index = readIndex();
    const jp = readJpNames();
    const list = (index.retro || []).map((item) => {
      const slug = packSlug(item.id);          // "009-blastoise"
      const num = dexFromSlug(slug);            // 9
      const jpEntry = (num != null && jp[String(num)]) ? jp[String(num)] : {};
      const en = String(item.name || "").replace(/^\s*\d+\s*-\s*/, ""); // "009-Blastoise" -> "Blastoise"
      return {
        id: item.id,
        num: num,
        region: item.region || null,
        ja: item.ja || jpEntry.ja || null,
        romaji: jpEntry.romaji || null,
        en: en || slug,
      };
    });
    list.sort((a, b) => (a.num ?? 9999) - (b.num ?? 9999));
    return list;
  }
  return { readPackMeta, readIndex, readJpNames, readPackList };
}

module.exports = { makePackReader };

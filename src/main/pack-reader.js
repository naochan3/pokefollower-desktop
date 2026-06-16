const fs = require("node:fs");
const path = require("node:path");
const { buildPackCandidates } = require("./asset-path.js");

// ROOT = プロジェクトルート（assets/ の親）
function makePackReader(root) {
  function readPackMeta(packKey) {
    const candidates = buildPackCandidates(packKey);
    for (const cand of candidates) {
      const file = path.join(root, "assets", "packs", `${cand}.json`);
      try {
        const meta = JSON.parse(fs.readFileSync(file, "utf8"));
        if (meta && meta.states && meta.states.idle && meta.states.walk) {
          return { resolvedKey: cand, meta };
        }
      } catch (_) { /* 次の候補へ */ }
    }
    throw new Error(`pack not found for key: ${packKey}`);
  }
  function readIndex() {
    const file = path.join(root, "assets", "packs", "index.json");
    return JSON.parse(fs.readFileSync(file, "utf8"));
  }
  return { readPackMeta, readIndex };
}

module.exports = { makePackReader };

const DEFAULT_PACK = "retro/gen-1/009-blastoise";
const GENERATION_DIRS = ["gen-1","gen-2","gen-3","gen-4","gen-5","gen-6","gen-7","gen-8","gen-9"];
const PACK_KEY_PATTERN = /^retro\/(?:gen-[1-9]\/|forms\/[a-z]+\/)?[0-9]{3,4}-[a-z0-9-]+$/;

function packSlug(packKey) {
  const parts = String(packKey || "").split("/");
  return parts[parts.length - 1];
}

function dexFromSlug(slug) {
  const dex = parseInt((slug || "").split("-")[0], 10);
  return Number.isFinite(dex) ? dex : null;
}

function generationForDex(dex) {
  if (!Number.isFinite(dex) || dex < 1) return null;
  if (dex >= 1 && dex <= 151) return "gen-1";
  if (dex <= 251) return "gen-2";
  if (dex <= 386) return "gen-3";
  if (dex <= 493) return "gen-4";
  if (dex <= 649) return "gen-5";
  if (dex <= 721) return "gen-6";
  if (dex <= 809) return "gen-7";
  if (dex <= 905) return "gen-8";
  return "gen-9";
}

function isSafePackKey(packKey) {
  return PACK_KEY_PATTERN.test(String(packKey || "").trim().replace(/^\/+|\/+$/g, ""));
}

function buildPackCandidates(packKey) {
  const clean = typeof packKey === "string" ? packKey.trim().replace(/^\/+|\/+$/g, "") : "";
  if (!clean) return [DEFAULT_PACK];
  if (!isSafePackKey(clean)) return [];
  // フォルムは完全修飾。gen 推定を行わずそのまま返す。
  if (clean.startsWith("retro/forms/")) return [clean];
  const candidates = [clean];
  if (!clean.includes("/gen-")) {
    const parts = clean.split("/");
    const slug = parts.pop();
    const prefix = parts.join("/");
    const dex = dexFromSlug(slug);
    const inferred = generationForDex(dex);
    const pushCandidate = (gen) => {
      const candidate = `${prefix}/${gen}/${slug}`;
      if (!candidates.includes(candidate)) candidates.push(candidate);
    };
    if (inferred) pushCandidate(inferred);
    GENERATION_DIRS.forEach(pushCandidate);
  }
  return candidates;
}

module.exports = { DEFAULT_PACK, GENERATION_DIRS, PACK_KEY_PATTERN, packSlug, dexFromSlug, generationForDex, isSafePackKey, buildPackCandidates };

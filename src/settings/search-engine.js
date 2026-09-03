(function initPokemonSearch(root) {
  function toHira(value) {
    return String(value || "").replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  }

  function normalizeText(value) {
    return toHira(String(value || "").normalize("NFKC").toLowerCase()).replace(/\s+/g, " ").trim();
  }

  function normalizeToken(value) {
    return normalizeText(value)
      .replace(/^(第)(\d+)(世代)$/, "$2")
      .replace(/(たいぷ|タイプ|ぽけもん|ポケモン|世代|地方)$/g, "")
      .replace(/^(の|な)$/g, "");
  }

  function tokenizeQuery(query) {
    const normalized = normalizeText(query).replace(/[、,]/g, " ");
    return normalized.split(/\s+/).map(normalizeToken).filter(Boolean);
  }

  function addAlias(aliasMap, rawAlias, facet, value) {
    const alias = normalizeToken(rawAlias);
    if (!alias) return;
    if (!aliasMap.has(alias)) aliasMap.set(alias, []);
    aliasMap.get(alias).push({ facet, value: String(value) });
  }

  function buildAliasMap(metadata = {}) {
    const aliasMap = new Map();
    for (const [facet, values] of Object.entries(metadata.facets || {})) {
      for (const [value, def] of Object.entries(values || {})) {
        addAlias(aliasMap, value, facet, value);
        addAlias(aliasMap, def && def.ja, facet, value);
        addAlias(aliasMap, def && def.short, facet, value);
        addAlias(aliasMap, def && def.label, facet, value);
        for (const alias of def && Array.isArray(def.aliases) ? def.aliases : []) addAlias(aliasMap, alias, facet, value);
      }
    }
    for (let gen = 1; gen <= 9; gen++) {
      addAlias(aliasMap, String(gen), "generations", String(gen));
      addAlias(aliasMap, `第${gen}世代`, "generations", String(gen));
    }
    return aliasMap;
  }

  function parsePokemonSearchQuery(query, metadata = {}, aliasMap = null) {
    const facets = [];
    const facetGroups = [];
    const nameTerms = [];
    aliasMap = aliasMap || buildAliasMap(metadata);
    const tokens = tokenizeQuery(query);
    for (const token of tokens) {
      const matches = aliasMap.get(token);
      if (matches && matches.length) {
        // 1トークンが複数 facet に当たる場合は「どちらの意味でもよい」= OR。
        // 例: 「アローラ」は generations:7 と regions:alola の両方に当たるので、
        // AND にすると（地方フォルムの dex 世代は 7 ではないため）ほぼ0件になる。
        // トークンどうしは AND のまま（「みず ひこう」= みず AND ひこう）。
        facetGroups.push(matches);
        facets.push(...matches);
      } else {
        nameTerms.push(token);
      }
    }
    return { raw: String(query || ""), tokens, facets, facetGroups, nameTerms };
  }

  // 18タイプの英語→日本語マップ（type-colors.mjs の TYPE_COLORS.ja と同値）
  // search-engine.js は classic <script> 読み込みのため ESM import 不可なのでここにインライン化
  const TYPE_EN_TO_JA = {
    normal: "ノーマル", fire: "ほのお", water: "みず", electric: "でんき",
    grass: "くさ", ice: "こおり", fighting: "かくとう", poison: "どく",
    ground: "じめん", flying: "ひこう", psychic: "エスパー", bug: "むし",
    rock: "いわ", ghost: "ゴースト", dragon: "ドラゴン", dark: "あく",
    steel: "はがね", fairy: "フェアリー",
  };

  function packSearchText(pack) {
    const num = pack.num == null ? "" : String(pack.num);
    const padded = num ? num.padStart(3, "0") : "";
    const packTypes = Array.isArray(pack.types) ? pack.types : [];
    const typeJaNames = packTypes.map((t) => TYPE_EN_TO_JA[String(t).toLowerCase()] || "").filter(Boolean);
    return normalizeText([pack.ja, pack.romaji, pack.en, num, padded, `#${padded}`, ...packTypes, ...typeJaNames].filter(Boolean).join(" "));
  }

  function normalizeMetadataEntry(entry) {
    if (!entry) return { types: [], traits: [], generation: null, region: null, debutGames: [], mediaTags: [], seriesLabels: [], categoryJa: "" };
    return {
      types: Array.isArray(entry.types) ? entry.types.map(String) : [],
      traits: Array.isArray(entry.traits) ? entry.traits.map(String) : [],
      generation: entry.generation == null ? null : String(entry.generation),
      region: entry.region == null ? null : String(entry.region),
      debutGames: Array.isArray(entry.debutGames) ? entry.debutGames.map(String) : [],
      mediaTags: Array.isArray(entry.mediaTags) ? entry.mediaTags.map(String) : [],
      seriesLabels: Array.isArray(entry.seriesLabels) ? entry.seriesLabels.map(String) : [],
      categoryJa: typeof entry.categoryJa === "string" ? entry.categoryJa : "",
    };
  }

  function buildPokemonSearchIndex(packs, metadata = {}, options = {}) {
    const metadataEntries = metadata.entries || {};
    const aliasMap = buildAliasMap(metadata);
    // 世代は pack.num から導出できるが、境界表は settings/gen-util.js 側にあり
    // このファイルは classic <script> で ESM import できない。呼び出し元から渡す。
    const genOfDex = typeof options.genOfDex === "function" ? options.genOfDex : null;
    const index = (Array.isArray(packs) ? packs : []).map((pack) => {
      const searchMetadata = normalizeMetadataEntry(metadataEntries[pack.id]);
      const metadataText = normalizeText([
        searchMetadata.categoryJa,
        ...searchMetadata.seriesLabels,
        ...searchMetadata.types,
        ...searchMetadata.traits,
        searchMetadata.region,
        searchMetadata.generation,
        ...searchMetadata.debutGames,
        ...searchMetadata.mediaTags,
      ].filter(Boolean).join(" "));
      const derivedGeneration = genOfDex && pack.num != null ? String(genOfDex(pack.num)) : null;
      return {
        id: pack.id,
        pack,
        text: `${packSearchText(pack)} ${metadataText}`.trim(),
        metadata: searchMetadata,
        derivedGeneration,
        hasMetadata: Boolean(metadataEntries[pack.id]),
      };
    });
    Object.defineProperty(index, "__pokemonSearchAliasMap", { value: aliasMap, enumerable: false });
    return index;
  }

  // search-metadata.json のエントリは意図的に疎（全 pack を網羅しない）。
  // types / regions / generations は pack 自身が持つ情報から導けるので、
  // メタデータに無い pack も facet 一致させる。これが無いと「みず」で検索した時に
  // メタデータ登録済みの1件しか出ず、タイプチップ（147件）と結果が食い違う。
  function facetMatches(entry, facet, value) {
    const metadata = entry.metadata;
    if (facet === "types") {
      if (metadata.types.includes(value)) return true;
      const packTypes = Array.isArray(entry.pack.types) ? entry.pack.types : [];
      const wanted = String(value).toLowerCase();
      return packTypes.some((type) => String(type).toLowerCase() === wanted);
    }
    if (facet === "regions") {
      if (metadata.region === value) return true;
      return entry.pack.region != null && String(entry.pack.region) === String(value);
    }
    if (facet === "generations") {
      if (metadata.generation === value) return true;
      return entry.derivedGeneration != null && entry.derivedGeneration === String(value);
    }
    if (facet === "traits") return metadata.traits.includes(value);
    if (facet === "debutGames") return metadata.debutGames.includes(value);
    if (facet === "mediaTags") return metadata.mediaTags.includes(value);
    return false;
  }

  function scoreEntry(entry, parsed) {
    let score = parsed.facets.length * 30 + (entry.hasMetadata ? 5 : 0);
    for (const term of parsed.nameTerms) {
      const ja = normalizeText(entry.pack.ja);
      const en = normalizeText(entry.pack.en);
      if (ja === term || en === term) score += 100;
      else if (ja.startsWith(term) || en.startsWith(term)) score += 60;
      else if (entry.text.includes(term)) score += 20;
    }
    return score;
  }

  function searchPokemon(index, query, metadata = {}) {
    const parsed = parsePokemonSearchQuery(query, metadata, index && index.__pokemonSearchAliasMap);
    if (parsed.facets.length === 0 && parsed.nameTerms.length === 0) {
      return (Array.isArray(index) ? index : []).map((entry) => ({ id: entry.id, score: 0, parsed }));
    }
    const groups = parsed.facetGroups || parsed.facets.map((facet) => [facet]);
    return (Array.isArray(index) ? index : [])
      .filter((entry) => groups.every((group) => group.some((facet) => facetMatches(entry, facet.facet, facet.value))))
      .filter((entry) => parsed.nameTerms.every((term) => entry.text.includes(term)))
      .map((entry) => ({ id: entry.id, score: scoreEntry(entry, parsed), parsed }))
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  }

  const api = { buildPokemonSearchIndex, normalizeText, parsePokemonSearchQuery, searchPokemon, tokenizeQuery };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PokeFollowerSearch = api;
})(typeof window !== "undefined" ? window : globalThis);

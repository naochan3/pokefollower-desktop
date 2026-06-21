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
    const nameTerms = [];
    aliasMap = aliasMap || buildAliasMap(metadata);
    const tokens = tokenizeQuery(query);
    for (const token of tokens) {
      const matches = aliasMap.get(token);
      if (matches && matches.length) {
        facets.push(...matches);
      } else {
        nameTerms.push(token);
      }
    }
    return { raw: String(query || ""), tokens, facets, nameTerms };
  }

  function packSearchText(pack) {
    const num = pack.num == null ? "" : String(pack.num);
    const padded = num ? num.padStart(3, "0") : "";
    return normalizeText([pack.ja, pack.romaji, pack.en, num, padded, `#${padded}`].filter(Boolean).join(" "));
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

  function buildPokemonSearchIndex(packs, metadata = {}) {
    const metadataEntries = metadata.entries || {};
    const aliasMap = buildAliasMap(metadata);
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
      return { id: pack.id, pack, text: `${packSearchText(pack)} ${metadataText}`.trim(), metadata: searchMetadata, hasMetadata: Boolean(metadataEntries[pack.id]) };
    });
    Object.defineProperty(index, "__pokemonSearchAliasMap", { value: aliasMap, enumerable: false });
    return index;
  }

  function facetMatches(entry, facet, value) {
    const metadata = entry.metadata;
    if (facet === "types") return metadata.types.includes(value);
    if (facet === "traits") return metadata.traits.includes(value);
    if (facet === "generations") return metadata.generation === value;
    if (facet === "regions") return metadata.region === value;
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
    return (Array.isArray(index) ? index : [])
      .filter((entry) => parsed.facets.every((facet) => facetMatches(entry, facet.facet, facet.value)))
      .filter((entry) => parsed.nameTerms.every((term) => entry.text.includes(term)))
      .map((entry) => ({ id: entry.id, score: scoreEntry(entry, parsed), parsed }))
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  }

  const api = { buildPokemonSearchIndex, normalizeText, parsePokemonSearchQuery, searchPokemon, tokenizeQuery };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PokeFollowerSearch = api;
})(typeof window !== "undefined" ? window : globalThis);

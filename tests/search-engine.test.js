import { describe, expect, it } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPokemonSearchIndex, parsePokemonSearchQuery, searchPokemon, tokenizeQuery } from "../src/settings/search-engine.js";
import { makePackReader } from "../src/main/pack-reader.js";

const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const metadata = {
  facets: {
    types: {
      electric: { ja: "でんき", aliases: ["でんき", "電気"] },
      fire: { ja: "ほのお", aliases: ["ほのお", "炎"] },
      flying: { ja: "ひこう", aliases: ["ひこう", "飛行"] },
      water: { ja: "みず", aliases: ["みず", "水"] },
    },
    traits: {
      legendary: { ja: "伝説", aliases: ["伝説"] },
      mouse: { ja: "ねずみ", aliases: ["ねずみ"] },
      starter: { ja: "御三家", aliases: ["御三家"] },
    },
    generations: {
      1: { label: "第1世代", aliases: ["初代", "赤緑", "カントー"] },
    },
    regions: {
      kanto: { ja: "カントー", aliases: ["カントー"] },
    },
    debutGames: {
      "red-green": { ja: "赤・緑", aliases: ["赤緑"] },
      yellow: { ja: "ピカチュウ", aliases: ["ピカチュウ版"] },
    },
    mediaTags: {
      "movie-featured": { ja: "映画主要", aliases: ["映画"] },
    },
  },
  entries: {
    "retro/gen-1/004-charmander": {
      types: ["fire"],
      traits: ["starter"],
      categoryJa: "とかげポケモン",
      generation: 1,
      region: "kanto",
      debutGames: ["red-green"],
      seriesLabels: ["赤・緑"],
      mediaTags: [],
    },
    "retro/gen-1/025-pikachu": {
      types: ["electric"],
      traits: ["mouse"],
      categoryJa: "ねずみポケモン",
      generation: 1,
      region: "kanto",
      debutGames: ["red-green", "yellow"],
      seriesLabels: ["赤・緑", "ピカチュウ"],
      mediaTags: [],
    },
    "retro/gen-1/130-gyarados": {
      types: ["water", "flying"],
      traits: [],
      categoryJa: "きょうあくポケモン",
      generation: 1,
      region: "kanto",
      debutGames: ["red-green"],
      seriesLabels: ["赤・緑"],
      mediaTags: [],
    },
    "retro/gen-1/150-mewtwo": {
      types: [],
      traits: ["legendary"],
      categoryJa: "いでんしポケモン",
      generation: 1,
      region: "kanto",
      debutGames: ["red-green"],
      seriesLabels: ["赤・緑"],
      mediaTags: ["movie-featured"],
    },
  },
};

const packs = [
  { id: "retro/gen-1/004-charmander", num: 4, ja: "ヒトカゲ", romaji: "Hitokage", en: "Charmander" },
  { id: "retro/gen-1/025-pikachu", num: 25, ja: "ピカチュウ", romaji: "Pikachu", en: "Pikachu" },
  { id: "retro/gen-1/130-gyarados", num: 130, ja: "ギャラドス", romaji: "Gyarados", en: "Gyarados" },
  { id: "retro/gen-1/150-mewtwo", num: 150, ja: "ミュウツー", romaji: "Mewtwo", en: "Mewtwo" },
  { id: "retro/gen-2/152-chikorita", num: 152, ja: "チコリータ", romaji: "Chicorita", en: "Chikorita" },
];

// メタデータなし（search-metadata.json 未登録）の pack を使い、
// pack.types だけで全 1010 匹のタイプ検索が効くことを確認するための追加データ
const packsWithTypes = [
  { id: "no-meta/001-bulbasaur", num: 1, ja: "フシギダネ", romaji: "Fushigidane", en: "Bulbasaur", types: ["grass", "poison"] },
  { id: "no-meta/007-squirtle", num: 7, ja: "ゼニガメ", romaji: "Zenigame", en: "Squirtle", types: ["water"] },
  { id: "no-meta/006-charizard", num: 6, ja: "リザードン", romaji: "Lizardon", en: "Charizard", types: ["fire", "flying"] },
];

describe("pokemon search engine", () => {
  const index = buildPokemonSearchIndex(packs, metadata);

  it("日本語 query を正規化して token 化する", () => {
    expect(tokenizeQuery("水タイプ かわいい 第3世代")).toEqual(["水", "かわいい", "3"]);
  });

  it("タイプ・世代・初出ゲーム alias を facet として解釈する", () => {
    const parsed = parsePokemonSearchQuery("赤緑 でんき", metadata);
    expect(parsed.facets).toEqual(expect.arrayContaining([
      { facet: "debutGames", value: "red-green" },
      { facet: "types", value: "electric" },
    ]));
  });

  it("複数タイプを AND 条件で検索する", () => {
    expect(searchPokemon(index, "みず ひこう", metadata).map((result) => result.id)).toEqual(["retro/gen-1/130-gyarados"]);
  });

  it("名前検索を metadata 欠損 pack にも残す", () => {
    expect(searchPokemon(index, "チコリータ", metadata).map((result) => result.id)).toEqual(["retro/gen-2/152-chikorita"]);
  });

  it("特徴タグと名前語を組み合わせて絞り込む", () => {
    expect(searchPokemon(index, "伝説 ミュウ", metadata).map((result) => result.id)).toEqual(["retro/gen-1/150-mewtwo"]);
  });

  it("初出ゲーム OR 風の alias も metadata 上の複数値で自然に絞り込める", () => {
    expect(searchPokemon(index, "赤緑 ピカチュウ版", metadata).map((result) => result.id)).toEqual(["retro/gen-1/025-pikachu"]);
  });
});

describe("pack.types による全 Pokémon タイプ自由文検索", () => {
  // メタデータなし（search-metadata.json 未登録）の pack でも
  // pack.types から英語・日本語どちらでもタイプ検索できることを確認する
  const typeIndex = buildPokemonSearchIndex(packsWithTypes, {});

  it("英語タイプ名 'water' でみず単タイプ pack を返す", () => {
    const ids = searchPokemon(typeIndex, "water", {}).map((r) => r.id);
    expect(ids).toContain("no-meta/007-squirtle");
    expect(ids).not.toContain("no-meta/006-charizard");
  });

  it("日本語タイプ名 'みず' でみず単タイプ pack を返す", () => {
    const ids = searchPokemon(typeIndex, "みず", {}).map((r) => r.id);
    expect(ids).toContain("no-meta/007-squirtle");
    expect(ids).not.toContain("no-meta/006-charizard");
  });

  it("英語タイプ名 'fire' でほのお複合タイプ pack も返す", () => {
    const ids = searchPokemon(typeIndex, "fire", {}).map((r) => r.id);
    expect(ids).toContain("no-meta/006-charizard");
    expect(ids).not.toContain("no-meta/007-squirtle");
  });

  it("日本語タイプ名 'ほのお' でほのお複合タイプ pack も返す", () => {
    const ids = searchPokemon(typeIndex, "ほのお", {}).map((r) => r.id);
    expect(ids).toContain("no-meta/006-charizard");
    expect(ids).not.toContain("no-meta/007-squirtle");
  });

  it("関係ないタイプ名 'でんき' は何も返さない", () => {
    const ids = searchPokemon(typeIndex, "でんき", {}).map((r) => r.id);
    expect(ids).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────
// 本番のメタデータ（assets/packs/search-metadata.json）を使った回帰。
// 上の "pack.types による..." ブロックは metadata={} で検証しているため
// alias が facet に解決されない経路だけを通っていた。本番メタデータでは
// 「みず」が types facet になり、facet 一致がメタデータ登録済み pack だけに
// 絞られて 147件→1件になる不整合があった（タイプチップとの食い違い）。
// ─────────────────────────────────────────────────────────────────
describe("本番メタデータでの facet 検索と pack 情報の整合", () => {
  const packReader = makePackReader(repoRoot);
  const realPacks = packReader.readPackList();
  const realMetadata = packReader.readSearchMetadata();
  const GEN_BOUNDS = [151, 251, 386, 493, 649, 721, 809, 905, 1025];
  const genOfDex = (dex) => {
    for (let i = 0; i < GEN_BOUNDS.length; i += 1) if (dex <= GEN_BOUNDS[i]) return i + 1;
    return GEN_BOUNDS.length;
  };
  const realIndex = buildPokemonSearchIndex(realPacks, realMetadata, { genOfDex });
  const byId = new Map(realPacks.map((pack) => [pack.id, pack]));
  const search = (query) => searchPokemon(realIndex, query, realMetadata).map((result) => result.id);
  const normalOnly = (ids) => ids.filter((id) => !byId.get(id).region);

  it.each([
    ["みず", "water"],
    ["ほのお", "fire"],
    ["でんき", "electric"],
    ["ドラゴン", "dragon"],
  ])("タイプ名 '%s' の検索結果が pack.types による絞り込みと完全一致する", (query, type) => {
    const expected = realPacks.filter((pack) => !pack.region && (pack.types || []).includes(type)).map((pack) => pack.id);
    expect(normalOnly(search(query)).slice().sort()).toEqual(expected.slice().sort());
    expect(expected.length).toBeGreaterThan(10);
  });

  it("世代名の検索結果が dex 由来の世代と一致する", () => {
    const expected = realPacks.filter((pack) => !pack.region && genOfDex(pack.num) === 2).map((pack) => pack.id);
    expect(normalOnly(search("第2世代")).slice().sort()).toEqual(expected.slice().sort());
  });

  it("地方名の検索結果が該当地方フォルムを全件含む", () => {
    // 「アローラ」は generations:7 にも regions:alola にも当たる曖昧語。
    // 1トークンの複数 facet は OR なので結果は和集合になるが、
    // 地方フォルムが1件も落ちないことを保証する。
    const alolaForms = realPacks.filter((pack) => pack.region === "alola").map((pack) => pack.id);
    const hits = search("アローラ");
    expect(alolaForms.length).toBeGreaterThan(10);
    for (const id of alolaForms) expect(hits).toContain(id);
  });

  it("複数トークンは AND のまま（みず ひこう は両タイプ持ちだけ）", () => {
    const ids = normalOnly(search("みず ひこう"));
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      const types = byId.get(id).types || [];
      expect(types).toContain("water");
      expect(types).toContain("flying");
    }
  });

  it("メタデータ未登録の pack もタイプ名で引ける", () => {
    const unregistered = realPacks.find(
      (pack) => !pack.region && (pack.types || []).includes("water") && !(realMetadata.entries || {})[pack.id],
    );
    expect(unregistered).toBeTruthy();
    expect(search("みず")).toContain(unregistered.id);
  });
});

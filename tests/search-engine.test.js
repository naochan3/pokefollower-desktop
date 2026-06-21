import { describe, expect, it } from "vitest";
import { buildPokemonSearchIndex, parsePokemonSearchQuery, searchPokemon, tokenizeQuery } from "../src/settings/search-engine.js";

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

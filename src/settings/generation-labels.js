(function initGenerationLabels(root) {
  const GENERATION_LABELS = [
    {
      gen: 1,
      short: "赤緑",
      title: "第1世代: 赤・緑 / 青 / ピカチュウ（カントー）",
      aliases: ["1", "初代", "赤緑", "赤・緑", "青", "ピカチュウ版", "カントー"],
    },
    {
      gen: 2,
      short: "金銀",
      title: "第2世代: 金・銀 / クリスタル（ジョウト）",
      aliases: ["2", "金銀", "金・銀", "クリスタル", "ジョウト"],
    },
    {
      gen: 3,
      short: "RS",
      title: "第3世代: ルビー・サファイア / エメラルド（ホウエン）",
      aliases: ["3", "ルビサファ", "ルビー", "サファイア", "エメラルド", "ホウエン", "RS"],
    },
    {
      gen: 4,
      short: "DP",
      title: "第4世代: ダイヤモンド・パール / プラチナ（シンオウ）",
      aliases: ["4", "ダイパ", "ダイヤモンド", "パール", "プラチナ", "シンオウ", "DP"],
    },
    {
      gen: 5,
      short: "BW",
      title: "第5世代: ブラック・ホワイト / B2W2（イッシュ）",
      aliases: ["5", "BW", "ブラック", "ホワイト", "B2W2", "イッシュ"],
    },
    {
      gen: 6,
      short: "XY",
      title: "第6世代: X・Y（カロス）",
      aliases: ["6", "XY", "X", "Y", "カロス"],
    },
    {
      gen: 7,
      short: "SM",
      title: "第7世代: サン・ムーン / USUM（アローラ）",
      aliases: ["7", "SM", "サン", "ムーン", "USUM", "アローラ"],
    },
    {
      gen: 8,
      short: "剣盾",
      title: "第8世代: ソード・シールド / Legends アルセウス（ガラル/ヒスイ）",
      aliases: ["8", "剣盾", "ソード", "シールド", "アルセウス", "ガラル", "ヒスイ"],
    },
    {
      gen: 9,
      short: "SV",
      title: "第9世代: スカーレット・バイオレット（パルデア）",
      aliases: ["9", "SV", "スカーレット", "バイオレット", "パルデア"],
    },
  ];

  function generationLabelFor(gen) {
    return GENERATION_LABELS.find((item) => item.gen === Number(gen)) || null;
  }

  const api = { GENERATION_LABELS, generationLabelFor };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PokeFollowerGenerationLabels = api;
})(typeof window !== "undefined" ? window : globalThis);

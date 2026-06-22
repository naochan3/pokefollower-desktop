// ポケモンの18タイプ → 日本語名と代表色（標準パレット）
export const TYPE_COLORS = {
  normal:   { ja: "ノーマル", color: "#A8A878" },
  fire:     { ja: "ほのお",   color: "#F08030" },
  water:    { ja: "みず",     color: "#6890F0" },
  electric: { ja: "でんき",   color: "#F8D030" },
  grass:    { ja: "くさ",     color: "#78C850" },
  ice:      { ja: "こおり",   color: "#98D8D8" },
  fighting: { ja: "かくとう", color: "#C03028" },
  poison:   { ja: "どく",     color: "#A040A0" },
  ground:   { ja: "じめん",   color: "#E0C068" },
  flying:   { ja: "ひこう",   color: "#A890F0" },
  psychic:  { ja: "エスパー", color: "#F85888" },
  bug:      { ja: "むし",     color: "#A8B820" },
  rock:     { ja: "いわ",     color: "#B8A038" },
  ghost:    { ja: "ゴースト", color: "#705898" },
  dragon:   { ja: "ドラゴン", color: "#7038F8" },
  dark:     { ja: "あく",     color: "#705848" },
  steel:    { ja: "はがね",   color: "#B8B8D0" },
  fairy:    { ja: "フェアリー", color: "#EE99AC" },
};

export function typeColor(en) {
  const e = TYPE_COLORS[String(en || "").toLowerCase()];
  return e ? e.color : "#888888";
}

export function typeJa(en) {
  const e = TYPE_COLORS[String(en || "").toLowerCase()];
  return e ? e.ja : String(en || "");
}

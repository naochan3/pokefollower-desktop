# 検索用ポケモンメタデータ

Issue #77 のための検索用 metadata 方針です。

## 置き場所

- データ: `assets/packs/search-metadata.json`
- 検証: `npm run verify:search-metadata`

## 方針

- `assets/packs/index.json` の `id` を primary key にします。
- metadata は加算式です。metadata がない pack も、名前・日本語名・ローマ字・英名・図鑑番号検索から落としません。
- 最初は deterministic に管理できる type / trait / generation / region / debut game を優先します。
- `mediaTags` は schema だけ先に用意し、映画・アニメの実データ範囲は別途整理してから増やします。

## 初期カバレッジ

初期データは、検索 parser 実装前に schema と verifier を固定するための小さな curated set です。

- 第1世代の御三家、ピカチュウ、イーブイ、伝説・幻の代表
- アローラ / ガラル / ヒスイ / パルデアの地方フォルム代表

## 未収録範囲

- 956 通常 pack + 54 地方フォルムすべてへの metadata 付与は未完了です。
- 欠損 pack は `coveragePolicy.missingEntry` のとおり、名前検索のみで残します。
- 映画・アニメタグは、出典・網羅範囲・主要登場の定義を決めるまで限定的に扱います。

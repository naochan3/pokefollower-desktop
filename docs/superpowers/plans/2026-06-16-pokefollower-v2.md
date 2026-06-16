# PokéFollower Desktop v2 Implementation Plan

> 実行: superpowers:subagent-driven-development。branch `feat/v1-implementation` 上に積む。

**Goal:** 配布体験と使い勝手を上げる：初回から自動起動＋表示、ポケモン名の日本語化＋日本語検索、見た目＋名前のタイル選択、そして寄贈者表記の整理。

**決定事項（ユーザー確認済み 2026-06-16）:**
- Mac対応: しない（Windows専用のまま）
- 初回挙動: 自動起動ON＋初期表示ON
- Git履歴: 全コミット著者を `naochaaaaaaaaaaan@gmail.com` に統一してforce-push（na0-gh を寄贈者から除去）

**データ前提（確認済み）:** PokéAPI `pokemon-species/{id}` が `ja`(カタカナ) と `ja-roma`(ローマ字) を返す。到達可能。

---

## Task A: 初回挙動（自動起動＋初期表示ON）
**Files:** `src/main/settings-store.js`, `src/main/main.js`
- `DEFAULTS.enabled` を `false`→`true` に。テスト `settings-store.test.js` の「デフォルト」期待値も追従修正。
- main: 起動時 `app.setLoginItemSettings({ openAtLogin: true })`。トレイに「自動起動」チェックボックスを追加し、`getLoginItemSettings().openAtLogin` を反映、クリックで `setLoginItemSettings` を切替。
- 検証: `npm test` green、`node --check`、boot-smoke（自動起動設定の副作用でクラッシュしない）。

## Task B: 日本語名データ生成
**Files:** `scripts/fetch-jp-names.cjs`(新規), `assets/packs/jp-names.json`(生成・コミット)
- スクリプト: dex 1–493 を PokéAPI から取得（同時実行数を絞る＋失敗リトライ）。`{ "1": {"ja":"フシギダネ","romaji":"Bulbasaur"}, ... }` を出力。
- `ja` が無い種は英名フォールバック。生成後に件数（493）と先頭/末尾を検証。
- スクリプトとJSON両方コミット。

## Task C: タイル選択UI＋日本語表示・検索
**Files:** `src/main/main.js`(packs:list 拡張), `src/settings/settings.html`, `src/settings/settings.js`
- main: `packs:list` を拡張し、index と jp-names をマージした配列 `[{id, num, ja, romaji, en}]` を返す（`pack-reader` に `readJpNames()` 追加）。
- settings.html: ドロップダウン主体のUIに、**スクロール可能なタイルグリッド**を追加（各タイル = `app://bundle/assets/ui/<gen>/<slug>.png` のスプライト + 日本語名 + #番号、`loading="lazy"`）。検索ボックスは1つ。
- settings.js: タイルを `packs:list` の結果から生成。クリックで選択（`setSettings({pack})`＋選択ハイライト）。検索は **カタカナ/ひらがな/ローマ字/英名/番号** にヒット（ひらがな⇄カタカナ正規化）。プレビュー大画像の名前も日本語に。
- 検証: `node --check`、boot-smoke（設定窓が開きタイル生成＋画像読込でエラーなし）。

## Task D: インストーラ再生成
- `npm run dist` で `release/PokeFollower Setup 1.0.0.exe` を再生成。成果物はコミットしない。

## 仕上げ（コントローラ実施）
- 全テスト green 確認 → feature ブランチを `main` にマージ。
- 全履歴の著者/コミッタ email を `naochaaaaaaaaaaan@gmail.com` に書換（`git filter-branch --env-filter`）→ `main` を force-push、feature ブランチ削除。

# 地方フォルム（アローラ等）対応 設計仕様

**作成日**: 2026-06-22
**対象**: `pokefollower-desktop`
**ステータス**: 承認済み（ユーザー 2026-06-22）→ 実装フェーズへ

## ゴール

原種と図鑑番号を共有する**地方フォルム**（アローラ / ガラル / ヒスイ / パルデア）を選択肢に追加する。設定ピッカーに「種類」軸を足し、世代チップを1行のまま「意味だけ切替」で地方フォルムを絞り込めるようにする。あわせて散歩モードの伏線として、フォルムのアセットは**全アニメを取得・保持**し、パック形式をアニメ拡張可能にする（消費＝散歩アクションは今回実装しない＝準備まで）。

## アーキテクチャ概要

地方フォルムは「id文字列で選ぶ別パック」として既存の追従基盤にそのまま乗る。追従の状態機械（`src/main/follower-sim.js` / `crates/follower_core`）は**一切変更しない**（スプライト非依存）。変更は (1) アセット生成パイプライン、(2) index/pack-reader のデータモデル、(3) 設定UIのフィルタ、(4) 検証スクリプト、の4領域に限定する。

## Global Constraints（全タスク共通の不変条件）

- **状態機械を変更しない**: `src/main/follower-sim.js`、`crates/follower_core/**`、`native/*.wasm` には触れない。触れたら設計違反。
- **Nicolas衝突回避**: 各フェーズ着手前に `git fetch origin && git merge --ff-only origin/main`。彼が触る頻度が高いファイル（`src/settings/settings.js`、`src/settings/settings.html`、`src/main/follower-sim.js`）は、作業直前に最新を取り込んでから編集する。**Nicolasの既存機能（#48/#49 等）はビルド・リリース・改変しない**（ユーザーのレビュー待ち）。
- **PRベース**: main直pushは不可。フィーチャーブランチ `feature/regional-forms` を現行main基準で切り、PRで出す。
- **パスセキュリティ**: `src/main/asset-path.js` の `PACK_KEY_PATTERN` を拡張する際、フォルム用に許可するのは `retro/forms/<region>/<dex>-<slug>` の厳密形のみ。`..` やワイルドカードを通さない。
- **既存956種は再取得しない**: 全アニメ取得は今回追加するフォルムにのみ適用。既存956種の全アニメ backfill は別フォローアップ（散歩本体の仕事）。
- **既存パターン準拠**: 命名・ファイル構成・検証は現行スクリプト（`gen-*.mjs`、`build-index.mjs`、`verify-assets-consistency.cjs`）の流儀に合わせる。

## ID とディレクトリ規約

| 種別 | ID | パックJSON | rawアセット | UIタイル |
|---|---|---|---|---|
| 通常種（既存） | `retro/gen-N/NNN-slug` | `assets/packs/retro/gen-N/NNN-slug.json` | `assets/raw/gen-N/NNN-slug/` | `assets/ui/gen-N/NNN-slug.png` |
| 地方フォルム（新） | `retro/forms/<region>/NNN-slug` | `assets/packs/retro/forms/<region>/NNN-slug.json` | `assets/raw/forms/<region>/NNN-slug/` | `assets/ui/forms/<region>/NNN-slug.png` |

- `<region>` ∈ `alola | galar | hisui | paldea`。
- `NNN` は原種の図鑑番号（ゼロ詰め3桁。例 `026-raichu`）。`slug` は原種の英名スラッグ。
- 例: アローラライチュウ = `retro/forms/alola/026-raichu`。

## データモデル

### index.json
- 通常種エントリは現状維持: `{ "id", "name" }`。
- フォルムエントリは追加フィールドを持つ: `{ "id", "name", "region", "ja" }`。
  - `region`: `"alola"` 等。
  - `ja`: 日本語表示名（例 `アローラライチュウ`）。図鑑番号が原種と衝突し `jp-names.json`（dexキー）では引けないため、エントリに直接持たせる。
- 通常種に `region` は付けない（無い＝通常）。

### pack-reader.js（`readPackList`）
- 返却オブジェクトに `region`（`item.region || null`）を追加。
- `ja` の決定: `item.ja`（フォルム用）があればそれを優先、無ければ従来どおり `jp-names[dex].ja`。
- `num` は従来どおり slug から導出（フォルムも原種dex）。

### パックJSON（アニメ拡張対応）
- 現状: `states: { idle, walk, sleep }`。各 state = `{ sheet, frame:{w,h}, fps, frames, rows:{8方向} }`。
- 変更: `parse-anim.mjs` を「AnimData.xml に存在する**全アニメ**を `states` に列挙」する方式へ拡張。キーはアニメ名の小文字（`idle`/`walk`/`sleep`/`attack`/`hurt`/`rotate`/…）。
- 状態機械は `states.idle/walk/sleep` のみ参照。追加 state は不活性データ（散歩実装時に消費）。
- 検証は引き続き `idle/walk/sleep` の3種必須をチェック（追加stateは任意）。
- **後方互換**: 既存956種のパックJSONは再生成しない。3種だけ持つ既存形式のままで `readPackMeta`（`states.idle && states.walk` を要求）と整合する。

## アセット生成パイプライン

### 1. フォルム収録判定: `scripts/forms-manifest.mjs`（新規）
- `tracker.json` を取得し、全dexの `subgroups` を走査。
- 地方名（`Alola`/`Galar`/`Hisui`/`Paldea`、プレフィックス一致）かつ `sprite_complete >= 1` の subgroup を候補とする。
- `gh api repos/PMDCollab/SpriteCollab/contents/sprite/<d4>/<subindex>` で **Idle-Anim.png / Walk-Anim.png / Sleep-Anim.png / AnimData.xml が揃う**ものだけ収録可とする（通常種より厳格＝3アニメ完備を要求。理由: 検証が sleep を必須にするため）。
- 出力 `assets/packs/forms-manifest.json`: `{ includable:[{dex, region, subindex, baseSlug, slug}], missing:[{dex, region, name}] }`。
  - `region` は地方名を小文字スラッグ化（`Alola`→`alola`）。`Galar_Zen` 等の派生は地方プレフィックスで `galar` に丸める。
  - `slug` = `<NNN>-<baseSlug>`（例 `026-raichu`）。`baseSlug` は原種英名スラッグ。

### 2. フォルム取得・変換: `scripts/gen-build.mjs` を `--forms` モードで拡張
- 取得元を `sprite/<d4>/<subindex>/` に切替（`gen-fetch.mjs` にフォルム取得関数を追加）。
- **全アニメ取得**: そのフォルムフォルダに存在する `*-Anim.png` を全部DL（Idle/Walk/Sleep/Attack/Hurt/…）。`AnimData.xml` も取得。
- PNG→webp 変換は既存 `toWebp` を流用し、取得した全シートを変換。
- `parse-anim.mjs` を全アニメ列挙モードで呼び、パックJSONを `assets/packs/retro/forms/<region>/<slug>.json` に出力（`generation: "forms/<region>"`, `rawPath: "forms/<region>/<slug>"`）。
- UIタイル: pokemondb のフォルムスプライト（`black-white/normal/<base>-<region>.png` 例 `raichu-alola`）を試行。404 ならPMD Idle正面からフォールバック生成（既存方式）。出力先 `assets/ui/forms/<region>/<slug>.png`。

### 3. index 再生成: `scripts/build-index.mjs` を拡張
- `assets/packs/retro/` 直下の `gen-N/` に加え、`forms/<region>/` を再帰的に走査。
- フォルムエントリは `{ id:"retro/forms/<region>/<slug>", name, region, ja }` で追記。
  - `ja` 合成: `<地方JA><原種JA>`（地方JA = アローラ/ガラル/ヒスイ/パルデア、原種JA = `jp-names[dex].ja`）。例 `アローラ`+`ライチュウ`=`アローラライチュウ`。
  - `name`（英・表示用）: `<NNN>-<Base>-<Region>`（例 `026-Raichu-Alola`）。
- 通常種エントリの出力は現状維持（`region`/`ja` を付けない）。

## 設定UI

### settings.html
- 検索の隣に **種類セレクタ**を追加: `<select id="kind">`（`通常` / `地方フォルム`）。Nicolas の `#personality` select とは独立。
- 地方チップ用のコンテナは既存 `#genChips` を流用し、種類に応じて中身を差し替える（常に1行）。

### settings.js（`initGrid` / `applyFilter`）
- タイルに `data-region`（`p.region || ""`）を付与。
- UI画像パスを一般化: ディレクトリを `p.id.split("/").slice(1, -1).join("/")` で導出（通常=`gen-1`、フォルム=`forms/alola`）。`app://bundle/assets/ui/<dir>/<slug>.png`。
- 種類状態 `selectedKind`（`'normal' | 'forms'`、既定 `'normal'`）。
- チップ行の再描画: `'normal'` → `全 1..9`（`data-gen`）、`'forms'` → `全` + 収録のある地方のみ（`data-region`）。
- `applyFilter`:
  - 種類フィルタ: `'normal'` は `data-region` 空、`'forms'` は `data-region` 非空。
  - `'normal'` 時は従来の世代チップ（`data-gen`）でAND。
  - `'forms'` 時は地方チップ（選択 `data-region`、`all` は全フォルム）でAND。
  - 検索は両モード共通でAND。
- 種類セレクタ変更で `selectedKind` 更新→チップ行再描画→選択リセット（`all`）→ `applyFilter`。

## 検証

### verify-assets-consistency.cjs（拡張）
- エントリ走査は id 重複チェックを維持。
- **dex一意性**: フォルムは原種とdexが衝突するため、`seenDex` 一意性チェックは**通常種のみ**に適用。フォルムは `region+dex` の組で一意性を見る。
- **jp-names参照**: フォルムは `entry.ja` の存在を検証（`jp-names[dex]` は参照しない）。通常種は従来どおり。
- **ディレクトリ走査**: pack/UI の実在チェックを `forms/<region>/` 再帰対応に拡張。`packIds`/`uiIds` 収集も同様。
- **GEN_RANGES整合**: フォルム（`generation` が `forms/...`）は世代レンジ判定の対象外にする。
- state検証（idle/walk/sleep 必須・8方向）は通常種・フォルム共通で維持。

### verify-settings-ui.cjs（拡張）
- 種類セレクタ `#kind` の存在チェックを追加。

### テスト（TDD）
- `forms-manifest` の地方判定・収録可否ロジック（tracker構造のフィクスチャでユニット）。
- `build-index` のフォルム再帰・`region`/`ja` 合成。
- `pack-reader.readPackList` がフォルムの `region`/`ja` を正しく返す。
- `asset-path` の `PACK_KEY_PATTERN`/`buildPackCandidates` がフォルムidを安全に許可し、不正パスを弾く。
- settings.js のフィルタロジック（純関数として切り出してテスト可能にする）。

## スコープ外（明示）

- 散歩モード本体（追加アニメの消費）= issue #51。今回は**データ準備のみ**。
- 既存956種への全アニメ backfill = フォローアップ。
- メガ / キョダイマックス / 色違い（Altcolor）= 将来。種類セレクタに項目を足すだけで拡張可能な設計にしておく。
- 地方の姿からの新進化（別図鑑番号、例 ガチグマ #901）= すでに第5〜9世代に収録済み。対象外。

## 正直な評価（リスク・未確認）

- **収録数は未確認**: 各地方の「3アニメ完備」数は SpriteCollab 依存。`forms-manifest.mjs` 実行で確定する。アローラライチュウ（0026/0001）は完備を確認済み。
- **JP名合成の例外**: `<地方><原種>` 合成は大半で公式名と一致するが、稀に例外があり得る。ズレた場合は index の `ja` を手動上書き（`build-index` は既存名を保持する設計を踏襲）。
- **pokedb フォルムタイルの欠落**: pokemondb にフォルムスプライトが無い場合は PMD Idle フォールバック（通常種と同じ挙動）。
- **派生subgroup名**: `Galar_Zen`（ガラルヒヒダルマ別状態）等は地方プレフィックスで丸めるが、同一 region+dex の重複が起きうる。重複時は最初の1件を採用し `missing` にログ（無言の切り捨て禁止）。

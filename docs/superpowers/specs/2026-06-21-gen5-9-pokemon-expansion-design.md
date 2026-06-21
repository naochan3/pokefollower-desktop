# 設計: 第5〜9世代ポケモン追加（Issue #14）

最終更新: 2026-06-21 / ステータス: 設計合意（実装前）

## 1. 目的・スコープ

現状の収録は第1〜4世代の493体（完全収録）。本作業は **第5〜9世代（全国図鑑 494〜1025）を追加**する。

- 出典は既存493体と同じ **PMD Collab / SpriteCollab**（CC BY-NC 4.0、非商用ファン制作として帰属表記済み）。
- 上流プロジェクト（`_inspect_pokefollower`）に存在するアセット生成器を**現行プロジェクトへ移植・自動化**して量産する。
- 進め方は**世代ごと**。まず第5世代から。

### 収録可否（2026-06-21 時点の調査結果）

SpriteCollab の実ファイルを全数確認した結果、**「フォルダが存在するポケモンは Idle / Walk / Sleep / AnimData が必ず全部揃っている」**。個別アニメだけ欠ける中途半端は0体。欠けは「ポケモン丸ごと素材なし」のみ。

| 世代 | 総数 | 収録可（フル） | 不可（素材なし） |
|---|---|---|---|
| 5 | 156 | 141 | 15 |
| 6 | 72 | 70 | 2 |
| 7 | 88 | 81 | 7 |
| 8 | 96 | 82 | 14 |
| 9 | 120 | 89 | 31 |
| 計 | 532 | **463** | 69 |

実装後の合計は 493 + 463 = **956 / 1025（約93%）**。収録可/不可の確定リストは `_inspect_pmd_zoroark/gen5-9_manifest.json`（`includable` 463 / `missing` 69）。

## 2. 欠け69体の扱い（合意済み）

- **アプリには載せない（omit）**。pack の無いエントリは選択時に壊れるため、グレー枠等のプレースホルダは作らない（KISS／無リスク）。
- 把握は**アプリの外**で行う:
  - **README に「未収録ポケモン（素材準備中）」セクション**を追加し、69体を世代別に記載。
  - `manifest.json` と **Issue #14** で追跡。
- SpriteCollab に素材が追加されたら、同じ取得スクリプトで再判定して足す（スナップショットは日々変わりうる）。

## 3. アーキテクチャ（生成パイプライン）

上流の `add_pokemon.py`（Python・手動DL前提）＋ `src/scripts/parse-anim.js`（Node・pack生成本体）を、現行の Node ツール環境に**移植＋自動DL化**する。Python 依存は持ち込まない。

ツールは `scripts/` 配下に新規追加。単一責務の小さい単位に分ける:

| 単位 | 責務 | 入力 → 出力 |
|---|---|---|
| `gen-fetch.mjs` | SpriteCollab/pokemondb から1体ぶんの素材取得 | dex → 一時フォルダ(AnimData.xml + Idle/Walk/Sleep PNG + tile PNG) |
| `parse-anim.mjs`（移植） | AnimData.xml + webp から pack JSON 生成 | xml + sheet名 + fps → pack JSON |
| `gen-build.mjs` | オーケストレーション（取得→webp変換→配置→pack生成→index/jp-names更新） | dex一覧（manifest） → raw/ui/packs/index/jp-names |

- **PNG→WebP 変換**: 上流は Pillow（lossless）。Node 側は `sharp` の lossless webp で代替（`verify:assets` は参照整合とフレーム寸法を見るため、バイト一致は不要）。
- **タイル画像**: pokemondb の正面ドット絵（既存493と統一、96×96）。pokemondb に無い子だけ **PMD の Idle 正面フレーム切り出しでフォールバック**。
- **pack生成の核** `parse-anim.js` は移植時に**全行読んで挙動を把握**し、fps/frames/frame{w,h}/rows/flipX の導出規則を踏襲する（fps = 各アニメの Duration 数）。

## 4. データフロー（1体あたり）

```
dex(manifest) 
  → SpriteCollab: sprite/0XXX/{AnimData.xml, Idle/Walk/Sleep-Anim.png}
  → pokemondb: tile PNG（無ければ PMD Idle 正面）
  → PNG→webp（Idle/Walk/Sleep）
  → 配置: assets/raw/gen-N/NNN-name/{AnimData.xml + 3 webp}
          assets/ui/gen-N/NNN-name.png
  → parse-anim: assets/packs/retro/gen-N/NNN-name.json
バッチ終了後:
  → index.json 再生成（build:index 相当）
  → jp-names.json 更新（fetch-jp-names を 494〜1025 に拡張＝PokeAPI）
  → README の未収録リスト更新
  → verify:assets / verify:local
```

## 5. 検証戦略（最重要）

形式ズレ＝`verify:assets` 全弾きの事故を防ぐため、**段階検証**する。

1. **生成器の忠実性検証**: 既存の確定pack（例: 025-pikachu, 003-venusaur 等数体）を移植版生成器で**再生成し、コミット済みJSONと差分0**を確認。差分が出たら移植のバグ。
2. **縦スライス（1体）**: 第5世代から1体（例: 571-zoroark）を**取得〜pack生成〜index反映**まで通し、
   - `verify:assets` が緑
   - 開発版アプリで選択・表示できる
   を確認。
3. **世代バッチ**: 1の検証が通って初めて第5世代141体をバッチ。`verify:assets`/`verify:local` 緑を確認してコミット。
4. 第6〜9世代は同じパイプラインで順次。

## 6. エラー処理・フェイルファスト

- Walk または AnimData 欠け → その個体を**スキップしてレポート**（出力に明示。サイレント除外しない）。
- pokemondb タイル取得失敗 → PMD Idle 正面フォールバック（ログに記録）。
- 取得した AnimData の寸法と webp 実寸が不整合 → エラーで停止（`verify:assets` 前に検出）。
- 1体の失敗で全バッチを止めない。ただし**失敗一覧を最後に必ず出す**。

## 7. ライセンス・帰属

- 既存方針を踏襲: `NOTICE` で PMD Collab / Pokémon DB に一括帰属（CC BY-NC、非商用）。
- 追加individualクレジット（各 `credits.txt`）は既存493が一括方式のため**現状は一括方式を維持**（個別クレジット同梱は将来の任意拡張）。

## 8. スコープ外（YAGNI）

- 欠け69体の収録（出典待ち）。
- 別フォルム・色違い・メガ/リージョンフォーム（1図鑑番号=基本フォルム1体の既存方針を維持）。
- 既存493タイルの作り直し（混在回避は新規をpokemondbで揃えることで達成）。
- グレー枠/「coming soon」UI。

## 9. 確定した設計判断

- 出典: SpriteCollab（既存と同一）。
- 生成器: 上流 `add_pokemon.py`＋`parse-anim.js` を **Node移植＋自動DL化**（Python非依存）。
- 収録: 第5〜9で **463体（全フル）**。欠け69は**載せない（A）**。
- 欠け表示: **README記載**＋manifest＋Issue #14。
- タイル: **pokemondb統一**（無い子のみPMDフォールバック）。
- 進行: 生成器忠実性検証 → 1体スライス → **世代ごとバッチ（第5世代から）**。

## 10. 受け入れ条件（第5世代ぶん）

- 第5世代の収録可141体が `assets/{raw,ui,packs}` と `index.json`/`jp-names.json` に追加されている。
- `verify:assets` / `verify:local`（既存ゲート＋テスト）が緑。
- 開発版アプリで第5世代のポケモンを検索・選択・表示できる。
- README に第5世代の未収録15体が記載されている。
- 既存493に回帰がない（再生成差分検証で担保）。

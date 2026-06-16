# PokéFollower Desktop — 設計書

- 日付: 2026-06-16
- 種別: 設計書（spec）
- 状態: ユーザー承認済み（実装計画へ）

## 1. 目的

ブラウザ拡張 `pokefollower_cursor_web_plugin`（Webページ内でカーソルを追うポケモン）を、
**OS全体のマウスカーソルを追うデスクトップマスコット**に作り変える。
Windows 向けに `.exe` で配布し、友人がインストールして常駐させて楽しめる状態をゴールとする。

## 2. 成果物・完了条件

- Windows 用インストーラ（`.exe`）を生成し、別の Windows PC でインストール→常駐→カーソル追従が動く。
- トレイ常駐し、設定窓でポケモン選択・サイズ・速度・カーソルからの距離を変更でき、設定が再起動後も保持される。
- 通常のデスクトップ作業画面でポケモンが追従し、**排他的フルスクリーンアプリ（全画面ゲーム等）の上には出ない**。

## 3. 採用方針

- **フレームワーク: Electron**（決定）。理由は既存の描画・追従ロジック（DOM + CSS スプライト）と
  スプライト資産をほぼ無改変で再利用でき、設定窓も Web UI のまま流用できるため。
- 代替案として Tauri（exe が軽い）も検討したが、Rust 学習コストと透過窓・グローバルカーソルの調整コストが上回るため不採用。

## 4. 全体構成

3 つのランタイム部品 + トレイで構成する。

| 部品 | 役割 | 実装メモ |
|---|---|---|
| メインプロセス | 司令塔。カーソル座標取得・設定保存・IPC・トレイ・窓管理 | Electron main |
| オーバーレイ窓 | ポケモンを描画・追従 | 透明・枠なし・全画面・最前面・**クリック透過**。既存 `content.js` の描画/追従を移植 |
| 設定窓 | ポケモン選択・各種調整 | 既存 `popup`（index.html / popup.js / CSS）を移植。トレイから開閉 |
| トレイアイコン | 常駐操作 | モンスターボール。メニュー: 設定 / ON・OFF / 終了 |

### ウィンドウ設定（オーバーレイ）

- `transparent: true`, `frame: false`, `resizable: false`, `skipTaskbar: true`
- `alwaysOnTop: true`（レベルは通常の floating で可。排他的フルスクリーンの上には出ない＝仕様として許容）
- `setIgnoreMouseEvents(true, { forward: true })` でクリック透過
- プライマリディスプレイの作業領域全体を覆う

## 5. 既存コード再利用マップ

`_inspect_pokefollower/src/` を基準に、再利用と差し替えを分離する。

| 既存（拡張機能） | デスクトップ版での扱い | 区分 |
|---|---|---|
| スプライト描画・8 方向・idle/walk/sleep 状態遷移（`content.js` の `applyFrame`/`tick`/`pickStateBySpeed` 等） | そのまま移植 | 無改変 |
| 追従の数式（`computeTarget`/速度平滑化/到着・減速判定/`walkSpeedFromConfig`） | そのまま移植 | 無改変 |
| スプライト資産（`assets/raw/**`, `assets/packs/**`, `index.json`） | そのまま同梱 | 無改変 |
| `chrome.storage.sync/local` による設定保存 | JSON 永続化（`electron-store` か userData 内 JSON）に置換 | 差替 |
| `chrome.runtime.getURL(rel)` | アプリ内相対パス（`extUrl` の実装だけ差替） | 差替 |
| 設定⇔本体の `chrome.runtime` メッセージ / `chrome.storage.onChanged` | Electron IPC（main 経由で設定窓→オーバーレイへ反映） | 差替 |
| `window.addEventListener('mousemove')` によるカーソル取得 | **main の `screen.getCursorScreenPoint()` ポーリング → IPC** に置換 | 差替（最重要） |

### スプライトデータ形式（参考・無改変で利用）

各パック JSON は `states.{idle,walk,sleep}` を持ち、各 state は
`sheet`（webp スプライトシート）, `frame{w,h}`, `fps`, `frames`, `rows`（8 方向→行 index）を持つ。
シートは「行 = 方向 8、列 = フレーム」のグリッド。CSS `background-position` で 1 コマ表示する方式で、
Chromium 描画のため Electron renderer でそのまま動作する。

## 6. カーソル追従の方式（最重要）

クリック透過の透明窓は `mousemove` を安定して受け取れない（マウス操作が下のアプリへ素通りするため）。
そのため入力経路を差し替える。

1. メインプロセスで `screen.getCursorScreenPoint()` を約 60fps でポーリングし、OS のカーソル座標（screen 座標）を取得。
2. オーバーレイ窓の原点（プライマリ作業領域の左上）を引いてウィンドウローカル座標へ変換。
3. IPC でオーバーレイ renderer に渡し、既存ロジックの「現在マウス位置 + 速度推定」へ流し込む
   （既存 `onMouseMove` 相当の更新を、受信座標から再現する）。
4. 速度推定・先回り・アニメ遷移などの後段ロジックは既存のまま。

確度: 高（`getCursorScreenPoint` ポーリングは一般的で安定した手法）。

## 7. 設定の永続化

- 保存項目: `enabled`, `pack`(例 `retro/gen-1/009-blastoise`), `scale`, `offset`, `speed`(内部 lerp)。
- 保存先: Electron `userData` 配下の JSON（`electron-store` 推奨）。
- 設定窓で変更 → main に IPC → 永続化 + オーバーレイへ即時反映。再起動時は起動時に読み込んで復元。

## 8. v1 スコープ（YAGNI）

- **含む**: ポケモン 1 体追従 / 設定窓（ポケモン選択・サイズ・速度・カーソル距離）/ トレイ常駐 / ON・OFF / Windows `.exe` インストーラ。
- **含まない（v2 以降）**: 複数体同時、Windows 起動時の自動起動、クリックでポケモンと戯れる等のインタラクション、macOS/Linux 対応、マルチモニター対応。

## 9. 既知の制限・リスク（正直な評価）

- **プライマリ画面のみ**: v1 はサブディスプレイでは追従しない。座標変換が複雑化するため割り切る。
- **排他的フルスクリーンの上には出ない**: 全画面ゲーム等の上には表示されない。→ **本仕様では「好都合」としてユーザーが承認済み**。
- **DPI スケーリング**: Windows の表示スケール（125% 等）でカーソル座標とピクセルがずれる可能性。実装時に DPI を考慮して座標変換する。
- **アプリサイズ**: Chromium 同梱 + スプライト多数で 100MB 前後。配布は可能だが軽量ではない。
- **素材ライセンス**: PMD 系スプライト（`CREDITS.txt`）。友人配布は問題なし。商用化は別途確認。

## 10. パッケージング・配布

- `electron-builder` で Windows NSIS インストーラ（`.exe`）を生成。
- アイコンは既存のモンスターボール（`assets/icons/pokeball-*.png`）を流用。
- 友人はインストーラ実行 → 常駐開始。

## 11. プロジェクト配置

- 配置先: `repos/_active/pokefollower-desktop/`。
- 既存資産の取り込み元: クローン済み `_inspect_pokefollower/`（`src/content.js`, `src/popup/`, `src/assets/`）。
  実装時に必要ファイルを新プロジェクトへ取り込む（移動・統合の方法は実装計画で定義）。

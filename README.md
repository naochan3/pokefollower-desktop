# PokéFollower Desktop

マウスカーソルをポケモンが追いかけてくる、Windows / macOS / Linux 向けのデスクトップマスコットです。
ブラウザ拡張 [pokefollower_cursor_web_plugin](https://github.com/ThinkrDoer/pokefollower_cursor_web_plugin) を、デスクトップ全体で動くアプリ（Electron）に作り変えたものです。

開発状況・ロードマップは [docs/STATUS.md](docs/STATUS.md)、リリース手順は [RELEASING.md](RELEASING.md) を参照してください。

---

## ダウンロード

### Windows

**[→ インストーラ（.exe）をダウンロード](https://github.com/naochan3/pokefollower-desktop/releases/latest/download/PokeFollower-Setup.exe)**

1. 上のリンクから `PokeFollower-Setup.exe` をダウンロード
2. **ダブルクリック** → 自動でインストールされ、そのまま起動して**タスクトレイ**（画面右下）に常駐（途中の選択画面なし）
3. タスクトレイのモンスターボールを**右クリック**で、設定 / 有効・無効 / 終了

> 未署名のため、初回は Windows SmartScreen が「WindowsによってPCが保護されました」と表示することがあります。「詳細情報」→「実行」で進めてください。

### macOS（Apple Silicon）

**[→ ディスクイメージ（.dmg）をダウンロード](https://github.com/naochan3/pokefollower-desktop/releases/download/v1.0.2/PokeFollower-1.0.2-arm64.dmg)**（[.zip 版](https://github.com/naochan3/pokefollower-desktop/releases/download/v1.0.2/PokeFollower-1.0.2-arm64-mac.zip)）

1. 上のリンクから `.dmg` をダウンロード
2. 開いて `PokeFollower.app` を**アプリケーション**にドラッグ → 起動して**メニューバー**（画面右上）に常駐
3. メニューバーのモンスターボールを**クリック**で、設定 / 有効・無効 / 終了

> 未署名・未公証のため、初回は Gatekeeper にブロックされます。アプリを**右クリック →「開く」**、または `システム設定 → プライバシーとセキュリティ` の「このまま開く」で実行してください。
> （macOS 版は contributor がビルドした arm64 バイナリ。全画面アプリの自動非表示は Windows のみ対応です）

> 最新の配布状況は常に[リリースページ](https://github.com/naochan3/pokefollower-desktop/releases/latest)から確認できます。

---

## 特徴

- **デスクトップ全体でカーソル追従** — Web ページ内ではなく、OS のマウスカーソルをポケモンが追いかけます。
- **マルチモニター対応** — ポケモンは画面全体のグローバル座標で動き、モニターの境界を**ワープせず連続して**越えてついてきます。
- **ポケモン 493 種（第1〜4世代）** — スプライトはレトロ系のドット絵。
- **日本語表示・日本語検索** — 設定画面はタイル一覧（スプライト＋日本語名＋図鑑番号）。カタカナ／ひらがな／ローマ字／英名／番号で検索できます。
- **見た目の調整** — サイズ（SCALE）・カーソルからの距離（DISTANCE）・追従速度（SPEED）を変更可能。
- **トレイ常駐** — タスクトレイのモンスターボールから、設定・有効/無効・自動起動・終了を操作。
- **設定の永続化** — 選んだポケモンや各設定は再起動後も保持されます。
- **ログイン時の自動起動**（インストール版のみ）。
- **全画面アプリで自動的に隠れる** — ゲーム等が全画面で前面にあるときはポケモンを自動で隠し、抜けると戻ります。Chrome の最大化やデスクトップ表示では隠れません。
- **クリック透過** — 透明・最前面のオーバーレイなので、下のアプリ操作の邪魔をしません。

### 既知の制限

- macOS 版はビルド対応済みですが、未署名・未公証です。配布する場合は Developer ID で署名し、公証してください。
- Linux 版は AppImage のビルド対応までです。デスクトップ環境ごとの常駐・透明オーバーレイ挙動は追加検証が必要です。
- 全画面の自動判定は Windows のみ対応です。macOS / Linux では全画面アプリ上でも自動非表示にはなりません。
- Windows の全画面判定は「前面ウィンドウがモニター全体を覆っているか」で行うため、ブラウザを `F11` で全画面にした場合もゲーム同様に隠れます（通常の最大化では出たまま）。
- モニターごとに表示スケール（DPI）が大きく異なる構成では、位置がわずかにずれる可能性があります。

---

## 動作環境

- Windows 10 / 11（x64）
- macOS（Apple Silicon / arm64）
- Linux（AppImage）

## インストール（使う人向け）

上の [ダウンロード](#ダウンロード) からインストーラを取得してダブルクリックするだけです（ワンクリック型なので選択画面なし→自動でインストール→起動→トレイ常駐）。インストール後はログイン時に自動起動し、初回から有効（ポケモンが表示）の状態です。

> 自分でソースからビルドする場合は後述の [ビルド](#ビルド配布物の作成) を参照（`release/` に生成されます）。

### 使い方

- タスクトレイ（画面右下）の**モンスターボールのアイコン**を右クリック：
  - **設定を開く** — ポケモン選択・サイズ・距離・速度を変更
  - **有効** — 表示の ON / OFF
  - **自動起動** — ログイン時の自動起動の ON / OFF
  - **終了** — アプリを終了
- 設定画面では、検索ボックスに `ピカチュウ` / `ぴかちゅう` / `pikachu` / `25` などを入力して絞り込めます。

---

## 開発

```bash
# 依存をインストール
npm install

# 開発起動（ソースを編集したら再起動して反映）
npm start

# 単体テスト（Vitest）
npm test

# 実機不要のローカル検証（assets/CI/docs/platform/signing + unit tests）
npm run verify:local

# Rust 版追従コアの同等性テスト（cargo が必要）
npm run test:rust

# Rust コアを変更したとき：WASM を再ビルドして native/ に反映（cargo + wasm32-unknown-unknown ターゲットが必要）
npm run build:rust
```

> 追従計算は Rust→WASM（`native/pokefollower_core.wasm`）をリポジトリに同梱済みです。`npm test` / `npm run dist` は同梱済みの WASM をそのまま使うため、**Rust ツールチェーン無しでも動きます**。Rust ソース（`crates/follower_core/`）を変更したときだけ `npm run build:rust` で再生成してコミットしてください。

> `npm start` は起動時のコードを読み込んだまま動きます（自動リロードなし）。コードを変えたら一度終了して起動し直してください。

### ビルド（配布物の作成）

```bash
# Windows インストーラ (NSIS) を release/ に生成
npm run dist

# macOS アプリ (DMG / ZIP) を release/ に生成
npm run dist:mac

# Linux アプリ (AppImage) を release/ に生成
npm run dist:linux
```

生成物：`release/PokeFollower Setup <version>.exe`（例: `... 1.0.2.exe`）

macOS 生成物：`release/PokeFollower-<version>-arm64.dmg` / `release/PokeFollower-<version>-arm64-mac.zip` など（実行環境の CPU により変わります）。

Linux 生成物：`release/PokeFollower-<version>.AppImage` など。

> 配布物を Release に上げる手順・担当・アセット命名規則は [RELEASING.md](RELEASING.md) にまとめています。

---

## アーキテクチャ

マルチモニターでも追従が破綻しないよう、**ポケモンの位置はメインプロセスがグローバル座標で一元管理**し、各モニターの窓は描画に徹する構成です。

| 部品 | 役割 |
|---|---|
| メインプロセス（`src/main/main.js`） | 司令塔。カーソル取得・追従シムの駆動（既定 16ms ≒ 最大60fps。`POKEFOLLOWER_SIM_INTERVAL_MS=8` で明示的に 8ms 指定可）・設定の永続化・各窓への描画配信・トレイ・設定窓の管理 |
| 追従シム（`src/main/follower-sim.js`） | 追従とアニメーションの計算（グローバル座標）。DOM 非依存・テスト可能 |
| Rust 追従コア（`crates/follower_core/`） | 追従位置計算の本体。WASM として `native/pokefollower_core.wasm` にビルドされ、Electron 実行時に読み込まれる |
| オーバーレイ窓（`src/overlay/`） | **モニターごとに1枚**常設。透明・最前面・クリック透過。メインから受け取ったローカル座標でスプライトを描くだけ |
| 設定窓（`src/settings/`） | タイル選択 UI・日本語検索・各種スライダー |
| パック読み込み（`src/main/pack-reader.js`） | スプライト定義（パック JSON）と日本語名の読み込み |
| 全画面検知（`src/main/fullscreen-detect.js`） | Windows の前面ウィンドウ判定。macOS では no-op として動作 |

**なぜこの設計か**：当初は「1枚の窓をカーソルの居るモニターへワープさせる」方式でしたが、境界越えで位置が跳ねる・逆走するなどの問題が構造的に発生しました。ポケモンをグローバル座標で連続的に動かし、各モニター窓が自分の領域分だけ描く方式に作り変えることで、境界をなめらかに越えられるようになっています。詳細は `docs/superpowers/specs/` の設計書を参照。

マルチモニター時は、スプライトが実際に交差するモニター窓だけへフレームを送り、他の窓には表示状態が変わる時だけ hide を送ります。オーバーレイ側もスプライト画像 URL やサイズ指定をキャッシュし、毎フレームの DOM 更新と GC 負荷を抑えています。

### プロジェクト構成

```
pokefollower-desktop/
├─ src/
│  ├─ main/                  # メインプロセス
│  │  ├─ main.js             # エントリ・窓/トレイ/IPC・シムループ
│  │  ├─ follower-sim.js     # 追従＋アニメ計算（グローバル座標）
│  │  ├─ fullscreen-detect.js# 前面アプリの全画面判定（koffi/Win32）
│  │  ├─ pack-reader.js      # パック/日本語名の読み込み
│  │  ├─ asset-path.js       # パックのパス解決
│  │  └─ settings-store.js   # 設定の永続化（JSON）
│  ├─ overlay/               # 描画役オーバーレイ（モニター毎）
│  │  ├─ overlay.html / overlay.js / overlay-preload.js
│  └─ settings/              # 設定ウィンドウ
│     ├─ settings.html / settings.js / settings-preload.js
├─ crates/follower_core/     # Rust 追従コア（→ WASM）
├─ native/                   # ビルド済み WASM（pokefollower_core.wasm）
├─ assets/                   # スプライト・アイコン・UI素材・日本語名データ
├─ tests/                    # Vitest 単体テスト
├─ docs/
│  ├─ STATUS.md              # 計画 vs 現状・ロードマップ
│  └─ superpowers/           # 設計書・実装計画
├─ RELEASING.md              # リリース手順
└─ package.json
```

## 技術スタック

- [Electron](https://www.electronjs.org/) — デスクトップアプリ本体
- [electron-builder](https://www.electron.build/) — 各 OS の配布物生成（Windows NSIS / macOS dmg・zip / Linux AppImage）
- [Rust](https://www.rust-lang.org/) → WebAssembly — 追従位置計算のコア（`crates/follower_core/`）
- [Vitest](https://vitest.dev/) — 単体テスト

---

## クレジット・権利表記

- ドット絵スプライト：[PMD Collab](https://sprites.pmdcollab.org) / [Pokémon DB](https://pokemondb.net)
- 元になったブラウザ拡張：[ThinkrDoer/pokefollower_cursor_web_plugin](https://github.com/ThinkrDoer/pokefollower_cursor_web_plugin)
- 日本語名データ：[PokéAPI](https://pokeapi.co) から生成（`scripts/fetch-jp-names.cjs`）

ポケモンおよび関連する名称・キャラクターは © Nintendo / Creatures Inc. / GAME FREAK inc. の登録商標です。
本プロジェクトは個人的なファン制作物であり、**商用利用は想定していません**。スプライト等の素材は各配布元の規約に従ってください。

## ライセンス

- **ソースコード**：[MIT License](LICENSE)（`src/`・`crates/`・`scripts/`・`tests/`・ビルド設定など）。自由に利用・改変・再配布できます。
- **素材（MIT対象外）**：ポケモンのスプライト（`assets/`）・名称・モンスターボール/アイコン等の Pokémon 関連素材は **MIT の対象外**です。各権利者（Nintendo / Creatures Inc. / GAME FREAK inc. および素材提供元）に帰属し、非商用の個人的ファン制作物として同梱しているだけです（詳細は [NOTICE](NOTICE)）。

> このリポジトリは「ソース公開のファン制作物」であり、**全体が自由に使える OSS ではありません**。コードは MIT ですが、Pokémon 素材を含めた再配布・商用利用は各権利者の権利を侵害する可能性があります。素材を権利クリアなものに差し替えない限り、完全な OSS 配布はできません。

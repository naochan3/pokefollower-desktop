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

**[→ ディスクイメージ（.dmg）をダウンロード](https://github.com/naochan3/pokefollower-desktop/releases/download/v1.3.0/PokeFollower-1.3.0-arm64.dmg)**（[.zip 版](https://github.com/naochan3/pokefollower-desktop/releases/download/v1.3.0/PokeFollower-1.3.0-arm64-mac.zip)）

1. 上のリンクから `.dmg` をダウンロード
2. 開いて `PokeFollower.app` を**アプリケーション**にドラッグ → 起動して**メニューバー**（画面右上）に常駐
3. メニューバーのモンスターボールを**クリック**で、設定 / 有効・無効 / 終了

> 未署名・未公証のため、初回は Gatekeeper にブロックされます。アプリを**右クリック →「開く」**、または `システム設定 → プライバシーとセキュリティ` の「このまま開く」で実行してください。
> （macOS 版は contributor がビルドした arm64 バイナリ。全画面アプリの自動非表示にはアクセシビリティ許可が必要な場合があります）

### Linux

**[→ AppImage をダウンロード](https://github.com/naochan3/pokefollower-desktop/releases/download/v1.2.0/PokeFollower-1.2.0.AppImage)**

1. 上のリンクから `PokeFollower-1.2.0.AppImage` をダウンロード
2. 実行権限を付けて起動
3. 起動できた環境では、tray または代替の常駐 UI から設定 / 有効・無効 / 終了

```bash
chmod +x PokeFollower-1.2.0.AppImage
./PokeFollower-1.2.0.AppImage
```

> Linux 版は AppImage のパッケージ検証、WSLg での起動 smoke、saved pack restore smoke、X11 window probe、GUI evidence candidate までです。WSLg は runtime smoke の参考環境であり、native Linux desktop の目視検証の代替ではありません。screenshot が取れない candidate は visual non-evaluable として扱い、デスクトップ環境ごとの tray / 透明オーバーレイ / クリック透過 / 最前面挙動は追加検証が必要です。

> 最新の配布状況は常に[リリースページ](https://github.com/naochan3/pokefollower-desktop/releases/latest)から確認できます。

---

## 特徴

- **デスクトップ全体でカーソル追従** — Web ページ内ではなく、OS のマウスカーソルをポケモンが追いかけます。
- **マルチモニター対応** — ポケモンは画面全体のグローバル座標で動き、モニターの境界を**ワープせず連続して**越えてついてきます。
- **ポケモン 956 種＋地方フォルム 54 種（第1〜9世代、index 計1010）** — スプライトはレトロ系のドット絵。地方フォルム（アローラ/ガラル/ヒスイ/パルデア）も収録。
- **全1010体のタイプデータ＋タイプ色** — タイプ色チップによるビジュアル識別、タイプ絞り込み、タイプ名での検索に対応。
- **3タブ設定 UI（あいぼう / ボックス / せってい）** — ポケモン体験に合わせたUI設計。詳細は下の「設定画面（3タブ）」セクションを参照。
- **手持ち6体・先頭=相棒** — 手持ちに最大6体を入れ、先頭が現在の相棒。タップで相棒切替、満杯時は枠タップで入替。
- **あだ名** — 相棒ポケモンに名前を付けられます。
- **日本語表示・日本語検索** — 設定画面はタイル一覧（スプライト＋日本語名＋図鑑番号）。カタカナ／ひらがな／ローマ字／英名／番号・タイプ名で検索できます。
- **見た目の調整** — サイズ（SCALE）・カーソルからの距離（DISTANCE）・追従速度（SPEED）をあいぼうタブのスライダーで変更可能。
- **邪魔しない追従（カーソルをよける）** — カーソル直下を避け、退避強度を ふつう / つよい から選べます。既定は ON。
- **アプリに合わせる（任意）** — 前面アプリ名を best-effort で分類し、エディタでは距離を取り、ブラウザ/チャットでは少し近づく控えめな反応に切り替えます。
- **トレイ常駐** — タスクトレイのモンスターボールから、設定・有効/無効・自動起動・終了を操作（Linux は既知の制限を参照）。
- **設定の永続化** — 選んだポケモンや各設定は再起動後も保持されます。
- **通知コンパニオン（任意）** — 設定で ON にすると、許可された通知イベントを短く要約し、ポケモンの近くへドット風の吹き出しとして表示します。既定は OFF です。OS 通知本文は保存せず、Codex notify bridge は本文そのものではなく短い要約だけを最大64件のローカル queue に保持します。
- **ログイン時の自動起動**（インストール版のみ）。
- **全画面アプリで自動的に隠れる** — ゲーム等が全画面で前面にあるときはポケモンを自動で隠し、抜けると戻ります。Chrome の最大化やデスクトップ表示では隠れません。
- **クリック透過** — 透明・最前面のオーバーレイなので、下のアプリ操作の邪魔をしません。

---

## 設定画面（3タブ）

v1.2.0 からの設定画面は**ポケモン体験に合わせた3タブ構成**になっています。

| タブ | 内容 |
|---|---|
| **あいぼう** | 相棒を大きく表示。手持ち6体スロット（先頭=現在の相棒）、大きさ/距離/速さスライダー、あだ名入力 |
| **ボックス** | 全1010体をタイル一覧で表示。テキスト検索（名前/番号/タイプ名）、通常/地方フォルム切替、世代/地方/タイプ絞り込み |
| **せってい** | カーソルをよける（ふつう/つよい）・アプリに合わせる・通知コンパニオン・Codex pet 書き出しなどの動作設定 |

**なぜこのUIにしたか** — 旧来の「設定ウィンドウ=スライダーの羅列」から、ポケモンゲームの「あいぼう/ボックス/せってい」という自然な区分に再設計しました。詳しくは [設計仕様](docs/superpowers/specs/2026-06-22-ui-redesign-pokemon-experience-design.md) と [実装計画](docs/superpowers/plans/2026-06-22-ui-redesign-pokemon-experience.md) を参照してください。

---

### 既知の制限

- macOS 版はビルド対応済みですが、未署名・未公証です。配布する場合は Developer ID で署名し、公証してください。
- Linux 版は AppImage のビルド、WSLg での起動 smoke、saved pack restore smoke、X11 window probe、GUI evidence candidate までです。WSLg は runtime smoke の参考環境であり、native Linux desktop の目視検証の代替ではありません。screenshot が取れない candidate は visual non-evaluable として扱い、デスクトップ環境ごとの tray / 透明オーバーレイ / クリック透過 / 最前面挙動は追加検証が必要です。
- 全画面の自動判定は Windows では Win32、macOS では System Events / Accessibility、Linux では `xdotool` / `xprop` / `xwininfo` が利用できる環境で動作します。権限やツールが無い環境では自動非表示だけ無効になります。
- アプリ別リアクションは全画面検知と同じ前面ウィンドウ情報を使うため、macOS では Accessibility/System Events、Linux では `xdotool` / `xprop` / `xwininfo` の可否に依存します。取得できない場合は通常追従に戻ります。
- 邪魔しない追従は Electron の system idle time とカーソル位置を使うため、キー入力/ドラッグを個別に記録しません。取得できない環境ではカーソル近傍回避だけにフォールバックします。
- Windows の全画面判定は「前面ウィンドウがモニター全体を覆っているか」で行うため、ブラウザを `F11` で全画面にした場合もゲーム同様に隠れます（通常の最大化では出たまま）。
- 通知コンパニオンは表示基盤とテスト通知までです。OS 全体の通知取得は [通知コンパニオンの取得境界](docs/notification-capture.md) に沿って、明示的に許可された範囲だけを後続実装します。
- モニターごとに表示スケール（DPI）が大きく異なる構成では、位置がわずかにずれる可能性があります。

---

## 動作環境

- Windows 10 / 11（x64）
- macOS（Apple Silicon / arm64）
- Linux（AppImage 配布あり。実機 GUI 挙動は追加検証が必要）

## インストール（使う人向け）

上の [ダウンロード](#ダウンロード) からインストーラを取得してダブルクリックするだけです（ワンクリック型なので選択画面なし→自動でインストール→起動→トレイ常駐）。インストール後はログイン時に自動起動し、初回から有効（ポケモンが表示）の状態です。

> 自分でソースからビルドする場合は後述の [ビルド](#ビルド配布物の作成) を参照（`release/` に生成されます）。

### 使い方

- タスクトレイ（画面右下）の**モンスターボールのアイコン**を右クリック：
  - **設定を開く** — ポケモン選択・サイズ・距離・速度・あだ名などを変更
  - **有効** — 表示の ON / OFF
  - **自動起動** — ログイン時の自動起動の ON / OFF
  - **終了** — アプリを終了
- **あいぼうタブ**：手持ちスロットをタップして相棒を切り替えます。あだ名欄に名前を入力できます。サイズ・距離・速さのスライダーも同タブ内にあります。
- **ボックスタブ**：検索ボックスに `ピカチュウ` / `ぴかちゅう` / `pikachu` / `25` / `ほのお` などを入力して絞り込めます。世代・地方・タイプチップで絞り込みも可能です。
- **せっていタブ**の `Codex pet` → `EXPORT` で、選択中のポケモンを `~/.codex/pets/pokefollower-.../` に custom pet として書き出せます。
- 通知コンパニオンは**せっていタブ**で ON / OFF できます。Codex の `notify` と連携する場合は、既存の Codex pet helper を残すために chain mode を使います。

```toml
notify = [
  "node",
  "/absolute/path/to/pokefollower-desktop/scripts/pokefollower-codex-notify.cjs",
  "--forward",
  "/Users/<you>/.codex/computer-use/Codex Computer Use.app/Contents/SharedSupport/SkyComputerUseClient.app/Contents/MacOS/SkyComputerUseClient",
  "turn-ended"
]
```

> Codex は `notify` に JSON payload を渡します。PokéFollower は `input-messages` を保存せず、`last-assistant-message` を短く要約して `~/.pokefollower/notifications/codex.jsonl` に最大64件だけ保持します。キュー監視は通知コンパニオン ON の間だけ `fs.watch` で動きます。OS 通知取得の境界は [docs/notification-capture.md](docs/notification-capture.md) にまとめています。

---

## 地方フォルム対応

アローラ・ガラル・ヒスイ・パルデアの地方フォルムを **54 種**収録しています（通常フォルムの 956 種とは別カウント）。

| 地方 | 収録数 |
|---|---|
| アローラ | 18 種 |
| ガラル | 18 種 |
| ヒスイ | 16 種 |
| パルデア | 2 種 |
| **合計** | **54 種** |

### 使い方

設定画面の**「種類」セレクタ**（通常 / 地方フォルム）で切り替えます。「地方フォルム」を選ぶとチップが **全 / アローラ / ガラル / ヒスイ / パルデア** に変わり、地方ごとに絞り込めます。フォルム名は日本語（例：アローラライチュウ）で表示されます。

### 未収録の地方フォルム

PMD Collab / SpriteCollab にスプライト素材が無いため収録できなかった地方フォルムがあります。一部の色違い・別状態バリアントも含め、実際にユーザー向けに欠けているのは下記のみです。

- **ガラルマッギョ（#618）** — 素材なし
- **パルデアケンタロスの炎/水の品種（#128）** — 闘の品種のみ収録、炎・水は素材なし

（アローラロコン系・ガラルポニータ系の `Alternate` バリアントやガラルヒヒダルマのダルマモードなどは、素材上のバリアント区分であり、対応するメインフォルムは収録済みです）

---

## 未収録ポケモン（素材準備中）

スプライト出典（PMD Collab / SpriteCollab）にまだ素材が無いポケモンは未収録です。素材が追加され次第対応します。

- 第5世代（15体）: 514 バオッキー / 516 ヒヤッキー / 520 ハトーボー / 522 シママ / 523 ゼブライカ / 538 ナゲキ / 558 イワパレス / 564 プロトーガ / 565 アバゴーラ / 591 モロバレル / 592 プルリル / 593 ブルンゲル / 616 チョボマキ / 618 マッギョ / 626 バッフロン
- 第6世代（2体）: 668 カエンジシ / 683 フレフワン
- 第7世代（7体）: 732 ケララッパ / 733 ドデカバシ / 734 ヤングース / 735 デカグース / 741 オドリドリ / 756 マシェード / 765 ヤレユータン
- 第8世代（14体）: 837 タンドン / 838 トロッゴン / 839 セキタンザン / 847 カマスジョー / 865 ネギガナイト / 866 バリコオル / 868 マホミル / 870 タイレーツ / 874 イシヘンジン / 878 ゾウドウ / 879 ダイオウドウ / 883 ウオチルドン / 893 ザルード / 896 ブリザポス
- 第9世代（31体）: 917 タマンチュラ / 929 オリーニョ / 931 イキリンコ / 942 オラチフ / 943 マフィティフ / 944 シルシュルー / 945 タギングル / 946 アノクサ / 947 アノホラグサ / 948 ノノクラゲ / 949 リククラゲ / 950 ガケガニ / 954 ベラカス / 956 クエスパトラ / 962 オトシドリ / 968 ミミズズ / 973 カラミンゴ / 986 アラブルタケ / 990 テツノワダチ / 993 テツノコウベ / 999 コレクレー / 1001 チオンジェン / 1002 パオジアン / 1003 ディンルー / 1008 ミライドン / 1014 イイネイヌ / 1020 ウガツホムラ / 1021 タケルライコ / 1022 テツノイワオ / 1023 テツノカシラ / 1025 モモワロウ

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

生成物：`release/PokeFollower Setup <version>.exe`（例: `... 1.2.0.exe`）

macOS 生成物：`release/PokeFollower-<version>-arm64.dmg` / `release/PokeFollower-<version>-arm64-mac.zip` など（実行環境の CPU により変わります）。

Linux 生成物：`release/PokeFollower-<version>.AppImage` など。

> 配布物を Release に上げる手順・担当・アセット命名規則は [RELEASING.md](RELEASING.md) にまとめています。

---

## アーキテクチャ

マルチモニターでも追従が破綻しないよう、**ポケモンの位置はメインプロセスがグローバル座標で一元管理**し、各モニターの窓は描画に徹する構成です。

| 部品 | 役割 |
|---|---|
| メインプロセス（`src/main/main.js`） | 司令塔。カーソル取得・追従シムの駆動（既定 16ms ≒ 最大60fps。`POKEFOLLOWER_SIM_INTERVAL_MS=8` で明示的に 8ms 指定可）・設定の永続化・各窓への描画配信・トレイ・設定窓の管理 |
| 通知コンパニオン（`src/main/notification-companion.js`） | 設定 ON 時だけ、許可された通知イベントを短く正規化して overlay へ配信。ポーリングせず、全画面/無効時は抑制 |
| Codex 通知ブリッジ（`src/main/notification-queue.js` / `src/main/codex-notification-watcher.js`） | Codex `notify` から渡された JSON payload を軽量 JSONL queue として受け、設定 ON の間だけ `fs.watch` で新着分を読む |
| 作業見守り（`src/main/work-watch.js`） | 25/5・50/10 のタイマー状態機械。停止中は追従に影響せず、実行中だけ通知と reaction mode を更新 |
| アプリ別リアクション（`src/main/app-reactions.js`） | 前面アプリ名を軽量分類し、通常/集中/親しみ/作業/休憩の reaction mode を決める。取得失敗時は通常へフォールバック |
| お気に入り待機列（`src/main/favorite-rotation.js`） | 保存済み favoritePacks から次のポケモンを決める純粋ロジック。待機列が空なら単体選択を維持 |
| 追従シム（`src/main/follower-sim.js`） | 追従とアニメーションの計算（グローバル座標）。DOM 非依存・テスト可能 |
| Rust 追従コア（`crates/follower_core/`） | 追従位置計算の本体。WASM として `native/pokefollower_core.wasm` にビルドされ、Electron 実行時に読み込まれる |
| オーバーレイ窓（`src/overlay/`） | **モニターごとに1枚**常設。透明・最前面・クリック透過。メインから受け取ったローカル座標でスプライトを描くだけ |
| 設定窓（`src/settings/`） | タイル選択 UI・日本語検索・各種スライダー |
| パック読み込み（`src/main/pack-reader.js`） | スプライト定義（パック JSON）と日本語名の読み込み |
| 全画面検知（`src/main/fullscreen-detect.js`） | Windows の前面ウィンドウ判定。macOS / Linux は OS 権限・外部コマンドが利用できる場合だけ best-effort で判定 |

**なぜこの設計か**：当初は「1枚の窓をカーソルの居るモニターへワープさせる」方式でしたが、境界越えで位置が跳ねる・逆走するなどの問題が構造的に発生しました。ポケモンをグローバル座標で連続的に動かし、各モニター窓が自分の領域分だけ描く方式に作り変えることで、境界をなめらかに越えられるようになっています。詳細は `docs/superpowers/specs/` の設計書を参照。

マルチモニター時は、スプライトが実際に交差するモニター窓だけへフレームを送り、他の窓には表示状態が変わる時だけ hide を送ります。オーバーレイ側もスプライト画像 URL やサイズ指定をキャッシュし、毎フレームの DOM 更新と GC 負荷を抑えています。

### プロジェクト構成

```
pokefollower-desktop/
├─ src/
│  ├─ main/                  # メインプロセス
│  │  ├─ main.js             # エントリ・窓/トレイ/IPC・シムループ
│  │  ├─ follower-sim.js     # 追従＋アニメ計算（グローバル座標）
│  │  ├─ fullscreen-detect.js# 前面アプリの全画面判定（Win32 / macOS / Linux best-effort）
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

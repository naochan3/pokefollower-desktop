# プロジェクト状況（計画 vs 現状）

最終更新: 2026-06-22 / 現在のバージョン: **v1.0.5**

このドキュメントは「当初の計画に対して、今どこまで出来ているか」を一覧で把握するためのものです。
詳細な設計・実装計画は `docs/superpowers/plans/` と `docs/superpowers/specs/` を参照。

---

## 全体像

ブラウザ拡張 [pokefollower_cursor_web_plugin](https://github.com/ThinkrDoer/pokefollower_cursor_web_plugin) を、
**デスクトップ全体で OS カーソルを追う常駐マスコット（Electron）** に作り変える、という当初ゴールは達成済み。
現在は Windows / macOS(arm64) 向けに配布物を出せる状態。

---

## 計画項目の進捗

当初 issue（#1〜#10）で立てた計画は **すべて完了** しています。

| 項目 | 元 issue | 状況 |
|---|---|---|
| ブラウザ拡張 → Electron 常駐アプリへ移植 | #1 | ✅ 完了 |
| ポケモン名の日本語化・タイル選択 UI・日本語検索 | #2 | ✅ 完了（956種・カナ/かな/ローマ字/英名/番号 検索） |
| 配布向け挙動（初期表示ON・ログイン自動起動・二重起動防止） | #3 | ✅ 完了 |
| 設定ウィンドウのレイアウト/表示不具合 | #4 | ✅ 完了 |
| マルチモニターで逆走/高速移動する問題の根治 | #6 | ✅ 完了（グローバル座標 + モニター毎オーバーレイへ刷新） |
| README 整備 | #7 | ✅ 完了 |
| macOS 対応 | #8 | ✅ ビルド対応＋arm64 バイナリ配布（未署名） |
| Rust 化による軽量化の検討 | #9 | ✅ 追従コアを Rust→WASM 化（PR #11）。Tauri 全面移行ではなく WASM コア採用 |
| 全画面アプリ前面時の自動非表示 | #10 | ✅ 完了（Windows は Win32。macOS / Linux は権限・ツールがある環境で best-effort 判定） |

### 計画外で追加されたもの

- **Linux (AppImage) ビルドターゲット**（PR #11）
- **マルチモニターの IPC 削減**（スプライトが交差する窓だけにフレーム配信）＋オーバーレイの描画キャッシュ（PR #11）
- **`npm test` / `npm run dist` を Rust ツールチェーン非依存に**（同梱 WASM 使用）
- **Windows 配布物に zip ターゲット追加**（PR #12）。`npm run dist:win` で `.exe` と `.zip` を生成。v1.0.2 リリースに同梱済み
- **Electron セキュリティ更新**（PR #18）：Electron 31→42.4.1、`app://` を assets/ 配下に制限、レンダラ sandbox 有効化、npm audit 0件。Node >=22.12.0 必須
- **追従更新間隔の軽量化**（PR #21）：既定を16ms（最大60fps相当）へ戻し、検証用に `POKEFOLLOWER_SIM_INTERVAL_MS=8` の明示 override を維持

---

## 現在含まれているもの（v1.0.5）

- Windows インストーラ＋zip（Electron 42・Rust コア同梱、PR #11/#18/#21＋ #31/#32 の追従挙動修正＋ #34（待機を移動方向の逆隅に）＋ #35（第5〜9世代追加・世代フィルタ）込み。追従既定 16ms）
- macOS arm64 dmg / zip（v1.0.5 添付済み）
- ポケモン 956 種（第1〜9世代。未収録69種は出典素材待ち）
- 日本語表示・日本語検索、タイル選択 UI、世代フィルタ（全/第1〜9）
- 待機位置は移動方向の逆隅に留まる（本家拡張準拠）
- Follow / Roam（散歩）モード切り替え。Roam は画面内の自律移動、idle/sleep 休止、性格プリセット別タイミングを含む
- Edge Rest（既定 ON）。カーソル静止後に現在ディスプレイの安全な画面端、または取得できた前面ウィンドウ端へ移動
- 邪魔しない追従（既定 ON）。カーソル直下回避、Normal/Strong の退避強度、最近操作中の busy reaction を含む
- お気に入り待機列（既定 OFF）。最大12件のお気に入り保存、手動 NEXT、1〜120分の自動ローテーション、空待機列では単体選択を維持
- 作業見守りモード（既定 OFF）。25/5・50/10 タイマー、開始/停止/リセット、休憩/作業切り替わり通知、作業中/休憩中の控えめな追従リアクションを含む
- アプリ別リアクション（既定 OFF）。前面アプリ情報が取れる環境では、エディタ/ターミナルで距離を取り、ブラウザ/チャットでは少し近づく軽量ルールを適用
- マルチモニター連続追従、全画面自動非表示（Windows / macOS / Linux best-effort）、ログイン自動起動、クリック透過
- 通知コンパニオン基盤（既定 OFF、OS 通知本文は保存しない、Codex notify bridge は短い要約だけを最大64件のローカル queue に保持）

---

## 今後の対応予定（ロードマップ）

未完了・対応中・検討中の項目。GitHub の [Issues](https://github.com/naochan3/pokefollower-desktop/issues) で管理します。

| 項目 | 優先度 | issue | メモ |
|---|---|---|---|
| 配布物の署名・公証（Win/Mac） | 低 | [#16](https://github.com/naochan3/pokefollower-desktop/issues/16) | SmartScreen / Gatekeeper 警告の解消。証明書・Apple Developer ID が必要 |
| macOS / Linux の全画面自動非表示・Linux 実機検証 | 低 | [#17](https://github.com/naochan3/pokefollower-desktop/issues/17) | macOS / Linux の best-effort 検知、macOS runtime smoke、Linux AppImage build/start smoke は確認済み。Linux AppImage の tray・透明・クリック透過・最前面は実機目視検証が必要 |

---

## 既知の制限

- macOS / Windows とも **未署名**（初回起動時に OS の警告）。
- 全画面の自動非表示は macOS / Linux では権限や外部コマンドに依存します。
- アプリ別リアクションも前面アプリ情報の取得可否に依存し、取得できない場合は通常追従にフォールバックします。
- 邪魔しない追従は system idle time が取れない環境では、カーソル近傍回避のみで動作します。
- 通知コンパニオンは OS 全体の通知取得までは未対応です。現在はアプリ内/許可済みイベントと Codex notify payload を表示する軽量基盤で、OS 別の権限境界は [通知コンパニオンの取得境界](notification-capture.md) に整理しています。
- モニター間で表示スケール（DPI）が大きく異なると、位置がわずかにずれることがある。
- Linux は AppImage ビルドと WSLg 起動 smoke まで（実機の tray・透明・クリック透過・最前面は未検証）。

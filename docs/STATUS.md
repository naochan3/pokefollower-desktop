# プロジェクト状況（計画 vs 現状）

最終更新: 2026-06-18 / 現在のバージョン: **v1.0.2**

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
| ポケモン名の日本語化・タイル選択 UI・日本語検索 | #2 | ✅ 完了（493種・カナ/かな/ローマ字/英名/番号 検索） |
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

## 現在含まれているもの（v1.0.2）

- Windows インストーラ＋zip（Electron 42・Rust コア同梱、PR #11/#18 の改善込み）
- macOS arm64 dmg / zip（contributor ビルド、Electron 42 / v1.0.2）
- ポケモン 493 種（第1〜4世代）
- 日本語表示・日本語検索、タイル選択 UI
- マルチモニター連続追従、全画面自動非表示（Windows / macOS / Linux best-effort）、ログイン自動起動、クリック透過

---

## 今後の対応予定（ロードマップ）

未着手・検討中の項目。GitHub の [Issues](https://github.com/naochan3/pokefollower-desktop/issues) で管理します。

| 項目 | 優先度 | issue | メモ |
|---|---|---|---|
| **全ポケモン対応（第5〜9世代の追加）** | 中 | [#14](https://github.com/naochan3/pokefollower-desktop/issues/14) | 現状は493種（〜第4世代）。スプライト素材と日本語名データの拡張が必要 |
| 配布物の署名・公証（Win/Mac） | 低 | [#16](https://github.com/naochan3/pokefollower-desktop/issues/16) | SmartScreen / Gatekeeper 警告の解消。証明書・Apple Developer ID が必要 |
| macOS / Linux の全画面自動非表示・Linux 実機検証 | 低 | [#17](https://github.com/naochan3/pokefollower-desktop/issues/17) | macOS / Linux の best-effort 検知は実装済み。Linux AppImage の透明・常駐・クリック透過・最前面は実機検証が必要 |

---

## 既知の制限

- macOS / Windows とも **未署名**（初回起動時に OS の警告）。
- 全画面の自動非表示は macOS / Linux では権限や外部コマンドに依存します。
- モニター間で表示スケール（DPI）が大きく異なると、位置がわずかにずれることがある。
- Linux は AppImage ビルドまで（実機の常駐挙動は未検証）。

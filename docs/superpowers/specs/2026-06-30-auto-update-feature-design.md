# 自前アップデート機能 設計

作成日: 2026-06-30 / 対象: pokefollower-desktop

## 目的

タスクトレイと設定（せってい）から「アップデートを確認」を押すと、GitHub の最新リリースを
チェックし、古ければ最新版に更新する。GitHub アカウント不要（公開リポジトリの公開URLのみ使用）。

## 方式（確定）

- **方式A: 軽量自前更新**（`electron-updater` は使わない）。
- 入口: **トレイメニュー＋せっていタブの両方**。
- Windows 更新時: **確認ダイアログ → DL → 旧版キル → 上書き再起動**。
- macOS: 未署名のため自動更新不可 → **リリースDLページをブラウザで開く**。

## 動作フロー（ボタン押下時）

1. `https://api.github.com/repos/naochan3/pokefollower-desktop/releases/latest` を取得（`net.fetch`、`User-Agent` 付き、匿名）。
2. `tag_name`（例 `v1.3.0`）から `v` を除き、`app.getVersion()` と **MAJOR.MINOR.PATCH の数値比較**。
3. 分岐:
   - **最新**: 「最新版です（vX.Y.Z）」ダイアログ。
   - **古い・Windows**: 確認ダイアログ → OK で `PokeFollower-Setup.exe` を temp に DL → インストーラを detached 起動 → `app.quit()`。oneClick NSIS が旧版を閉じて上書き＋再起動する。
   - **古い・macOS**: 「新しい vX.Y.Z があります」→ `shell.openExternal` でリリースページ。
   - **失敗**: 理由付きエラーダイアログ（握りつぶさない＝フェイルファスト）。

## モジュール境界

### `src/main/updater.js`（新規・副作用なし・テスト対象）

- `parseLatestRelease(json)` … API レスポンスから `{ version, tag, htmlUrl, assets }` を取り出す。
- `compareVersions(a, b)` … `-1 | 0 | 1`。数値で各セグメント比較。
- `isOutdated(current, latest)` … `latest > current` を返す。
- `pickWindowsInstallerAsset(assets)` … `name === "PokeFollower-Setup.exe"` の `browser_download_url` を返す（なければ null）。
- `checkLatestRelease(fetchFn)` … `fetchFn` を注入し API 取得＋`parseLatestRelease`。非200/レート制限は構造化エラーを throw。

### `src/main/main.js`（薄いオーケストレーション・Electron依存）

- `runUpdateCheck({ interactive })` … 上記フロー。`dialog` / `shell` / `app` / DL関数を使用。
- IPC: `ipcMain.handle("update:check", ...)`、`ipcMain.handle("update:get-version", () => app.getVersion())`。
- トレイ: `refreshTrayMenu()` に「アップデートを確認」を「終了」の前に追加。
- DL: アセットURL（GitHub→S3 へリダイレクト）を追従して temp に保存。サイズ>0 を確認。
- 起動: `spawn(exePath, [], { detached: true, stdio: "ignore", shell: false }).unref()` → `app.quit()`。

### UI

- `src/settings/settings-preload.js`: `settingsApi` に `getAppVersion`/`checkForUpdate` を追加（`ipcRenderer.invoke`）。
- `src/settings/settings.html`: せっていタブに「現在のバージョン: vX.Y.Z」表示＋「アップデートを確認」ボタン。
- `src/settings/settings.js`: ボタン→`window.settingsApi.checkForUpdate()`、起動時にバージョン表示。

## エラー処理・セキュリティ

- HTTPS 限定。リポジトリ URL はハードコード（任意 URL のダウンロード/実行を防ぐ）。
- `spawn` は `shell: false`・明示パス（コマンドインジェクション防止）。
- ネットワーク/API/DL 失敗はダイアログで明示。握りつぶさない。
- DL する exe は未署名＝既存の手動 DL と同じ信頼モデル（新規リスク増なし）。

## テスト（`tests/updater.test.js`）

- `compareVersions`: 1.3.0>1.2.0、等値、1.10.0>1.9.0、桁違い。
- `isOutdated`: current<latest=true、等値=false、ローカルが新しい=false。
- `pickWindowsInstallerAsset`: 正アセット検出、不在で null。
- `parseLatestRelease` / `checkLatestRelease`: モック fetch でパース、非200/403 で throw。
- ダイアログ・DL・起動・quit は Electron ランタイム依存のためユニット対象外（薄く保つ）。

## スコープ外（YAGNI）

- 起動時の自動チェック（今回は手動ボタンのみ）。
- 署名・公証（別タスク #16）。macOS 完全自動更新はこれが前提。
- 差分更新・進捗バー（electron-updater 相当）。

## 既知の限界（正直な評価）

- macOS は「ページを開く」止まり（未署名の原理的限界）。
- 未署名のため Win 更新時も SmartScreen 警告は出る（従来と同じ）。
- GitHub 未認証 API は 60回/時/IP。手動ボタンなら問題なし。

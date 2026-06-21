# macOS / Linux 実機ランタイム検証

最終更新: 2026-06-22

Issue #17 の残タスクは、ソース上の best-effort 実装ではなく、実機での常駐・透明オーバーレイ・クリック透過・最前面・全画面抑制の確認です。この文書は、検証者が同じ観点で結果を残せるようにするためのチェックリストです。

## 共通方針

- 生成物は `release/` 配下だけを使い、ソース直起動の結果で release 版の挙動を代替しません。
- 検証時は一時ユーザーデータを使い、普段の `settings.json` を壊さないようにします。
- 検証後は PokeFollower の残プロセスがないことを確認します。
- OS 権限や外部コマンドがない場合は、アプリ全体ではなく「全画面自動非表示だけ」が無効になり、通常追従へ戻ることを期待します。

## 自動検証で担保している範囲

- macOS / Linux の前面ウィンドウ検知は非同期で実行し、Electron main process をブロックしません（`verify:platform`）。
- macOS の System Events 実行失敗時は、前面ウィンドウ情報を `null` として扱います（`tests/fullscreen-detect.test.js`）。
- Linux の `xdotool` / `xprop` / `xwininfo` 出力不足時は、前面ウィンドウ情報を `null` として扱います（`tests/fullscreen-detect.test.js`）。
- `main.js` は `null` の前面ウィンドウ情報を全画面扱いにせず、自動非表示だけを無効化して通常追従を継続します（`tests/fullscreen-policy.test.js` / `verify:runtime`）。
- package smoke は macOS / Linux の生成物に必要な runtime payload が入っていることを確認します（CI package smoke）。

これらは「権限なし・コマンド不足時にクラッシュしない」境界の自動検証です。Linux AppImage の tray / 透明オーバーレイ / click-through / always-on-top / fullscreen hide-restore の実際の見え方と操作感は、引き続き実機目視で確認します。

## macOS smoke

前提:

- Apple Silicon / arm64 Mac。
- `npm run dist:mac -- --arm64 --dir --publish=never` が成功している。
- `release/mac-arm64/PokeFollower.app` が存在する。

コマンド:

```bash
npm run dist:mac -- --arm64 --dir --publish=never
node scripts/verify-package-smoke.cjs darwin arm64
PF_MAC_UNPACKED_MODES=both PF_MAC_UNPACKED_WARMUP_MS=3000 PF_MAC_UNPACKED_SAMPLE_MS=5000 PF_MAC_UNPACKED_SAMPLE_INTERVAL_MS=1000 npm run bench:mac-unpacked-runtime
```

手動の UI 確認で起動する場合:

```bash
PF_MAC_USER_DATA="$(mktemp -d -t pf-mac-runtime-XXXXXX)"
POKEFOLLOWER_ALLOW_TEST_USER_DATA=1 POKEFOLLOWER_TEST_USER_DATA_DIR="$PF_MAC_USER_DATA" release/mac-arm64/PokeFollower.app/Contents/MacOS/PokeFollower
rm -rf "$PF_MAC_USER_DATA"
```

実機確認:

- メニューバーに常駐アイコンが出る。
- 透明オーバーレイが最前面に出る。
- クリックが下のアプリへ透過する。
- 通常の最大化では隠れない。
- 全画面アプリ前面時は非表示になり、全画面解除後に戻る。
- Accessibility / System Events が許可されていない場合、クラッシュせず通常追従へ戻る。
- `bench:mac-unpacked-runtime` の終了後、残プロセスが 0。

## Linux AppImage smoke

前提:

- Linux 実機または GUI セッション付き VM。
- X11 と Wayland は結果を分けて記録します。
- `xdotool` / `xprop` / `xwininfo` の有無を記録します。

コマンド:

```bash
npm run dist:linux -- --dir --publish=never
node scripts/verify-package-smoke.cjs linux x64
PF_LINUX_UNPACKED_MODES=both PF_LINUX_UNPACKED_WARMUP_MS=3000 PF_LINUX_UNPACKED_SAMPLE_MS=5000 PF_LINUX_UNPACKED_SAMPLE_INTERVAL_MS=1000 npm run bench:linux-unpacked-runtime
npm run dist:linux -- --publish=never
chmod +x release/*.AppImage
```

`bench:linux-unpacked-runtime` は GUI セッションが必要です。WSLg などの実 GUI ではそのまま実行し、headless VM では `xvfb-run -a npm run bench:linux-unpacked-runtime` のように Xvfb を明示して使います。sandbox 権限で起動できない環境では `PF_LINUX_UNPACKED_ARGS=--no-sandbox` を検証ログに残してから使います。

手動の UI 確認で起動する場合:

```bash
PF_LINUX_USER_DATA="$(mktemp -d -t pf-linux-runtime-XXXXXX)"
POKEFOLLOWER_ALLOW_TEST_USER_DATA=1 POKEFOLLOWER_TEST_USER_DATA_DIR="$PF_LINUX_USER_DATA" ./release/*.AppImage
rm -rf "$PF_LINUX_USER_DATA"
```

実機確認:

- AppImage が起動する。
- tray または代替の常駐 UI が使える。
- 透明オーバーレイが表示される。
- クリックが下のアプリへ透過する。
- always-on-top が通常ウィンドウの前に維持される。
- X11 で `xdotool` / `xprop` / `xwininfo` が揃う場合、全画面アプリ前面時に非表示になる。
- Wayland や必要コマンドなしの環境では、全画面自動非表示だけ無効になり、通常追従は継続する。
- `bench:linux-unpacked-runtime` の終了後、残プロセスが 0。
- AppImage 終了後、PokeFollower の残プロセスが 0。

## 記録テンプレート

```md
## 検証日

- OS:
- デスクトップ環境:
- セッション種別: X11 / Wayland / macOS
- PokeFollower commit:
- package version:
- 生成コマンド:
- package smoke:
- 常駐 UI:
- 透明 overlay:
- click-through:
- always-on-top:
- fullscreen hide/restore:
- 権限なし/外部コマンドなし fallback:
- 残プロセス:
- 備考:
```

## 検証記録

### 2026-06-22 macOS arm64 package smoke

- OS: macOS 26.5.1 / arm64
- PokeFollower commit: `4487ea6`
- package version: `v1.0.5`
- 生成コマンド: `npm run dist:mac -- --arm64 --dir --publish=never`
- package smoke: `node scripts/verify-package-smoke.cjs darwin arm64` passed
- runtime smoke: `PF_MAC_UNPACKED_MODES=both PF_MAC_UNPACKED_WARMUP_MS=3000 PF_MAC_UNPACKED_SAMPLE_MS=5000 PF_MAC_UNPACKED_SAMPLE_INTERVAL_MS=1000 npm run bench:mac-unpacked-runtime` passed
- enabled mode: tracked process count 4、avg ps cpu 3.360%、max ps cpu 4.600%、avg rss 375.5 MB、残プロセス 0
- disabled mode: tracked process count 4、avg ps cpu 0.000%、max ps cpu 0.000%、avg rss 355.7 MB、残プロセス 0
- 備考: builder は Developer ID Application 証明書を見つけられず未署名で package しました。これは #16 の既知制限と一致します。

### 2026-06-22 macOS arm64 package smoke refresh

- OS: macOS 26.5.1 / arm64
- PokeFollower commit: `5d161d5`
- package version: `v1.0.5`
- System Events probe: `osascript -e 'tell application "System Events" to return UI elements enabled'` -> `true`
- foreground probe: `node -e 'require("./src/main/fullscreen-detect.js").getForegroundInfo().then(v=>console.log(JSON.stringify(v)))'` -> `{"cls":"Codex","x":0,"y":0,"w":0,"h":0,"isFullscreen":false}`
- 生成コマンド: `npm run dist:mac -- --arm64 --dir --publish=never` passed
- package smoke: `node scripts/verify-package-smoke.cjs darwin arm64` passed
- runtime smoke: `PF_MAC_UNPACKED_MODES=both PF_MAC_UNPACKED_WARMUP_MS=3000 PF_MAC_UNPACKED_SAMPLE_MS=5000 PF_MAC_UNPACKED_SAMPLE_INTERVAL_MS=1000 npm run bench:mac-unpacked-runtime` passed
- enabled mode: tracked process count 4、avg ps cpu 12.160%、max ps cpu 30.600%、avg rss 374.3 MB、残プロセス 0
- disabled mode: tracked process count 4、avg ps cpu 0.000%、max ps cpu 0.000%、avg rss 349.7 MB、残プロセス 0
- 備考: System Events が許可されているこの Mac では foreground info 取得がクラッシュせず通常値を返しました。Accessibility / System Events 権限なし状態そのものは未確認のため、Issue #17 の残タスクとして維持します。builder は Developer ID Application 証明書を見つけられず未署名で package しました。これは #16 の既知制限と一致します。

### 2026-06-22 Linux WSLg unpacked runtime smoke

- OS: Ubuntu 26.04 on WSL2 / WSLg（Windows host: rtx4090）
- セッション種別: WSLg（`DISPLAY=:0`, `WAYLAND_DISPLAY=wayland-0`）
- PokeFollower commit: `e56f568` + Linux bench process detection fix
- package version: `v1.0.5`
- 追加した実行時依存: `libnspr4`, `libnss3`, `libasound2t64`, `libxss1`, `xdotool`, `x11-utils`
- 外部コマンド: `xdotool`, `xprop`, `xwininfo` available
- 生成コマンド: `npm run dist:linux -- --dir --publish=never`
- package smoke: `node scripts/verify-package-smoke.cjs linux x64` passed
- runtime smoke: `PF_LINUX_UNPACKED_MODES=both PF_LINUX_UNPACKED_WARMUP_MS=3000 PF_LINUX_UNPACKED_SAMPLE_MS=5000 PF_LINUX_UNPACKED_SAMPLE_INTERVAL_MS=1000 PF_LINUX_UNPACKED_ARGS=--no-sandbox npm run bench:linux-unpacked-runtime` passed
- enabled mode: tracked process count 7、avg ps cpu 9.860%、max ps cpu 11.500%、avg rss 804.7 MB、残プロセス 0
- disabled mode: tracked process count 7、avg ps cpu 9.900%、max ps cpu 11.000%、avg rss 760.7 MB、残プロセス 0
- AppImage build: `npm run dist:linux -- --publish=never` passed、`release/PokeFollower-1.0.5.AppImage` generated
- AppImage start smoke: `libfuse2t64` 追加後、`POKEFOLLOWER_ALLOW_TEST_USER_DATA=1 POKEFOLLOWER_TEST_USER_DATA_DIR=<tmp> release/PokeFollower-1.0.5.AppImage --no-sandbox` が10秒以上起動を維持、手動停止後の残プロセス 0
- X11 window probe: `xdotool search --pid <app_pid>` で window を検出。overlay 相当の viewable windows は `Depth: 32`, `Class: InputOutput`, `Override Redirect State: yes`, `Border width: 0`, `WM_CLASS="pokefollower-desktop"`、サイズは `2560x1439` のモニター相当でした。
- 備考: `ps comm` が `pokefollower-desktop` を15文字で `pokefollower-de` に切り詰めるため、runtime helper は command line でもプロセス検出します。これは起動・軽量測定・cleanup と X11 window 属性の証跡であり、AppImage の tray / transparent overlay / click-through / always-on-top の人間による目視確認は引き続き別途必要です。

## Issue #17 の完了条件

- macOS の権限あり/なし両方でクラッシュせず、全画面判定の可否が説明できる。
- Linux AppImage の常駐・透明・クリック透過・最前面挙動を少なくとも1環境で確認済み。
- 検証できない Linux 環境差分は、未検証として README または docs に残す。

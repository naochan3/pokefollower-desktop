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

最後に保存したポケモンの復帰を package 起動で smoke する場合:

```bash
PF_MAC_UNPACKED_PACK=retro/gen-1/025-pikachu PF_MAC_UNPACKED_MODES=enabled PF_MAC_UNPACKED_WARMUP_MS=3000 PF_MAC_UNPACKED_SAMPLE_MS=5000 PF_MAC_UNPACKED_SAMPLE_INTERVAL_MS=1000 npm run bench:mac-unpacked-runtime
```

スクリーンショットと process 証跡を収集する場合:

```bash
PF_MAC_GUI_PACK=retro/gen-1/025-pikachu npm run evidence:mac-gui
```

`evidence:mac-gui` は実機目視の補助です。baseline との差分と visible pixel ratio を記録しますが、`status=candidate` でも人間の確認なしに視覚 PASS 証跡として扱いません。`screencapture` が全面黒を返した場合や十分な差分を取れない場合は `status=blocked` として終了します。

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

最後に保存したポケモンの復帰を package 起動で smoke する場合:

```bash
PF_LINUX_UNPACKED_PACK=retro/gen-1/025-pikachu PF_LINUX_UNPACKED_MODES=enabled PF_LINUX_UNPACKED_WARMUP_MS=3000 PF_LINUX_UNPACKED_SAMPLE_MS=5000 PF_LINUX_UNPACKED_SAMPLE_INTERVAL_MS=1000 npm run bench:linux-unpacked-runtime
```

`bench:linux-unpacked-runtime` は GUI セッションが必要です。WSLg などの実 GUI ではそのまま実行し、headless VM では `xvfb-run -a npm run bench:linux-unpacked-runtime` のように Xvfb を明示して使います。WSLg は runtime smoke の参考環境であり、native Linux desktop の目視検証の代替ではありません。sandbox 権限で起動できない環境では `PF_LINUX_UNPACKED_ARGS=--no-sandbox` を検証ログに残してから使います。

スクリーンショット、process、X11 window probe 証跡を収集する場合:

```bash
PF_LINUX_GUI_PACK=retro/gen-1/025-pikachu PF_LINUX_GUI_ARGS=--no-sandbox npm run evidence:linux-gui
```

`evidence:linux-gui` は実機目視の補助です。`xdotool` / `xwininfo` / `xprop` が使える X11 では window 属性を記録し、利用可能な screenshot command があればスクリーンショットも残します。screenshot backend は `gnome-screenshot` / `grim` / `spectacle` / `scrot` を順に試し、失敗した backend も `attempts` に残します。`status=candidate` でも人間の確認なしに視覚 PASS 証跡として扱いません。process / window / screenshot の証跡が不足する場合は `status=blocked` として終了します。

status の扱い:

- `PASS`: human-check で tray / transparent overlay / click-through / always-on-top / fullscreen hide-restore / saved pack restore を確認し、証跡を残した状態。
- `candidate`: machine-check の process / window enumeration が取れた状態。UI の見た目・クリック透過・最前面・全画面復帰の正しさは確認済みとは扱いません。
- `blocked`: アプリ起動、process / window probe、screenshot などの補助証跡収集が不足し、machine-check としても評価不能な状態。

processCount / windowCount / viewableWindowCount / overlayLikeWindowCount は OS window enumeration の補助値です。透明 overlay が見えていること、クリック透過すること、always-on-top が効いていることの代理指標ではありません。screenshot が取れない環境の `candidate` は visual non-evaluable として扱い、Issue #17 の PASS には使いません。

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

## 手動 GUI 検証の証跡チェックリスト

完了扱いにするには、テキストの PASS だけではなく、実際に見た UI と操作の証跡を残します。

- 検証対象 artifact: Release URL または `release/` のファイル名、sha256、commit。
- 起動環境: OS、desktop environment、X11 / Wayland / macOS、display scale、multi-monitor 有無。
- machine-check: package smoke、runtime smoke、X11 window probe、残プロセスなど、コマンドで再実行できる結果。
- human-check: スクリーンショット、短い動画、操作ログなど、人間が見た UI の証跡。
- 常駐 UI: tray / menu のスクリーンショットまたは短い動画、設定・有効 OFF/ON・終了が操作できた記録。
- 透明 overlay: 背景アプリが見える状態のスクリーンショット。
- click-through: overlay 下のアプリをクリック操作できた短い動画または操作ログ。
- always-on-top: 通常ウィンドウを前面に移動しても overlay が前面維持されるスクリーンショットまたは短い動画。
- fullscreen hide/restore: fullscreen 前、fullscreen 中（非表示）、解除後（復帰）の3点スクリーンショットまたは短い動画。
- saved pack restore: 最後に保存した pack の名前と、再起動後に同じポケモンが表示されたスクリーンショットまたは短い動画。
- fallback: macOS 権限なし、Wayland、`xdotool` / `xprop` / `xwininfo` 不足などでクラッシュせず通常追従に戻る記録。
- 残プロセス: 終了後 `pgrep -af 'PokeFollower|pokefollower'` などの結果。
- NG/未確認項目: 未確認を PASS と書かず、未検証として残す。

## 記録テンプレート

```md
## 検証日

- OS:
- デスクトップ環境:
- セッション種別: X11 / Wayland / macOS
- PokeFollower commit:
- package version:
- 検証対象 artifact:
- sha256:
- 生成コマンド:
- package smoke:
- 証跡ファイル:
- 常駐 UI:
- 透明 overlay:
- click-through:
- always-on-top:
- fullscreen hide/restore:
- saved pack restore:
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

### 2026-06-22 macOS arm64 saved pack restore smoke

- OS: macOS 26.5.1 / arm64
- PokeFollower commit: `5a0e174` + saved pack runtime bench support
- package version: `v1.0.5`
- saved pack restore: `PF_MAC_UNPACKED_PACK=retro/gen-1/025-pikachu PF_MAC_UNPACKED_MODES=enabled PF_MAC_UNPACKED_WARMUP_MS=2000 PF_MAC_UNPACKED_SAMPLE_MS=3000 PF_MAC_UNPACKED_SAMPLE_INTERVAL_MS=1000 npm run bench:mac-unpacked-runtime` passed
- runtime smoke: `initial pack: retro/gen-1/025-pikachu`、tracked process count 4、avg ps cpu 2.400%、max ps cpu 2.900%、avg rss 369.3 MB、残プロセス 0
- 備考: 一時 userData の `settings.json` に保存済み pack を入れた packaged app 起動 smoke です。実画面でピカチュウが見えることの目視確認ではありませんが、最後に保存した pack を含む設定で起動・cleanup できることを確認します。

### 2026-06-22 macOS arm64 GUI screenshot attempt

- OS: macOS 26.5.1 / arm64
- PokeFollower commit: `580f3ca`
- package version: `v1.0.5`
- 生成コマンド: `npm run dist:mac -- --arm64 --dir --publish=never` passed
- package smoke: `node scripts/verify-package-smoke.cjs darwin arm64` passed
- evidence helper: `PF_MAC_GUI_PACK=retro/gen-1/025-pikachu npm run evidence:mac-gui` -> `status=blocked`
- saved pack restore: 一時 userData の `settings.json` に `retro/gen-1/025-pikachu` を設定して packaged app を起動
- screenshot: baseline / app capture とも `3600x2338`、non-black pixel `0`、changed ratio `0`
- process: tracked process count 4、残プロセス 0
- 備考: この Codex 実行環境では、アプリ未起動時の `screencapture` も全面黒を返しました。そのため、スクリーンショットは視覚 PASS 証跡として扱わず、macOS の実画面目視は Issue #17 の残タスクとして維持します。`status=candidate` の場合も、人間がスクリーンショットを確認するまでは PASS にしません。

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

### 2026-06-22 Linux WSLg saved pack restore smoke

- OS: Ubuntu 26.04 on WSL2 / WSLg（Windows host: rtx4090）
- セッション種別: WSLg（`DISPLAY=:0`, `WAYLAND_DISPLAY=wayland-0`）
- PokeFollower commit: `7a1317a`
- package version: `v1.0.5`
- 生成コマンド: `npm run dist:linux -- --dir --publish=never` passed
- package smoke: `node scripts/verify-package-smoke.cjs linux x64` passed
- saved pack restore: `PF_LINUX_UNPACKED_PACK=retro/gen-1/025-pikachu PF_LINUX_UNPACKED_MODES=enabled PF_LINUX_UNPACKED_WARMUP_MS=2000 PF_LINUX_UNPACKED_SAMPLE_MS=3000 PF_LINUX_UNPACKED_SAMPLE_INTERVAL_MS=1000 PF_LINUX_UNPACKED_ARGS=--no-sandbox npm run bench:linux-unpacked-runtime` passed
- runtime smoke: `initial pack: retro/gen-1/025-pikachu`、tracked process count 7、avg ps cpu 12.933%、max ps cpu 15.800%、avg rss 787.4 MB、残プロセス 0
- 備考: 一時 userData の `settings.json` に保存済み pack を入れた Linux unpacked package 起動 smoke です。実画面でピカチュウが見えることの目視確認ではありませんが、最後に保存した pack を含む設定で起動・cleanup できることを確認します。

### 2026-06-22 Linux WSLg GUI evidence attempt

- OS: Ubuntu 26.04 on WSL2 / WSLg（Windows host: rtx4090）
- PokeFollower commit: `c73472b`
- package version: `v1.0.5`
- source transfer: local `git archive` を `/tmp/pf-current-main` に展開
- 実行予定コマンド: `PF_LINUX_GUI_ARGS=--no-sandbox PF_LINUX_GUI_WARMUP_MS=5000 npm run evidence:linux-gui`
- result: `blocked before app launch`
- blocker 1: WSL 側から `github.com` の DNS 解決ができず、remote clone は `Could not resolve host: github.com` で失敗
- blocker 2: archive 転送後の `npm ci` は Windows 側の `/mnt/c/Program Files/nodejs/npm` を拾い、UNC path 非対応で失敗
- blocker detail: `Cannot find module 'C:\Windows\script\select-7z-arch.js'`
- runtime evidence: Linux native `node` が WSL PATH 上に存在せず、`evidence:linux-gui` の実行前に停止
- 備考: これは Linux GUI PASS 証跡ではありません。WSLg で helper を実行するには、WSL 内の Linux native Node/npm と GitHub DNS、またはネットワーク不要の依存導入手段が必要です。

### 2026-06-22 Linux WSLg GUI evidence candidate

- OS: Ubuntu 26.04 on WSL2 / WSLg（Windows host: rtx4090）
- セッション種別: WSLg（`DISPLAY=:0`, `WAYLAND_DISPLAY=wayland-0`）
- PokeFollower commit: `0b38da5`
- package version: `v1.0.5`
- source transfer: local `git archive` を WSL `/tmp/pf-current-main` に展開
- temporary Node: `/tmp/node-v24.16.0-linux-x64`（Node `v24.16.0`, npm `11.13.0`）
- 生成コマンド: `npm run dist:linux -- --dir --publish=never` passed
- package smoke: `node scripts/verify-package-smoke.cjs linux x64` passed
- evidence helper: `PF_LINUX_GUI_ARGS=--no-sandbox PF_LINUX_GUI_WARMUP_MS=5000 npm run evidence:linux-gui` -> `status=candidate`
- saved pack restore: 一時 userData の `settings.json` に `retro/gen-1/025-pikachu` を設定して packaged app を起動
- process/window: processCount 7、windowCount 4、viewableWindowCount 2、overlayLikeWindowCount 2、leftoverProcessCount 0
- X11 tools: `xdotool`, `xwininfo`, `xprop` available
- screenshot: `no supported screenshot command found`
- visual status: screenshot が取れないため visual non-evaluable。process/window count は UI correctness の代理指標ではありません。
- 備考: これは WSLg 上の machine-check candidate であり、Linux GUI PASS 証跡ではありません。tray / transparent overlay / click-through / always-on-top / fullscreen hide-restore は人間による視覚確認が必要です。

## Issue #17 の完了条件

- macOS の権限あり/なし両方でクラッシュせず、全画面判定の可否が説明できる。
- Linux AppImage の常駐・透明・クリック透過・最前面挙動を少なくとも1環境で確認済み。
- 検証できない Linux 環境差分は、未検証として README または docs に残す。

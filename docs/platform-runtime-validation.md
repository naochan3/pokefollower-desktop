# macOS / Linux 実機ランタイム検証

最終更新: 2026-06-22

Issue #17 の残タスクは、ソース上の best-effort 実装ではなく、実機での常駐・透明オーバーレイ・クリック透過・最前面・全画面抑制の確認です。この文書は、検証者が同じ観点で結果を残せるようにするためのチェックリストです。

## 共通方針

- 生成物は `release/` 配下だけを使い、ソース直起動の結果で release 版の挙動を代替しません。
- 検証時は一時ユーザーデータを使い、普段の `settings.json` を壊さないようにします。
- 検証後は PokeFollower の残プロセスがないことを確認します。
- OS 権限や外部コマンドがない場合は、アプリ全体ではなく「全画面自動非表示だけ」が無効になり、通常追従へ戻ることを期待します。

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
npm run dist:linux -- --publish=never
chmod +x release/*.AppImage
```

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

## Issue #17 の完了条件

- macOS の権限あり/なし両方でクラッシュせず、全画面判定の可否が説明できる。
- Linux AppImage の常駐・透明・クリック透過・最前面挙動を少なくとも1環境で確認済み。
- 検証できない Linux 環境差分は、未検証として README または docs に残す。

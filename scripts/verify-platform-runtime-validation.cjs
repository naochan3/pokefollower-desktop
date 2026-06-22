const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
const status = fs.readFileSync(path.join(root, "docs", "STATUS.md"), "utf8");
const validation = fs.readFileSync(path.join(root, "docs", "platform-runtime-validation.md"), "utf8");
const errors = [];

function expect(condition, message) {
  if (!condition) errors.push(message);
}

function expectIncludesAll(text, snippets, message) {
  const missing = snippets.filter((snippet) => !text.includes(snippet));
  expect(missing.length === 0, `${message}: missing ${missing.join(", ")}`);
}

expect(pkg.scripts?.["verify:runtime-validation"] === "node scripts/verify-platform-runtime-validation.cjs", "package.json must expose verify:runtime-validation");
expect(pkg.scripts?.["verify:local"]?.includes("npm run verify:runtime-validation"), "verify:local must include runtime validation docs guard");
expect(pkg.scripts?.["evidence:mac-gui"] === "node scripts/capture-mac-gui-evidence.cjs", "package.json must expose evidence:mac-gui");
expect(pkg.scripts?.["evidence:linux-gui"] === "node scripts/capture-linux-gui-evidence.cjs", "package.json must expose evidence:linux-gui");

for (const text of [
  "Issue #17",
  "自動検証で担保している範囲",
  "macOS smoke",
  "Linux AppImage smoke",
  "Accessibility / System Events",
  "xdotool",
  "xprop",
  "xwininfo",
  "X11",
  "Wayland",
  "透明オーバーレイ",
  "クリックが下のアプリへ透過",
  "always-on-top",
  "全画面アプリ前面時",
  "通常追従へ戻る",
  "残プロセス",
  "POKEFOLLOWER_ALLOW_TEST_USER_DATA",
  "POKEFOLLOWER_TEST_USER_DATA_DIR",
  "bench:linux-unpacked-runtime",
  "PF_LINUX_UNPACKED_ARGS=--no-sandbox",
  "PF_LINUX_GUI_PACK=retro/gen-1/025-pikachu",
  "PF_LINUX_GUI_ARGS=--no-sandbox",
  "npm run evidence:linux-gui",
  "screenshot backend は `gnome-screenshot` / `grim` / `spectacle` / `scrot` を順に試し",
  "失敗した backend も `attempts` に残します",
  "process / window / screenshot の証跡が不足する場合は `status=blocked`",
  "`PASS`: human-check",
  "`candidate`: machine-check",
  "`blocked`: アプリ起動",
  "processCount / windowCount / viewableWindowCount / overlayLikeWindowCount は OS window enumeration の補助値です",
  "代理指標ではありません",
  "visual non-evaluable",
  "PF_MAC_UNPACKED_PACK=retro/gen-1/025-pikachu",
  "PF_MAC_GUI_PACK=retro/gen-1/025-pikachu",
  "npm run evidence:mac-gui",
  "status=blocked",
  "status=candidate",
  "visible pixel ratio",
  "視覚 PASS 証跡として扱いません",
  "人間の確認なしに視覚 PASS 証跡として扱いません",
  "macOS arm64 GUI screenshot attempt",
  "baseline / app capture とも `3600x2338`、non-black pixel `0`、changed ratio `0`",
  "アプリ未起動時の `screencapture` も全面黒を返しました",
  "Linux WSLg GUI evidence attempt",
  "blocked before app launch",
  "Could not resolve host: github.com",
  "Windows 側の `/mnt/c/Program Files/nodejs/npm`",
  "Cannot find module 'C:\\Windows\\script\\select-7z-arch.js'",
  "Linux native `node` が WSL PATH 上に存在せず",
  "Linux WSLg GUI evidence candidate",
  "temporary Node: `/tmp/node-v24.16.0-linux-x64`（Node `v24.16.0`, npm `11.13.0`）",
  "PF_LINUX_GUI_WARMUP_MS=5000",
  "evidence:linux-gui` -> `status=candidate`",
  "processCount 7",
  "windowCount 4",
  "viewableWindowCount 2",
  "overlayLikeWindowCount 2",
  "leftoverProcessCount 0",
  "no supported screenshot command found",
  "WSLg 上の machine-check candidate",
  "screenshot が取れないため visual non-evaluable",
  "process/window count は UI correctness の代理指標ではありません",
  "tray / transparent overlay / click-through / always-on-top / fullscreen hide-restore は人間による視覚確認が必要です",
  "PF_LINUX_UNPACKED_PACK=retro/gen-1/025-pikachu",
  "AppImage 終了後、PokeFollower の残プロセスが 0",
  "Electron main process をブロックしません",
  "System Events 実行失敗時は、前面ウィンドウ情報を `null` として扱います",
  "`xdotool` / `xprop` / `xwininfo` 出力不足時は、前面ウィンドウ情報を `null` として扱います",
  "`main.js` は `null` の前面ウィンドウ情報を全画面扱いにせず",
  "実際の見え方と操作感は、引き続き実機目視で確認します",
  "手動 GUI 検証の証跡チェックリスト",
  "検証対象 artifact",
  "Release URL",
  "sha256",
  "常駐 UI",
  "スクリーンショット",
  "短い動画",
  "fullscreen 前",
  "fullscreen 中",
  "解除後",
  "saved pack restore",
  "NG/未確認項目",
  "未確認を PASS と書かず",
  "証跡ファイル",
  "WSLg は runtime smoke の参考環境であり、native Linux desktop の目視検証の代替ではありません",
  "machine-check",
  "human-check",
  "記録テンプレート",
]) {
  expect(validation.includes(text), `platform-runtime-validation.md missing: ${text}`);
}

for (const command of [
  "npm run dist:mac -- --arm64 --dir --publish=never",
  "node scripts/verify-package-smoke.cjs darwin arm64",
  "PF_MAC_UNPACKED_MODES=both",
  "npm run dist:linux -- --dir --publish=never",
  "node scripts/verify-package-smoke.cjs linux x64",
  "PF_LINUX_UNPACKED_MODES=both",
  "npm run dist:linux -- --publish=never",
]) {
  expect(validation.includes(command), `platform-runtime-validation.md missing command: ${command}`);
}

expect(
  readme.includes("WSLg は runtime smoke の参考環境であり、native Linux desktop の目視検証の代替ではありません。デスクトップ環境ごとの tray / 透明オーバーレイ / クリック透過 / 最前面挙動は追加検証が必要です。"),
  "README must keep Linux visual runtime validation limitation",
);
expect(
  status.includes("Linux AppImage の tray・透明・クリック透過・最前面は実機目視検証が必要"),
  "STATUS must keep Linux visual runtime validation roadmap item",
);
expectIncludesAll(status, [
  "Linux は AppImage 配布",
  "WSLg 起動 smoke",
  "saved pack restore smoke",
  "X11 window probe",
  "GUI evidence candidate",
  "native Linux desktop の目視検証の代替ではありません",
  "visual non-evaluable",
  "実機の tray・透明・クリック透過・最前面は未検証",
], "STATUS must keep Linux visual runtime known limitation");

if (errors.length > 0) {
  for (const error of errors) console.error(`[verify-platform-runtime-validation] ${error}`);
  process.exit(1);
}

console.log("[verify-platform-runtime-validation] ok: Issue #17 validation checklist and remaining gaps are documented");

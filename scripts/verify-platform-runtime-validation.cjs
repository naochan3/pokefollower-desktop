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

expect(pkg.scripts?.["verify:runtime-validation"] === "node scripts/verify-platform-runtime-validation.cjs", "package.json must expose verify:runtime-validation");
expect(pkg.scripts?.["verify:local"]?.includes("npm run verify:runtime-validation"), "verify:local must include runtime validation docs guard");

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
  "PF_MAC_UNPACKED_PACK=retro/gen-1/025-pikachu",
  "PF_LINUX_UNPACKED_PACK=retro/gen-1/025-pikachu",
  "AppImage 終了後、PokeFollower の残プロセスが 0",
  "Electron main process をブロックしません",
  "System Events 実行失敗時は、前面ウィンドウ情報を `null` として扱います",
  "`xdotool` / `xprop` / `xwininfo` 出力不足時は、前面ウィンドウ情報を `null` として扱います",
  "`main.js` は `null` の前面ウィンドウ情報を全画面扱いにせず",
  "実際の見え方と操作感は、引き続き実機目視で確認します",
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
  readme.includes("デスクトップ環境ごとの tray / 透明オーバーレイ / クリック透過 / 最前面挙動は追加検証が必要です。"),
  "README must keep Linux visual runtime validation limitation",
);
expect(
  status.includes("Linux AppImage の tray・透明・クリック透過・最前面は実機目視検証が必要"),
  "STATUS must keep Linux visual runtime validation roadmap item",
);
expect(
  status.includes("Linux は AppImage 配布と WSLg 起動 smoke まで（実機の tray・透明・クリック透過・最前面は未検証）。"),
  "STATUS must keep Linux visual runtime known limitation",
);

if (errors.length > 0) {
  for (const error of errors) console.error(`[verify-platform-runtime-validation] ${error}`);
  process.exit(1);
}

console.log("[verify-platform-runtime-validation] ok: Issue #17 validation checklist and remaining gaps are documented");

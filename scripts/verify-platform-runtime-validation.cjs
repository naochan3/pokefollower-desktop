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
  "npm run dist:linux -- --publish=never",
]) {
  expect(validation.includes(command), `platform-runtime-validation.md missing command: ${command}`);
}

expect(readme.includes("デスクトップ環境ごとの常駐・透明オーバーレイ挙動は追加検証が必要です。"), "README must keep Linux runtime validation limitation");
expect(status.includes("Linux AppImage の透明・常駐・クリック透過・最前面は実機検証が必要"), "STATUS must keep Linux runtime validation roadmap item");
expect(status.includes("Linux は AppImage ビルドまで（実機の常駐挙動は未検証）。"), "STATUS must keep Linux runtime known limitation");

if (errors.length > 0) {
  for (const error of errors) console.error(`[verify-platform-runtime-validation] ${error}`);
  process.exit(1);
}

console.log("[verify-platform-runtime-validation] ok: macOS/Linux runtime validation checklist covers Issue #17");

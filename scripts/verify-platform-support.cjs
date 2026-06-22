const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const fullscreenDetect = fs.readFileSync(path.join(root, "src", "main", "fullscreen-detect.js"), "utf8");
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
const status = fs.readFileSync(path.join(root, "docs", "STATUS.md"), "utf8");
const errors = [];

function fail(message) {
  errors.push(message);
}

function expect(condition, message) {
  if (!condition) fail(message);
}

function expectIncludesAll(text, snippets, message) {
  const missing = snippets.filter((snippet) => !text.includes(snippet));
  expect(missing.length === 0, `${message}: missing ${missing.join(", ")}`);
}

expect(pkg.build?.linux?.target?.includes("AppImage"), "package.json build.linux.target must include AppImage");
expect(pkg.scripts?.["dist:linux"] === "electron-builder --linux", "package.json dist:linux must build linux target");
expect(pkg.build?.mac?.target?.includes("dmg"), "package.json build.mac.target must include dmg");
expect(pkg.build?.mac?.target?.includes("zip"), "package.json build.mac.target must include zip");

expect(
  /let getForegroundInfo = \(\) => null;/.test(fullscreenDetect),
  "fullscreen-detect should default to no-op before platform-specific setup",
);
expect(
  /if \(process\.platform === "win32"\)/.test(fullscreenDetect),
  "fullscreen-detect should keep Win32 code gated behind process.platform === \"win32\"",
);
expect(
  /process\.platform === "darwin"/.test(fullscreenDetect) && /osascript/.test(fullscreenDetect),
  "fullscreen-detect should include best-effort macOS foreground detection",
);
expect(/function createMacForegroundInfoGetter/.test(fullscreenDetect), "fullscreen-detect should expose a testable macOS foreground getter");
expect(/x: r\.left/.test(fullscreenDetect), "Win32 foreground info should expose window x coordinate");
expect(/set windowPosition to position of frontWindow/.test(fullscreenDetect), "macOS foreground info should expose window position when allowed");
expect(/Absolute upper-left X/.test(fullscreenDetect), "Linux foreground info should expose xwininfo absolute position");
expect(
  /execTextAsync/.test(fullscreenDetect) && /createMacForegroundInfoGetter\(execTextAsync\)/.test(fullscreenDetect),
  "macOS/Linux foreground detection must avoid blocking the Electron main process",
);
expect(
  /process\.platform === "linux"/.test(fullscreenDetect) && /xdotool/.test(fullscreenDetect) && /xprop/.test(fullscreenDetect) && /xwininfo/.test(fullscreenDetect),
  "fullscreen-detect should include best-effort Linux foreground detection",
);
expect(/function createLinuxForegroundInfoGetter/.test(fullscreenDetect), "fullscreen-detect should expose a testable Linux foreground getter");

expect(
  readme.includes("全画面の自動判定は Windows では Win32、macOS では System Events / Accessibility、Linux では `xdotool` / `xprop` / `xwininfo` が利用できる環境で動作します。"),
  "README must describe fullscreen auto-hide platform requirements",
);
expect(
  readme.includes("Linux 版は AppImage のビルドと WSLg での起動 smoke までです。WSLg は runtime smoke の参考環境であり、native Linux desktop の目視検証の代替ではありません。デスクトップ環境ごとの tray / 透明オーバーレイ / クリック透過 / 最前面挙動は追加検証が必要です。"),
  "README must state Linux visual runtime behavior still needs validation",
);
expect(readme.includes("macOS（Apple Silicon / arm64）"), "README must describe published macOS support as Apple Silicon / arm64");
expect(!readme.includes("macOS（Apple Silicon / Intel）"), "README must not imply Intel macOS binaries are currently published");
expect(status.includes("現在は Windows / macOS(arm64) / Linux(AppImage) 向けに配布物を出せる状態。"), "STATUS must describe current distribution targets");
expect(status.includes("macOS arm64 dmg / zip"), "STATUS included assets must describe macOS arm64 assets");
expect(status.includes("全画面の自動非表示は macOS / Linux では権限や外部コマンドに依存します。"), "STATUS must state macOS/Linux fullscreen auto-hide dependencies");
expectIncludesAll(status, [
  "Linux は AppImage 配布",
  "WSLg 起動 smoke",
  "saved pack restore smoke",
  "X11 window probe",
  "GUI evidence candidate",
  "native Linux desktop の目視検証の代替ではありません",
  "visual non-evaluable",
  "実機の tray・透明・クリック透過・最前面は未検証",
], "STATUS must state Linux visual runtime is unverified");

if (errors.length > 0) {
  for (const error of errors) console.error(`[verify-platform-support] ${error}`);
  process.exit(1);
}

console.log("[verify-platform-support] ok: platform support docs and implementation boundaries are consistent");

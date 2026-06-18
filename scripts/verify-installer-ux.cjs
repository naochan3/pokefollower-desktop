const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
const errors = [];

function expect(condition, message) {
  if (!condition) errors.push(message);
}

const winTargets = pkg.build?.win?.target ?? [];
const nsis = pkg.build?.nsis ?? {};

expect(Array.isArray(winTargets) && winTargets.includes("nsis"), "Windows build target must include nsis");
expect(Array.isArray(winTargets) && winTargets.includes("zip"), "Windows build target must include zip");
expect(nsis.oneClick === true, "NSIS installer UX must remain oneClick: true");
expect(nsis.perMachine === false, "NSIS installer must remain perMachine: false");
expect(nsis.createDesktopShortcut === true, "NSIS installer must create a desktop shortcut");
expect(nsis.runAfterFinish === true, "NSIS installer must run the app after finish");

for (const text of [
  "途中の選択画面なし",
  "ワンクリック型",
  "自動でインストール",
  "タスクトレイ",
]) {
  expect(readme.includes(text), `README must describe installer UX: ${text}`);
}

if (errors.length > 0) {
  for (const error of errors) console.error(`[verify-installer-ux] ${error}`);
  process.exit(1);
}

console.log("[verify-installer-ux] ok: NSIS one-click installer settings and README UX text are consistent");

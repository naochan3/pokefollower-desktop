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

// ─── Windows インストーラの「安定名」契約 ─────────────────────────────
// updater.js は release asset 名が固定であることに依存し、README の DL リンクも
// releases/latest/download/<その名前> を指している。一方 electron-builder の
// NSIS 既定名は "${productName} Setup ${version}.${ext}" なので一致しない。
// artifactName を固定していない場合、両者を繋いでいるのは RELEASING.md に
// 書かれた手作業リネームだけ。この接続が切れると README の DL リンクと
// アプリ内アップデートが同時に壊れるので、名前の一致をここで固定する。
const updaterSource = fs.readFileSync(path.join(root, "src", "main", "updater.js"), "utf8");
const releasing = fs.readFileSync(path.join(root, "RELEASING.md"), "utf8");
const installerNameMatch = updaterSource.match(/WINDOWS_INSTALLER_NAME\s*=\s*"([^"]+)"/);
expect(!!installerNameMatch, "updater.js must define WINDOWS_INSTALLER_NAME");

if (installerNameMatch) {
  const installerName = installerNameMatch[1];
  expect(
    readme.includes(`releases/latest/download/${installerName}`),
    `README download link must point at ${installerName} (updater.js の期待名と一致させる)`,
  );
  const artifactName = nsis.artifactName;
  if (artifactName) {
    // 固定している場合は展開結果が期待名と一致すること（${ext} は exe）。
    const resolved = artifactName.replace(/\$\{ext\}/g, "exe").replace(/\$\{productName\}/g, pkg.build.productName);
    expect(
      resolved === installerName,
      `package.json build.nsis.artifactName は ${installerName} に解決されるべき (got ${resolved})`,
    );
  } else {
    // 固定していない場合は、手作業リネーム手順が RELEASING.md に残っていること。
    expect(
      releasing.includes(installerName),
      `RELEASING.md must document the rename to ${installerName}`
      + "（nsis.artifactName 未設定なので、この手順だけが updater.js と README を繋いでいる）",
    );
    expect(
      /cp\s+"release\/.*Setup.*\.exe"/.test(releasing),
      "RELEASING.md must show the release/<default name> → 安定名 のリネームコマンド",
    );
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(`[verify-installer-ux] ${error}`);
  process.exit(1);
}

console.log("[verify-installer-ux] ok: NSIS one-click installer settings and README UX text are consistent");

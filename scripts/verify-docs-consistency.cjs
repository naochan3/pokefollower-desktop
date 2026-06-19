const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const version = pkg.version;
const tag = `v${version}`;
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
const status = fs.readFileSync(path.join(root, "docs", "STATUS.md"), "utf8");
const releasing = fs.readFileSync(path.join(root, "RELEASING.md"), "utf8");

function fail(message) {
  console.error(`[verify-docs-consistency] ${message}`);
  process.exitCode = 1;
}

function expectIncludes(label, text, expected) {
  if (!text.includes(expected)) fail(`${label} missing: ${expected}`);
}

expectIncludes(
  "README macOS dmg link",
  readme,
  `releases/download/${tag}/PokeFollower-${version}-arm64.dmg`,
);
expectIncludes(
  "README macOS zip link",
  readme,
  `releases/download/${tag}/PokeFollower-${version}-arm64-mac.zip`,
);
expectIncludes("STATUS current version", status, `現在のバージョン: **${tag}**`);
expectIncludes("STATUS included version", status, `現在含まれているもの（${tag}）`);
expectIncludes("README Windows installer example", readme, `... ${version}.exe`);
expectIncludes(
  "README Windows latest link",
  readme,
  "releases/latest/download/PokeFollower-Setup.exe",
);
expectIncludes(
  "RELEASING Windows latest rule",
  releasing,
  "Windows ダウンロードリンクは `releases/latest/download/PokeFollower-Setup.exe`",
);
expectIncludes(
  "RELEASING macOS versioned rule",
  releasing,
  "macOS はアセット名にバージョンが入るため、README では `releases/download/v<ver>/...`",
);

if (/macOS 版は現在 \*\*v\d+\.\d+\.\d+/.test(readme)) {
  fail("README contains stale macOS-version warning text");
}

const staleVersions = [...readme.matchAll(/\b1\.0\.[01]\b/g)].map((match) => match[0]);
if (staleVersions.length > 0) {
  fail(`README contains stale v1.0.x examples: ${[...new Set(staleVersions)].join(", ")}`);
}

if (process.exitCode) process.exit(process.exitCode);
console.log(`[verify-docs-consistency] ok: docs match package version ${tag}`);

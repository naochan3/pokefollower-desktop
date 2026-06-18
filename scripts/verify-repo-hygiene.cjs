const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const root = path.join(__dirname, "..");
const gitignore = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const errors = [];

function expect(condition, message) {
  if (!condition) errors.push(message);
}

function gitLsFiles(args) {
  return execFileSync("git", ["ls-files", ...args], { cwd: root, encoding: "utf8" })
    .split(/\r?\n/)
    .filter(Boolean);
}

for (const pattern of ["node_modules/", "target/", "dist/", "out/", "build/", "release/", "*.exe"]) {
  expect(gitignore.split(/\r?\n/).includes(pattern), `.gitignore must include ${pattern}`);
}

expect(pkg.build?.directories?.output === "release", "electron-builder output directory must remain release");
expect(gitLsFiles(["release"]).length === 0, "release/ must not contain tracked files");
expect(gitLsFiles(["node_modules"]).length === 0, "node_modules/ must not contain tracked files");
expect(gitLsFiles(["crates/follower_core/target"]).length === 0, "Cargo target output must not contain tracked files");
expect(gitLsFiles(["native/pokefollower_core.wasm"]).length === 1, "native/pokefollower_core.wasm must remain tracked");
expect(gitLsFiles(["package-lock.json"]).length === 1, "package-lock.json must remain tracked for npm ci");

if (errors.length > 0) {
  for (const error of errors) console.error(`[verify-repo-hygiene] ${error}`);
  process.exit(1);
}

console.log("[verify-repo-hygiene] ok: generated outputs are ignored and required lock/artifact files are tracked");

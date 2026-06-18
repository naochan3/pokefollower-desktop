const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const workflowPath = path.join(root, ".github", "workflows", "ci.yml");
const packagePath = path.join(root, "package.json");
const workflow = fs.readFileSync(workflowPath, "utf8");
const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
const errors = [];

function expectIncludes(label, text) {
  if (!workflow.includes(text)) errors.push(`${label} missing: ${text}`);
}

function expectFile(relativePath) {
  if (!fs.existsSync(path.join(root, relativePath))) errors.push(`required file missing: ${relativePath}`);
}

for (const trigger of ["pull_request:", "push:", "workflow_dispatch:"]) {
  expectIncludes("workflow trigger", trigger);
}

expectIncludes("minimum permissions", "contents: read");
expectIncludes("concurrency", "cancel-in-progress: true");
expectIncludes("node version", 'NODE_VERSION: "22.12.0"');

for (const job of ["static-checks:", "unit-tests:", "rust-wasm-artifact:", "package-smoke:"]) {
  expectIncludes("required job", job);
}

for (const command of [
  "npm run verify:assets",
  "npm run verify:ci",
  "npm run verify:deps",
  "npm run verify:docs",
  "npm run verify:electron",
  "npm run verify:hygiene",
  "npm run verify:installer",
  "npm run verify:ipc",
  "npm run verify:overlay",
  "npm run verify:platform",
  "npm run verify:roadmap",
  "npm run verify:runtime",
  "npm run verify:settings",
  "npm run verify:signing",
  "npm run verify:wasm",
  "npm test",
  "npm run test:rust",
  "cargo fmt --manifest-path crates/follower_core/Cargo.toml --check",
  "npm run build:rust",
  "git diff --exit-code -- native/pokefollower_core.wasm",
  "node scripts/verify-package-smoke.cjs ${{ matrix.platform }} ${{ matrix.arch }}",
]) {
  expectIncludes("required command", command);
}

for (const os of ["ubuntu-latest", "windows-latest", "macos-latest"]) {
  expectIncludes("test OS matrix", os);
}

for (const smoke of [
  "command: npm run dist:win -- --dir",
  "platform: win32",
  "arch: x64",
  "command: npm run dist:mac -- --arm64 --dir",
  "platform: darwin",
  "arch: arm64",
  "command: npm run dist:linux -- --dir",
  "platform: linux",
]) {
  expectIncludes("package smoke matrix", smoke);
}

if (!pkg.scripts || !pkg.scripts["verify:local"]) {
  errors.push("package.json verify:local script is missing");
} else {
  for (const command of [
    "npm run verify:assets",
    "npm run verify:ci",
    "npm run verify:deps",
    "npm run verify:docs",
    "npm run verify:electron",
    "npm run verify:hygiene",
    "npm run verify:installer",
    "npm run verify:ipc",
    "npm run verify:overlay",
    "npm run verify:platform",
    "npm run verify:roadmap",
    "npm run verify:runtime",
    "npm run verify:settings",
    "npm run verify:signing",
    "npm run verify:wasm",
    "npm test",
  ]) {
    if (!pkg.scripts["verify:local"].includes(command)) {
      errors.push(`package.json verify:local must include ${command}`);
    }
  }
}

for (const [scriptName, scriptCommand] of [
  ["bench:dev-runtime", "node scripts/bench-dev-runtime.cjs"],
  ["bench:pack-list", "node scripts/bench-pack-list.cjs"],
]) {
  if (pkg.scripts?.[scriptName] !== scriptCommand) {
    errors.push(`package.json ${scriptName} script is missing or changed`);
  }
}

for (const file of [
  "src/main/frame-routing.js",
  "src/main/fullscreen-policy.js",
  "tests/frame-routing.test.js",
  "tests/fullscreen-policy.test.js",
  "tests/pack-reader.test.js",
  "tests/rust-follower-core.test.js",
  "scripts/bench-dev-runtime.cjs",
  "scripts/bench-pack-list.cjs",
  "scripts/verify-dependency-metadata.cjs",
  "scripts/verify-electron-security.cjs",
  "scripts/verify-repo-hygiene.cjs",
  "scripts/verify-installer-ux.cjs",
  "scripts/verify-ipc-routing.cjs",
  "scripts/verify-overlay-cache.cjs",
  "scripts/verify-roadmap-issues.cjs",
  "scripts/verify-runtime-guards.cjs",
  "scripts/verify-settings-ui.cjs",
  "scripts/verify-signing-status.cjs",
  "scripts/verify-wasm-artifact.cjs",
]) {
  expectFile(file);
}

if (errors.length > 0) {
  for (const error of errors) console.error(`[verify-ci-workflow] ${error}`);
  process.exit(1);
}

console.log("[verify-ci-workflow] ok: CI workflow contains required validation gates");

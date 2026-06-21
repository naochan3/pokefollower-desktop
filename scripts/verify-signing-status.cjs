const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
const status = fs.readFileSync(path.join(root, "docs", "STATUS.md"), "utf8");
const releasing = fs.readFileSync(path.join(root, "RELEASING.md"), "utf8");
const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "ci.yml"), "utf8");
const errors = [];

function fail(message) {
  errors.push(message);
}

function hasAny(object, keys) {
  return keys.some((key) => Object.prototype.hasOwnProperty.call(object || {}, key));
}

if (hasAny(pkg.build?.win, ["certificateFile", "certificatePassword", "certificateSubjectName", "certificateSha1"])) {
  fail("package.json build.win contains signing certificate configuration while docs say Windows is unsigned");
}

if (hasAny(pkg.build?.mac, ["identity", "notarize", "hardenedRuntime", "gatekeeperAssess"])) {
  fail("package.json build.mac contains signing/notarization configuration while docs say macOS is unsigned/unnotarized");
}

for (const secret of ["CSC_LINK", "CSC_KEY_PASSWORD", "APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID"]) {
  if (workflow.includes(secret)) fail(`CI workflow references signing/notarization secret ${secret}`);
}

if (!readme.includes("未署名のため、初回は Windows SmartScreen")) {
  fail("README must warn that Windows builds are unsigned");
}
if (!readme.includes("未署名・未公証のため、初回は Gatekeeper")) {
  fail("README must warn that macOS builds are unsigned and unnotarized");
}
if (!status.includes("macOS / Windows とも **未署名**")) {
  fail("docs/STATUS.md must state Windows/macOS are unsigned");
}
if (!releasing.includes("通常の `npm run dist:win` / `npm run dist:mac` は未署名のままです。")) {
  fail("RELEASING.md must state normal Windows/macOS builds stay unsigned");
}
if (!releasing.includes("npm run dist:win:signed") || !releasing.includes("npm run dist:mac:signed")) {
  fail("RELEASING.md must document signed Windows/macOS build commands");
}
if (!releasing.includes("forceCodeSigning: true") || !releasing.includes("資格情報がない環境では、未署名 artifact を黙って出さずに失敗する")) {
  fail("RELEASING.md must document signed build fail-closed behavior");
}
if (!releasing.includes("秘密情報はリポジトリ、Issue、ログ、Release notes に書かず")) {
  fail("RELEASING.md must document signing secret handling boundaries");
}

if (errors.length > 0) {
  for (const error of errors) console.error(`[verify-signing-status] ${error}`);
  process.exit(1);
}

console.log("[verify-signing-status] ok: signing configuration and unsigned docs are consistent");

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
const status = fs.readFileSync(path.join(root, "docs", "STATUS.md"), "utf8");
const releasing = fs.readFileSync(path.join(root, "RELEASING.md"), "utf8");
const workflowsDir = path.join(root, ".github", "workflows");
const workflowFiles = fs
  .readdirSync(workflowsDir)
  .filter((file) => file.endsWith(".yml") || file.endsWith(".yaml"))
  .map((file) => [file, fs.readFileSync(path.join(workflowsDir, file), "utf8")]);
const unsignedConfig = require(path.join(root, "electron-builder.unsigned.cjs"));
const signedConfig = require(path.join(root, "electron-builder.signed.cjs"));
const entitlementPath = "build/signed/entitlements.mac.plist";
const inheritEntitlementPath = "build/signed/entitlements.mac.inherit.plist";
const defaultEntitlementPath = "build/entitlements.mac.plist";
const defaultInheritEntitlementPath = "build/entitlements.mac.inherit.plist";
const entitlements = fs.readFileSync(path.join(root, entitlementPath), "utf8");
const inheritEntitlements = fs.readFileSync(path.join(root, inheritEntitlementPath), "utf8");
const errors = [];

function fail(message) {
  errors.push(message);
}

function hasAny(object, keys) {
  return keys.some((key) => Object.prototype.hasOwnProperty.call(object || {}, key));
}

function stripXmlComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, "");
}

function hasTruePlistKey(text, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`<key>\\s*${escapedKey}\\s*</key>\\s*<true\\s*/>`, "u").test(stripXmlComments(text));
}

function hasFalsePlistKey(text, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`<key>\\s*${escapedKey}\\s*</key>\\s*<false\\s*/>`, "u").test(stripXmlComments(text));
}

if (hasAny(pkg.build?.win, ["certificateFile", "certificatePassword", "certificateSubjectName", "certificateSha1"])) {
  fail("package.json build.win contains signing certificate configuration while docs say Windows is unsigned");
}

if (hasAny(pkg.build?.mac, ["identity", "sign", "notarize", "hardenedRuntime", "gatekeeperAssess"])) {
  fail("package.json build.mac contains signing/notarization configuration while docs say macOS is unsigned/unnotarized");
}

for (const secret of [
  "CSC_LINK",
  "CSC_KEY_PASSWORD",
  "CSC_NAME",
  "WIN_CSC_LINK",
  "WIN_CSC_KEY_PASSWORD",
  "APPLE_ID",
  "APPLE_APP_SPECIFIC_PASSWORD",
  "APPLE_TEAM_ID",
  "APPLE_API_KEY",
  "APPLE_API_KEY_ID",
  "APPLE_API_ISSUER",
  "APPLE_KEYCHAIN",
  "APPLE_KEYCHAIN_PROFILE",
]) {
  for (const [file, workflow] of workflowFiles) {
    if (workflow.includes(secret)) fail(`${file} references signing/notarization secret ${secret}`);
  }
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
if (
  !releasing.includes("electron-builder.unsigned.cjs") ||
  !releasing.includes("signExecutable: false") ||
  !releasing.includes("identity: null") ||
  !releasing.includes("notarize: false")
) {
  fail("RELEASING.md must document normal Windows/macOS build explicit unsigned configuration");
}
if (!releasing.includes("npm run dist:win:signed") || !releasing.includes("npm run dist:mac:signed")) {
  fail("RELEASING.md must document signed Windows/macOS build commands");
}
if (!releasing.includes("forceCodeSigning: true") || !releasing.includes("資格情報がない環境では、未署名 artifact を黙って出さずに失敗する")) {
  fail("RELEASING.md must document signed build fail-closed behavior");
}
if (!releasing.includes("hardenedRuntime: true") || !releasing.includes(entitlementPath)) {
  fail("RELEASING.md must document macOS signed build hardened runtime and entitlements");
}
if (!releasing.includes("秘密情報はリポジトリ、Issue、ログ、Release notes に書かず")) {
  fail("RELEASING.md must document signing secret handling boundaries");
}
if (pkg.scripts?.dist !== "electron-builder --win --x64 --config electron-builder.unsigned.cjs") {
  fail("package.json dist must use electron-builder.unsigned.cjs");
}
if (pkg.scripts?.["dist:win"] !== "electron-builder --win --x64 --config electron-builder.unsigned.cjs") {
  fail("package.json dist:win must use electron-builder.unsigned.cjs");
}
if (pkg.scripts?.["dist:mac"] !== "electron-builder --mac --config electron-builder.unsigned.cjs") {
  fail("package.json dist:mac must use electron-builder.unsigned.cjs");
}
if (pkg.scripts?.["dist:mac:signed"] !== "electron-builder --mac --config electron-builder.signed.cjs") {
  fail("package.json dist:mac:signed must use electron-builder.signed.cjs");
}
if (unsignedConfig.win?.signExecutable !== false) {
  fail("electron-builder.unsigned.cjs must disable Windows signing");
}
if (unsignedConfig.mac?.identity !== null) {
  fail("electron-builder.unsigned.cjs must disable mac identity auto-detection");
}
if (unsignedConfig.mac?.hardenedRuntime !== false) {
  fail("electron-builder.unsigned.cjs must keep mac hardenedRuntime disabled");
}
if (unsignedConfig.mac?.notarize !== false) {
  fail("electron-builder.unsigned.cjs must keep mac notarization disabled");
}
if (signedConfig.forceCodeSigning !== true) {
  fail("electron-builder.signed.cjs must enable forceCodeSigning");
}
if (signedConfig.mac?.identity === null || signedConfig.mac?.sign === null) {
  fail("electron-builder.signed.cjs must not inherit unsigned signing opt-outs");
}
if (signedConfig.mac?.hardenedRuntime !== true) {
  fail("electron-builder.signed.cjs must enable mac hardenedRuntime for notarization");
}
if (signedConfig.mac?.entitlements !== entitlementPath) {
  fail(`electron-builder.signed.cjs must point mac entitlements at ${entitlementPath}`);
}
if (signedConfig.mac?.entitlementsInherit !== inheritEntitlementPath) {
  fail(`electron-builder.signed.cjs must point mac inherited entitlements at ${inheritEntitlementPath}`);
}
if (signedConfig.mac?.notarize !== true) {
  fail("electron-builder.signed.cjs must enable mac notarization");
}
for (const filePath of [defaultEntitlementPath, defaultInheritEntitlementPath]) {
  if (fs.existsSync(path.join(root, filePath))) {
    fail(`${filePath} must not exist because electron-builder can auto-detect it in normal mac builds`);
  }
}
for (const [filePath, text] of [
  [entitlementPath, entitlements],
  [inheritEntitlementPath, inheritEntitlements],
]) {
  if (!hasTruePlistKey(text, "com.apple.security.cs.allow-jit")) {
    fail(`${filePath} must enable com.apple.security.cs.allow-jit`);
  }
  if (hasFalsePlistKey(text, "com.apple.security.cs.allow-jit")) {
    fail(`${filePath} must not disable com.apple.security.cs.allow-jit`);
  }
  if (text.includes("com.apple.security.cs.allow-unsigned-executable-memory")) {
    fail(`${filePath} must not enable com.apple.security.cs.allow-unsigned-executable-memory for Electron 12+`);
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(`[verify-signing-status] ${error}`);
  process.exit(1);
}

console.log("[verify-signing-status] ok: signing configuration and unsigned docs are consistent");

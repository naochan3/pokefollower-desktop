const fs = require("node:fs");
const path = require("node:path");
const asar = require("@electron/asar");

const root = path.join(__dirname, "..");
const releaseDir = path.join(root, "release");
const targetPlatform = process.argv[2] || process.platform;
const targetArch = process.argv[3] || process.arch;
const isCrossPlatformPackage = process.platform !== targetPlatform || process.arch !== targetArch;
const expectedNativePackage = `/node_modules/@koromix/koffi-${targetPlatform}-${targetArch}`;
const rootPackage = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const nativeSubdir = targetPlatform === "win32" ? `win32_${targetArch}` : `${targetPlatform}_${targetArch}`;
const expectedUnpackedNative = path.join(
  "node_modules",
  "@koromix",
  `koffi-${targetPlatform}-${targetArch}`,
  nativeSubdir,
  "koffi.node",
);

function findAppAsars(dir) {
  const found = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isFile() && entry.name === "app.asar") found.push(fullPath);
    if (entry.isDirectory()) {
      found.push(...findAppAsars(fullPath));
    }
  }
  return found;
}

function matchesTargetPlatform(appAsar) {
  const relative = path.relative(releaseDir, appAsar).replace(/\\/g, "/");
  if (targetPlatform === "win32") return relative === "win-unpacked/resources/app.asar";
  if (targetPlatform === "linux") return relative === "linux-unpacked/resources/app.asar";
  if (targetPlatform === "darwin") {
    return /^mac(?:-|\/)/.test(relative) && relative.endsWith(".app/Contents/Resources/app.asar");
  }
  return true;
}

function fail(message) {
  console.error(`[verify-package-smoke] ${message}`);
  process.exit(1);
}

if (!fs.existsSync(releaseDir)) fail(`release directory not found: ${releaseDir}`);

const appAsars = findAppAsars(releaseDir);
if (appAsars.length === 0) fail("app.asar not found under release/");

const matchingAppAsars = appAsars.filter(matchesTargetPlatform);
if (matchingAppAsars.length !== 1) {
  const candidates = appAsars.map((file) => path.relative(root, file)).join(", ");
  fail(`expected exactly one ${targetPlatform} app.asar; found ${matchingAppAsars.length}. Candidates: ${candidates}`);
}

const [appAsar] = matchingAppAsars;
const unpackedDir = `${appAsar}.unpacked`;

const files = asar.listPackage(appAsar).map((file) => {
  const normalized = file.replace(/\\/g, "/");
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
});
const fileSet = new Set(files);
if (!fileSet.has("/package.json")) fail("package.json missing from app.asar");
if (!fileSet.has("/native/pokefollower_core.wasm")) {
  fail("native/pokefollower_core.wasm missing from app.asar");
}
for (const requiredSource of [
  "/src/main/main.js",
  "/src/main/app-reactions.js",
  "/src/main/favorite-rotation.js",
  "/src/main/app-protocol-path.js",
  "/src/main/asset-path.js",
  "/src/main/codex-notify-cli.js",
  "/src/main/frame-routing.js",
  "/src/main/fullscreen-policy.js",
  "/src/main/codex-notification-watcher.js",
  "/src/main/notification-companion.js",
  "/src/main/notification-queue.js",
  "/src/main/pack-reader.js",
  "/src/main/work-watch.js",
  "/src/overlay/overlay.js",
  "/src/overlay/overlay-preload.js",
  "/src/overlay/overlay.html",
  "/src/settings/settings.js",
  "/src/settings/settings-preload.js",
  "/src/settings/settings.html",
  "/assets/packs/index.json",
  "/assets/packs/jp-names.json",
  "/assets/packs/retro/gen-1/025-pikachu.json",
  "/assets/ui/gen-1/025-pikachu.png",
  "/assets/raw/gen-1/025-pikachu/Idle-Anim.webp",
  "/assets/raw/gen-1/025-pikachu/Walk-Anim.webp",
  "/assets/icons/pokeball-32.png",
  "/assets/icons/pokeball-256.png",
  "/assets/icons/PokeFollower.icns",
]) {
  if (!fileSet.has(requiredSource)) fail(`${requiredSource} missing from app.asar`);
}

const packagedPackage = JSON.parse(asar.extractFile(appAsar, "package.json").toString("utf8"));
if (packagedPackage.name !== rootPackage.name) {
  fail(`packaged package name ${packagedPackage.name} does not match root ${rootPackage.name}`);
}
if (packagedPackage.version !== rootPackage.version) {
  fail(`packaged package version ${packagedPackage.version} does not match root ${rootPackage.version}`);
}
if (packagedPackage.main !== rootPackage.main) {
  fail(`packaged package main ${packagedPackage.main} does not match root ${rootPackage.main}`);
}

const packagedNativeDeps = files
  .filter((file) => file.startsWith("/node_modules/@koromix/koffi-"))
  .map((file) => file.split("/").slice(0, 4).join("/"));
const uniqueNativeDeps = [...new Set(packagedNativeDeps)].sort();

if (!uniqueNativeDeps.includes(expectedNativePackage)) {
  fail(`expected native dependency ${expectedNativePackage}; found ${uniqueNativeDeps.join(", ") || "none"}`);
}

const wrongNativeDeps = uniqueNativeDeps.filter((dep) => dep !== expectedNativePackage);
if (!isCrossPlatformPackage && wrongNativeDeps.length > 0) {
  fail(`unexpected native dependencies for ${targetPlatform}-${targetArch}: ${wrongNativeDeps.join(", ")}`);
}

const unpackedNativePath = path.join(unpackedDir, expectedUnpackedNative);
if (!fs.existsSync(unpackedNativePath)) {
  fail(`expected unpacked native binary missing: ${path.relative(root, unpackedNativePath)}`);
}
const unpackedNativeStat = fs.statSync(unpackedNativePath);
if (!unpackedNativeStat.isFile() || unpackedNativeStat.size <= 0) {
  fail(`expected unpacked native binary is invalid: ${path.relative(root, unpackedNativePath)}`);
}

console.log(
  `[verify-package-smoke] ok: ${path.relative(root, appAsar)} contains v${packagedPackage.version}, WASM, and ${expectedNativePackage}; unpacked ${expectedUnpackedNative}${wrongNativeDeps.length ? `; cross-build extras: ${wrongNativeDeps.join(", ")}` : ""}`,
);

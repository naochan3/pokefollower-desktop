const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const defaultTargetDir = path.join(root, "crates", "follower_core", "target");
const targetDir = process.env.CARGO_TARGET_DIR
  ? path.resolve(root, process.env.CARGO_TARGET_DIR)
  : defaultTargetDir;
const source = path.join(
  targetDir,
  "wasm32-unknown-unknown",
  "release",
  "pokefollower_core.wasm",
);
const destDir = path.join(root, "native");
const dest = path.join(destDir, "pokefollower_core.wasm");

if (!fs.existsSync(source)) {
  throw new Error(`Rust WASM artifact not found: ${source}`);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(source, dest);
console.log(`copied ${path.relative(root, source)} -> ${path.relative(root, dest)}`);

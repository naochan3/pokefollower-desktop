const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const targetDir = process.env.CARGO_TARGET_DIR
  ? path.resolve(root, process.env.CARGO_TARGET_DIR)
  : path.join(root, "crates", "follower_core", "target");
const source = path.join(
  targetDir,
  "wasm32-unknown-unknown",
  "release",
  "pokefollower_core.wasm",
);
const destDir = path.join(root, "native");
const dest = path.join(destDir, "pokefollower_core.wasm");

if (!fs.existsSync(source)) {
  console.error(
    `[copy-rust-core] ビルド成果物が見つかりません: ${path.relative(root, source)}\n` +
      `先に \`npm run build:rust\`（cargo + wasm32-unknown-unknown ターゲット）を実行してください。`,
  );
  process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(source, dest);
console.log(`copied ${path.relative(root, source)} -> ${path.relative(root, dest)}`);

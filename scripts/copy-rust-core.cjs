const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const source = path.join(
  root,
  "crates",
  "follower_core",
  "target",
  "wasm32-unknown-unknown",
  "release",
  "pokefollower_core.wasm",
);
const destDir = path.join(root, "native");
const dest = path.join(destDir, "pokefollower_core.wasm");

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(source, dest);
console.log(`copied ${path.relative(root, source)} -> ${path.relative(root, dest)}`);

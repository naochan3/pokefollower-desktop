const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const root = path.join(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const cargoToml = fs.readFileSync(path.join(root, "crates", "follower_core", "Cargo.toml"), "utf8");
const copyScript = fs.readFileSync(path.join(root, "scripts", "copy-rust-core.cjs"), "utf8");
const toolchainPath = path.join(root, "rust-toolchain.toml");
const toolchain = fs.existsSync(toolchainPath) ? fs.readFileSync(toolchainPath, "utf8") : "";
const pinnedRustc = toolchain.match(/^channel\s*=\s*"(\d+\.\d+\.\d+)"/m)?.[1];
const wasmPath = path.join(root, "native", "pokefollower_core.wasm");
const errors = [];

function expect(condition, message) {
  if (!condition) errors.push(message);
}

function gitLsFiles(file) {
  return execFileSync("git", ["ls-files", file], { cwd: root, encoding: "utf8" })
    .split(/\r?\n/)
    .filter(Boolean);
}

expect(fs.existsSync(wasmPath), "native/pokefollower_core.wasm must exist");
expect(gitLsFiles("native/pokefollower_core.wasm").length === 1, "native/pokefollower_core.wasm must be tracked");

if (fs.existsSync(wasmPath)) {
  const wasm = fs.readFileSync(wasmPath);
  expect(wasm.length > 1024, `native/pokefollower_core.wasm is unexpectedly small: ${wasm.length} bytes`);
  expect(wasm.subarray(0, 4).equals(Buffer.from([0x00, 0x61, 0x73, 0x6d])), "WASM magic header is invalid");
  expect(wasm.subarray(4, 8).equals(Buffer.from([0x01, 0x00, 0x00, 0x00])), "WASM version header is invalid");
  if (pinnedRustc) {
    expect(
      wasm.includes(Buffer.from(`${pinnedRustc} (`)),
      `native/pokefollower_core.wasm must be built with the pinned rustc ${pinnedRustc} (rebuild with \`npm run build:rust\`)`,
    );
  }
}

expect(Boolean(pinnedRustc), 'rust-toolchain.toml must pin an exact rustc version (channel = "X.Y.Z")');
expect(toolchain.includes('"wasm32-unknown-unknown"'), "rust-toolchain.toml must include the wasm32-unknown-unknown target");
expect(toolchain.includes('"rustfmt"'), "rust-toolchain.toml must include rustfmt for cargo fmt --check");
expect(cargoToml.includes('name = "pokefollower_core"'), "Cargo package name must remain pokefollower_core");
expect(cargoToml.includes('crate-type = ["cdylib", "rlib"]'), "Cargo lib crate-type must include cdylib and rlib");
expect(pkg.scripts?.["build:rust"]?.includes("--target wasm32-unknown-unknown"), "build:rust must target wasm32-unknown-unknown");
expect(pkg.scripts?.["build:rust"]?.includes("node scripts/copy-rust-core.cjs"), "build:rust must copy the WASM artifact");
expect(copyScript.includes("process.env.CARGO_TARGET_DIR"), "copy-rust-core must honor CARGO_TARGET_DIR");
expect(copyScript.includes('"wasm32-unknown-unknown"'), "copy-rust-core must read the wasm32 target directory");
expect(copyScript.includes('"pokefollower_core.wasm"'), "copy-rust-core must copy pokefollower_core.wasm");
expect(copyScript.includes("fs.copyFileSync(source, dest)"), "copy-rust-core must copy source to native destination");

if (errors.length > 0) {
  for (const error of errors) console.error(`[verify-wasm-artifact] ${error}`);
  process.exit(1);
}

console.log("[verify-wasm-artifact] ok: committed WASM artifact and Rust build wiring are consistent");

const fs = require("node:fs");
const path = require("node:path");

function createRustFollowerCore(rootDir) {
  const candidates = [
    path.join(rootDir, "native", "pokefollower_core.wasm"),
    path.join(process.resourcesPath || "", "app.asar", "native", "pokefollower_core.wasm"),
    path.join(process.resourcesPath || "", "app", "native", "pokefollower_core.wasm"),
  ];
  const wasmPath = candidates.find((candidate) => candidate && fs.existsSync(candidate));
  if (!wasmPath) return null;

  try {
    const bytes = fs.readFileSync(wasmPath);
    const module = new WebAssembly.Module(bytes);
    const instance = new WebAssembly.Instance(module, {});
    const e = instance.exports;
    const required = ["pf_set_config", "pf_reset_to", "pf_update_cursor", "pf_step", "pf_x", "pf_y", "pf_walking"];
    if (!required.every((name) => typeof e[name] === "function")) return null;
    return {
      backend: "rust-wasm",
      setConfig({ offset, lerp }) {
        e.pf_set_config(offset, lerp);
      },
      resetTo(x, y, now) {
        e.pf_reset_to(x, y, now);
      },
      updateCursor(x, y, now) {
        e.pf_update_cursor(x, y, now);
      },
      step(dtMs) {
        e.pf_step(dtMs);
        return { x: e.pf_x(), y: e.pf_y(), walking: e.pf_walking() === 1 };
      },
    };
  } catch (e) {
    console.error("[rust-follower-core] failed to load; falling back to JS:", e && e.message);
    return null;
  }
}

module.exports = { createRustFollowerCore };

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const consoleMessagePath = path.join(root, "scripts", "lib", "console-message.cjs");
const processExitPath = path.join(root, "scripts", "lib", "wait-for-process-exit.cjs");
const overlaySource = fs.readFileSync(path.join(root, "scripts", "verify-overlay-sprite-render.cjs"), "utf8");
const settingsSource = fs.readFileSync(path.join(root, "scripts", "verify-settings-ui-render.cjs"), "utf8");
const macSource = fs.readFileSync(path.join(root, "scripts", "verify-mac-distribution.cjs"), "utf8");

function getNormalizer() {
  return fs.existsSync(consoleMessagePath) ? require(consoleMessagePath) : null;
}

function getProcessExitWaiter() {
  return fs.existsSync(processExitPath) ? require(processExitPath) : null;
}

describe("render and distribution verification gates", () => {
  it("normalizes current Electron console-message details", () => {
    const normalize = getNormalizer();
    expect(normalize, "shared console-message normalizer must exist").toBeTypeOf("function");
    if (!normalize) return;
    expect(normalize({ level: "error", message: "renderer failure" })).toEqual({
      level: "error",
      message: "renderer failure",
      isError: true,
    });
  });

  it("supports legacy and details-object console-message arguments", () => {
    const normalize = getNormalizer();
    expect(normalize, "shared console-message normalizer must exist").toBeTypeOf("function");
    if (!normalize) return;
    expect(normalize({}, 3, "legacy failure")).toEqual({
      level: 3,
      message: "legacy failure",
      isError: true,
    });
    expect(normalize({}, { level: "error", message: "details failure" })).toEqual({
      level: "error",
      message: "details failure",
      isError: true,
    });
    expect(normalize({ level: "warning", message: "warning" }).isError).toBe(false);
  });

  it.each([
    ["overlay", overlaySource],
    ["settings", settingsSource],
  ])("%s render gate uses the shared console-message normalizer", (_name, source) => {
    expect(source).toContain('on("console-message", (...args) => {');
    expect(source).toContain("readConsoleMessage(...args)");
  });

  it("waits for settings navigation to finish before using the new document", () => {
    expect(settingsSource).toContain("async function reloadAndWait()");
    expect(settingsSource).toContain('once("did-finish-load"');
    expect(settingsSource).toContain("await reloadAndWait()");
    expect(settingsSource).not.toContain("if (win.webContents.getURL()) win.reload();");
  });

  it("observes an early child exit without blocking the event loop", async () => {
    const waitForProcessExit = getProcessExitWaiter();
    expect(waitForProcessExit, "async process-exit waiter must exist").toBeTypeOf("function");
    if (!waitForProcessExit) return;
    const child = spawn(process.execPath, ["-e", "process.exit(19)"], { stdio: "ignore" });
    await expect(waitForProcessExit(child, 1000)).resolves.toEqual({ code: 19, signal: null });
  });

  it("returns after the launch deadline while a process is still alive", async () => {
    const waitForProcessExit = getProcessExitWaiter();
    expect(waitForProcessExit, "async process-exit waiter must exist").toBeTypeOf("function");
    if (!waitForProcessExit) return;
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
    try {
      await expect(waitForProcessExit(child, 20)).resolves.toBeNull();
    } finally {
      child.kill();
    }
  });

  it("uses the asynchronous process-exit waiter for the Mac launch probe", () => {
    expect(macSource).toContain("async function main()");
    expect(macSource).toContain("await waitForProcessExit(child, launchMs)");
    expect(macSource).not.toContain('execFileSync("sleep"');
  });
});

// Real X11 input-routing acceptance for Electron's resize/ignore-mouse regression.
// Run under an isolated X server: xvfb-run -a node scripts/verify-x11-click-through.cjs
// PF_X11_SCALE=1 or 2 selects a startup scale; this does NOT test live DPI changes.
// xdotool uses XTest input, rather than webContents.sendInputEvent (which bypasses
// the X server's input shape and cannot detect this regression).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const scale = Number(process.env.PF_X11_SCALE || "1");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function xdotool(...args) {
  return execFileSync("xdotool", args.map(String), { encoding: "utf8", timeout: 3000 });
}

function windowId(win) {
  assert.equal(os.endianness(), "LE", "X11 handle decoding requires little endian");
  return String(win.getNativeWindowHandle().readUInt32LE(0));
}

function geometry(win) {
  const output = xdotool("getwindowgeometry", "--shell", windowId(win));
  const fields = Object.fromEntries(output.trim().split("\n").map((line) => line.split("=")));
  const rect = Object.fromEntries(["X", "Y", "WIDTH", "HEIGHT"].map((key) => [key, Number(fields[key])]));
  assert.ok(Object.values(rect).every(Number.isFinite), `invalid X11 geometry: ${output}`);
  assert.ok(rect.WIDTH > 0 && rect.HEIGHT > 0, "window must have nonempty X11 bounds");
  return rect;
}

async function runElectronMain() {
  const { app, BrowserWindow, screen } = require("electron");
  // Parent owns the disposable directory and removes it after Electron has exited.
  assert.ok(process.env.PF_X11_USER_DATA, "missing isolated userData");
  app.setPath("userData", process.env.PF_X11_USER_DATA);
  const watchdog = setTimeout(() => {
    console.error("[verify-x11-click-through] timed out");
    app.exit(1);
  }, 30000);
  let receiver;
  let overlay;
  try {
    await app.whenReady();
    assert.equal(screen.getPrimaryDisplay().scaleFactor, scale, "requested startup scale must actually apply");
    const options = {
      frame: false,
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
    };
    receiver = new BrowserWindow({ ...options, x: 80, y: 80, width: 500, height: 360 });
    // Match the production transparent, non-focusable overlay's native options.
    overlay = new BrowserWindow({
      ...options, x: 100, y: 100, width: 280, height: 220,
      transparent: true, resizable: false, movable: false, focusable: false,
      skipTaskbar: true, hasShadow: false, alwaysOnTop: true,
    });
    const page = (background) => `data:text/html,${encodeURIComponent(`<!doctype html><html><body style="margin:0;min-height:100vh;background:${background}"><script>window.clicks=0;document.addEventListener('mousedown',()=>window.clicks++);window.inputReady=true;</script></body></html>`)}`;
    await Promise.all([receiver.loadURL(page("#ddd")), overlay.loadURL(page("rgba(0,255,0,0.01)"))]);
    for (const win of [receiver, overlay]) {
      assert.equal(await win.webContents.executeJavaScript("window.inputReady"), true, "renderer input listener ready");
    }
    receiver.show();
    overlay.showInactive();
    overlay.setAlwaysOnTop(true, "screen-saver");
    xdotool("windowraise", windowId(overlay));

    const counts = async () => Promise.all([receiver, overlay].map((win) => win.webContents.executeJavaScript("window.clicks")));
    const clickAndExpect = async (recipient, label) => {
      const before = await counts();
      const a = geometry(receiver);
      const b = geometry(overlay);
      const left = Math.max(a.X, b.X);
      const top = Math.max(a.Y, b.Y);
      const right = Math.min(a.X + a.WIDTH, b.X + b.WIDTH);
      const bottom = Math.min(a.Y + a.HEIGHT, b.Y + b.HEIGHT);
      assert.ok(right - left > 20 && bottom - top > 20, "windows must overlap at the click point");
      // OS geometry is physical pixels, so this works at both startup scales.
      xdotool("mousemove", Math.floor((left + right) / 2), Math.floor((top + bottom) / 2), "click", "1");
      const expected = before.map((value, index) => value + Number(index === recipient));
      const deadline = Date.now() + 2000;
      let actual;
      do {
        actual = await counts();
        if (actual[0] === expected[0] && actual[1] === expected[1]) break;
        await delay(20);
      } while (Date.now() < deadline);
      // Allow late delivery to reveal unwanted routing to both windows.
      await delay(100);
      assert.deepEqual(await counts(), expected, label);
      console.log(`[verify-x11-click-through] ok: ${label}`);
    };

    overlay.setIgnoreMouseEvents(false);
    await clickAndExpect(1, "negative control: overlay intercepts before ignore");
    overlay.setIgnoreMouseEvents(true, { forward: true });
    await clickAndExpect(0, "initial click passes through");

    const previous = geometry(overlay);
    overlay.setBounds({ x: 110, y: 105, width: 320, height: 250 });
    const deadline = Date.now() + 2000;
    while (JSON.stringify(geometry(overlay)) === JSON.stringify(previous) && Date.now() < deadline) await delay(20);
    const resized = geometry(overlay);
    assert.notEqual(resized.WIDTH, previous.WIDTH, "X server must observe resize");
    assert.notEqual(resized.X, previous.X, "X server must observe move");
    // Give the frame-hint pass time to run. Do not reapply ignore after resize:
    // doing so would conceal Electron 43.1.1's regression.
    await delay(200);
    await clickAndExpect(0, "click passes through after native bounds change without reapplying ignore");

    overlay.setIgnoreMouseEvents(false);
    await clickAndExpect(1, "negative control: resized overlay remains above receiver");
    overlay.setIgnoreMouseEvents(true, { forward: true });
    await clickAndExpect(0, "click passes through after re-enabling ignore");
    console.log(`[verify-x11-click-through] PASS startupScale=${scale}; live scale changes unverified`);
  } finally {
    clearTimeout(watchdog);
    if (overlay && !overlay.isDestroyed()) overlay.destroy();
    if (receiver && !receiver.isDestroyed()) receiver.destroy();
  }
  app.quit();
}

if (process.versions.electron && process.type === "browser") {
  runElectronMain().catch((error) => {
    console.error(`[verify-x11-click-through] ${error.stack || error.message}`);
    require("electron").app.exit(1);
  });
} else {
  assert.equal(process.platform, "linux", "this acceptance requires Linux/X11; macOS results cannot substitute");
  assert.ok(process.env.DISPLAY, "DISPLAY must identify an isolated X11 server");
  assert.ok(scale === 1 || scale === 2, "PF_X11_SCALE must be 1 or 2");
  xdotool("--version");
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "pf-x11-click-through-"));
  try {
    const env = { ...process.env, PF_X11_USER_DATA: userData };
    delete env.ELECTRON_RUN_AS_NODE;
    const result = spawnSync(require("electron"), [
      __filename, "--ozone-platform=x11", "--disable-gpu", `--force-device-scale-factor=${scale}`,
      // Hosted CI has no configured SUID helper; only this isolated test process
      // uses the same no-sandbox convention as the existing render verifiers.
      ...(process.env.CI === "true" || process.getuid?.() === 0 ? ["--no-sandbox"] : []),
    ], { cwd: root, env, stdio: "inherit", timeout: 45000 });
    if (result.error) console.error(`[verify-x11-click-through] ${result.error.message}`);
    process.exitCode = result.status ?? 1;
  } finally {
    fs.rmSync(userData, { recursive: true, force: true });
  }
}

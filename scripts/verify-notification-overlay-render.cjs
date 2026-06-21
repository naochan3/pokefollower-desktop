const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");

function fail(message) {
  throw new Error(message);
}

async function runElectronMain() {
  const { app, BrowserWindow } = require("electron");
  await app.whenReady();
  const win = new BrowserWindow({
    width: 360,
    height: 240,
    show: false,
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: path.join(root, "src", "overlay", "overlay-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  await win.loadFile(path.join(root, "src", "overlay", "overlay.html"));
  win.webContents.send("companion-notification", {
    source: "Codex",
    title: "検証完了",
    body: "通知画面 smoke",
    ttlMs: 60000,
  });
  await new Promise((resolve) => setTimeout(resolve, 120));
  const result = await win.webContents.executeJavaScript(`(() => {
    const el = document.getElementById("__pf_notification");
    const source = el?.children?.[0];
    const title = el?.children?.[1];
    const body = el?.children?.[2];
    const rect = el ? el.getBoundingClientRect() : null;
    const style = el ? getComputedStyle(el) : null;
    const sourceStyle = source ? getComputedStyle(source) : null;
    return {
      exists: !!el,
      childCount: el ? el.children.length : 0,
      display: style?.display || "",
      width: rect?.width || 0,
      height: rect?.height || 0,
      left: rect?.left || 0,
      top: rect?.top || 0,
      right: rect?.right || 0,
      bottom: rect?.bottom || 0,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      borderTopWidth: style?.borderTopWidth || "",
      borderRadius: style?.borderRadius || "",
      boxShadow: style?.boxShadow || "",
      fontFamily: style?.fontFamily || "",
      imageRendering: style?.imageRendering || "",
      transform: style?.transform || "",
      sourceText: source?.textContent || "",
      sourceBackground: sourceStyle?.backgroundColor || "",
      titleText: title?.textContent || "",
      bodyText: body?.textContent || "",
    };
  })()`);

  if (!result.exists) fail("notification element was not created");
  if (result.childCount !== 3) fail(`notification must render source/title/body nodes, got ${result.childCount}`);
  if (result.display !== "block") fail(`notification must be visible, got display=${result.display}`);
  if (result.sourceText !== "Codex") fail(`source text mismatch: ${result.sourceText}`);
  if (result.titleText !== "検証完了") fail(`title text mismatch: ${result.titleText}`);
  if (result.bodyText !== "通知画面 smoke") fail(`body text mismatch: ${result.bodyText}`);
  if (result.borderTopWidth !== "4px") fail(`pixel border must be 4px, got ${result.borderTopWidth}`);
  if (result.borderRadius !== "0px") fail(`pixel notification must not be rounded, got ${result.borderRadius}`);
  if (!result.boxShadow || result.boxShadow === "none") fail("notification must keep a pixel shadow");
  if (!/mono/i.test(result.fontFamily)) fail(`notification must use a monospace/pixel-like font, got ${result.fontFamily}`);
  if (result.width <= 0 || result.height <= 0) fail(`notification has invalid size ${result.width}x${result.height}`);
  if (result.left < 0 || result.top < 0 || result.right > result.viewportWidth || result.bottom > result.viewportHeight) {
    fail(`notification overflowed viewport: ${JSON.stringify(result)}`);
  }
  if (!result.transform || result.transform === "none") fail("notification must be positioned with transform");

  const screenshotPath = path.join(os.tmpdir(), "pokefollower-notification-overlay-smoke.png");
  const image = await win.capturePage();
  fs.writeFileSync(screenshotPath, image.toPNG());
  console.log(`[verify-notification-overlay-render] ok: notification visible, clamped, pixel-styled; screenshot=${screenshotPath}`);
  app.quit();
}

if (process.versions.electron && process.type === "browser") {
  runElectronMain().catch((error) => {
    console.error(`[verify-notification-overlay-render] ${error.stack || error.message}`);
    process.exitCode = 1;
    const { app } = require("electron");
    app.quit();
  });
} else {
  const electron = require("electron");
  const result = spawnSync(electron, [__filename], {
    cwd: root,
    env: { ...process.env },
    stdio: "inherit",
  });
  process.exit(result.status ?? 1);
}

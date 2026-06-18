const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const main = fs.readFileSync(path.join(root, "src", "main", "main.js"), "utf8");
const protocolPath = fs.readFileSync(path.join(root, "src", "main", "app-protocol-path.js"), "utf8");
const overlayPreload = fs.readFileSync(path.join(root, "src", "overlay", "overlay-preload.js"), "utf8");
const settingsPreload = fs.readFileSync(path.join(root, "src", "settings", "settings-preload.js"), "utf8");
const overlayHtml = fs.readFileSync(path.join(root, "src", "overlay", "overlay.html"), "utf8");
const settingsHtml = fs.readFileSync(path.join(root, "src", "settings", "settings.html"), "utf8");
const errors = [];

function expect(condition, message) {
  if (!condition) errors.push(message);
}

function extractFunctionBody(source, functionName) {
  const start = source.indexOf(`function ${functionName}`);
  if (start < 0) return "";
  const braceStart = source.indexOf("{", start);
  let depth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    if (source[i] === "}") depth -= 1;
    if (depth === 0) return source.slice(braceStart, i + 1);
  }
  return "";
}

const overlayWindow = extractFunctionBody(main, "createOverlayWindow");
const settingsWindow = extractFunctionBody(main, "getSettingsWin");
const navigationHardening = extractFunctionBody(main, "hardenRendererNavigation");

expect(/scheme: "app"/.test(main), "app protocol scheme must be registered");
expect(/standard: true/.test(main), "app protocol must be standard");
expect(/secure: true/.test(main), "app protocol must be secure");
expect(/supportFetchAPI: true/.test(main), "app protocol must support fetch API");
expect(/stream: true/.test(main), "app protocol must keep stream privilege");
expect(/protocol\.handle\("app"/.test(main), "app protocol handler must be registered");
expect(/resolveAppProtocolPath\(ROOT, request\.url\)/.test(main), "protocol handler must resolve through resolveAppProtocolPath");
expect(/new Response\(null, \{ status: 403 \}\)/.test(main), "protocol handler must reject forbidden paths with 403");
expect(/new Response\(null, \{ status: 404 \}\)/.test(main), "protocol handler must return 404 for missing files");
expect(/net\.fetch\(pathToFileURL\(filePath\)\.toString\(\)\)/.test(main), "protocol handler must fetch file URLs after validation");
expect(/setWindowOpenHandler\(\(\) => \(\{ action: "deny" \}\)\)/.test(navigationHardening), "renderer windows must deny window.open");
expect(/webContents\.on\("will-navigate", \(event\) => \{[\s\S]*event\.preventDefault\(\);[\s\S]*\}/.test(navigationHardening), "renderer windows must prevent navigation away from bundled UI");

for (const [label, body] of [
  ["overlay", overlayWindow],
  ["settings", settingsWindow],
]) {
  expect(body.includes("contextIsolation: true"), `${label} window must enable contextIsolation`);
  expect(body.includes("nodeIntegration: false"), `${label} window must disable nodeIntegration`);
  expect(body.includes("sandbox: true"), `${label} window must enable sandbox`);
  expect(/preload: path\.join\(__dirname, "\.\.", "(overlay|settings)", "\1-preload\.js"\)/.test(body), `${label} window must use its scoped preload`);
  expect(/hardenRendererNavigation\((win|settingsWin)\)/.test(body), `${label} window must apply navigation hardening`);
}

expect(/focusable: false/.test(overlayWindow), "overlay window must stay non-focusable");
expect(/skipTaskbar: true/.test(overlayWindow), "overlay window must stay out of the taskbar");
expect(/win\.setIgnoreMouseEvents\(true, \{ forward: true \}\)/.test(overlayWindow), "overlay window must ignore mouse events");
expect(/win\.setAlwaysOnTop\(true, "screen-saver"\)/.test(overlayWindow), "overlay window must use screen-saver always-on-top level");
expect(/setMenuBarVisibility\(false\)/.test(settingsWindow), "settings window must hide the menu bar");

expect(/const assetsRoot = path\.join\(rootPath, "assets"\);/.test(protocolPath), "app protocol must limit access to assets/");
expect(/if \(!isInsideRoot\(assetsRoot, filePath\)\) return null;/.test(protocolPath), "app protocol must reject paths outside assets/");
expect(/decodeURIComponent\(url\.pathname\)/.test(protocolPath), "app protocol must decode encoded paths before validation");

expect(!/require\(/.test(overlayPreload.replace(/require\("electron"\)/, "")), "overlay preload must not require non-electron modules");
expect(!/require\(/.test(settingsPreload.replace(/require\("electron"\)/, "")), "settings preload must not require non-electron modules");
expect(!/remote/.test(overlayPreload + settingsPreload), "preloads must not use Electron remote");

for (const [label, html] of [
  ["overlay", overlayHtml],
  ["settings", settingsHtml],
]) {
  expect(/http-equiv="Content-Security-Policy"/.test(html), `${label} HTML must declare a CSP`);
  expect(/default-src 'none'/.test(html), `${label} CSP must deny unspecified resource types by default`);
  expect(/script-src 'self'/.test(html), `${label} CSP must block inline and remote scripts`);
  expect(/img-src 'self' app: data:/.test(html), `${label} CSP must allow only bundled/data images`);
  expect(/connect-src 'none'/.test(html), `${label} CSP must block renderer network connections`);
  expect(/object-src 'none'/.test(html), `${label} CSP must block plugin/object loads`);
  expect(/base-uri 'none'/.test(html), `${label} CSP must block base URI injection`);
  expect(!/script-src[^;"]*'unsafe-inline'/.test(html), `${label} CSP must not allow inline scripts`);
}

if (errors.length > 0) {
  for (const error of errors) console.error(`[verify-electron-security] ${error}`);
  process.exit(1);
}

console.log("[verify-electron-security] ok: Electron protocol and BrowserWindow security invariants are present");

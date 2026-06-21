const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "src", "settings", "settings.html"), "utf8");
const js = fs.readFileSync(path.join(root, "src", "settings", "settings.js"), "utf8");
const preload = fs.readFileSync(path.join(root, "src", "settings", "settings-preload.js"), "utf8");
const errors = [];

function expect(condition, message) {
  if (!condition) errors.push(message);
}

function inputAttrs(id) {
  const match = html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`));
  if (!match) return null;
  const tag = match[0];
  const attrs = {};
  for (const attr of tag.matchAll(/\s([a-zA-Z-]+)="([^"]*)"/g)) {
    attrs[attr[1]] = attr[2];
  }
  return attrs;
}

for (const id of ["enabled", "notificationCompanion", "testCompanion", "search", "grid", "scale", "scaleVal", "offset", "offsetVal", "lerp", "lerpVal"]) {
  expect(html.includes(`id="${id}"`), `settings.html missing id="${id}"`);
  expect(js.includes(`getElementById("${id}")`) || ["scaleVal", "offsetVal", "lerpVal"].includes(id), `settings.js should query #${id}`);
}

expect(html.includes('role="listbox"'), "pack grid must keep listbox role");
expect(html.includes('aria-label="ポケモン一覧"'), "pack grid must keep Japanese aria label");
expect(html.includes('placeholder="名前・ローマ字・番号で検索"'), "search placeholder must describe supported search keys");
expect(html.includes('<script src="settings.js"></script>'), "settings.html must load settings.js");

expect(inputAttrs("enabled")?.type === "checkbox", "enabled input must be a checkbox");
expect(inputAttrs("notificationCompanion")?.type === "checkbox", "notification companion input must be a checkbox");
expect(inputAttrs("search")?.type === "text", "search input must be text");
expect(inputAttrs("scale")?.type === "number", "scale input must be number");
expect(inputAttrs("scale")?.min === "0.5", "scale min must be 0.5");
expect(inputAttrs("scale")?.max === "5.0", "scale max must be 5.0");
expect(inputAttrs("scale")?.step === "0.05", "scale step must be 0.05");
expect(inputAttrs("offset")?.type === "number", "offset input must be number");
expect(inputAttrs("offset")?.min === "0", "offset min must be 0");
expect(inputAttrs("offset")?.max === "100", "offset max must be 100");
expect(inputAttrs("offset")?.step === "1", "offset step must be 1");
expect(inputAttrs("lerp")?.type === "number", "lerp input must be number");
expect(inputAttrs("lerp")?.min === "0.5", "lerp min must be 0.5");
expect(inputAttrs("lerp")?.max === "5.0", "lerp max must be 5.0");
expect(inputAttrs("lerp")?.step === "0.1", "lerp step must be 0.1");

for (const mapping of [
  "vcp1_enabled: \"enabled\"",
  "vcp1_pack: \"pack\"",
  "vcp1_scale: \"scale\"",
  "vcp1_offset: \"offset\"",
  "vcp1_lerp: \"lerp\"",
  "vcp1_notification_companion: \"notificationCompanionEnabled\"",
]) {
  expect(js.includes(mapping), `settings.js missing key mapping ${mapping}`);
}

expect(/vcp1_scale: 1\.25/.test(js), "settings.js default scale must be 1.25");
expect(/vcp1_offset: 70/.test(js), "settings.js default offset must be 70");
expect(/vcp1_lerp: 0\.20/.test(js), "settings.js default lerp must be 0.20");
expect(/const lerpUI = lerp \* 10;/.test(js), "settings.js must expose lerp as x10 speed UI");
expect(/const lerp = normalized \/ 10;/.test(js), "settings.js must convert speed UI back to internal lerp");
expect(/toHira/.test(js) && /romaji/.test(js) && /#"\s*\+\s*padded/.test(js), "settings search must include kana, romaji, and dex number terms");
expect(/stepUp\(\)/.test(js) && /stepDown\(\)/.test(js), "settings arrows must use native number input stepping");
expect(/width: 420, height: 760/.test(fs.readFileSync(path.join(root, "src", "main", "main.js"), "utf8")), "settings window must leave room for notification controls");
expect(/flex: 1 1 280px/.test(html), "pack grid must keep flexible vertical space");
expect(/min-height: 160px/.test(html), "pack grid must keep a usable minimum height");
expect(/grid-template-columns: 1fr auto/.test(html), "notification companion row must keep compact action layout");

for (const surface of [
  'getSettings: () => ipcRenderer.invoke("settings:get")',
  'setSettings: (patch) => ipcRenderer.send("settings:set", patch)',
  'listPacks: () => ipcRenderer.invoke("packs:list")',
  'testCompanionNotification: () => ipcRenderer.invoke("companion:test-notification")',
]) {
  expect(preload.includes(surface), `settings preload missing surface: ${surface}`);
}

if (errors.length > 0) {
  for (const error of errors) console.error(`[verify-settings-ui] ${error}`);
  process.exit(1);
}

console.log("[verify-settings-ui] ok: settings UI DOM, preload, and mapping invariants are consistent");

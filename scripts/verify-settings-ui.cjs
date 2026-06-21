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

for (const id of ["enabled", "edgeRest", "avoidCursor", "avoidCursorStrength", "appReactions", "personality", "mode", "notificationCompanion", "testCompanion", "exportCodexPet", "workWatch", "workWatchPreset", "workWatchStart", "workWatchStop", "workWatchReset", "favoriteAdd", "favoriteNext", "favoriteClear", "favoriteCount", "rotationEnabled", "rotationInterval", "search", "grid", "scale", "scaleVal", "offset", "offsetVal", "lerp", "lerpVal"]) {
  expect(html.includes(`id="${id}"`), `settings.html missing id="${id}"`);
  expect(js.includes(`getElementById("${id}")`) || ["scaleVal", "offsetVal", "lerpVal"].includes(id), `settings.js should query #${id}`);
}

// 世代フィルタ
expect(html.includes('id="genChips"'), 'settings.html must contain id="genChips" chip row');
expect(html.includes('data-gen="all"'), 'settings.html must contain "全" chip with data-gen="all"');
for (let g = 1; g <= 9; g++) {
  expect(html.includes(`data-gen="${g}"`), `settings.html must contain chip data-gen="${g}"`);
}
expect(js.includes('genOfDex'), 'settings.js must reference genOfDex for generation filter');
expect(js.includes('selectedGen'), 'settings.js must maintain selectedGen state');

expect(html.includes('role="listbox"'), "pack grid must keep listbox role");
expect(html.includes('aria-label="ポケモン一覧"'), "pack grid must keep Japanese aria label");
expect(html.includes('placeholder="名前・ローマ字・番号で検索"'), "search placeholder must describe supported search keys");
expect(html.includes('<script src="settings.js"></script>'), "settings.html must load settings.js");

expect(inputAttrs("enabled")?.type === "checkbox", "enabled input must be a checkbox");
expect(inputAttrs("edgeRest")?.type === "checkbox", "edgeRest input must be a checkbox");
expect(inputAttrs("avoidCursor")?.type === "checkbox", "avoidCursor input must be a checkbox");
expect(html.includes('<select id="avoidCursorStrength"'), "avoid cursor strength select must exist");
for (const strength of ["normal", "strong"]) {
  expect(html.includes(`value="${strength}"`), `avoid cursor strength select must include ${strength}`);
}
expect(inputAttrs("appReactions")?.type === "checkbox", "app reactions input must be a checkbox");
expect(html.includes('<select id="personality">'), "personality select must exist");
for (const preset of ["standard", "active", "relaxed", "friendly"]) {
  expect(html.includes(`value="${preset}"`), `personality select must include ${preset}`);
}
expect(html.includes('<select id="mode">'), "mode select must exist");
for (const mode of ["follow", "roam"]) {
  expect(html.includes(`value="${mode}"`), `mode select must include ${mode}`);
}
expect(html.includes('<select id="kind">'), "kind select must exist");
expect(inputAttrs("notificationCompanion")?.type === "checkbox", "notification companion input must be a checkbox");
expect(html.includes('id="exportCodexPet"'), "settings UI must expose Codex pet export button");
expect(inputAttrs("workWatch")?.type === "checkbox", "work watch input must be a checkbox");
expect(inputAttrs("rotationEnabled")?.type === "checkbox", "rotation enabled input must be a checkbox");
expect(inputAttrs("rotationInterval")?.type === "number", "rotation interval input must be number");
expect(inputAttrs("rotationInterval")?.min === "1", "rotation interval min must be 1");
expect(inputAttrs("rotationInterval")?.max === "120", "rotation interval max must be 120");
expect(html.includes('<select id="workWatchPreset"'), "work watch preset select must exist");
for (const preset of ["25/5", "50/10"]) {
  expect(html.includes(`value="${preset}"`), `work watch preset select must include ${preset}`);
}
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
  "vcp1_favorite_packs: \"favoritePacks\"",
  "vcp1_rotation_enabled: \"rotationEnabled\"",
  "vcp1_rotation_interval_minutes: \"rotationIntervalMinutes\"",
  "vcp1_scale: \"scale\"",
  "vcp1_offset: \"offset\"",
  "vcp1_lerp: \"lerp\"",
  "vcp1_edgeRest: \"edgeRest\"",
  "vcp1_avoidCursor: \"avoidCursor\"",
  "vcp1_avoid_cursor_strength: \"avoidCursorStrength\"",
  "vcp1_app_reactions: \"appReactionsEnabled\"",
  "vcp1_personality: \"personality\"",
  "vcp1_mode: \"mode\"",
  "vcp1_notification_companion: \"notificationCompanionEnabled\"",
  "vcp1_work_watch: \"workWatchEnabled\"",
  "vcp1_work_watch_preset: \"workWatchPreset\"",
]) {
  expect(js.includes(mapping), `settings.js missing key mapping ${mapping}`);
}

expect(/vcp1_scale: 1\.25/.test(js), "settings.js default scale must be 1.25");
expect(/vcp1_offset: 70/.test(js), "settings.js default offset must be 70");
expect(/vcp1_lerp: 0\.20/.test(js), "settings.js default lerp must be 0.20");
expect(/vcp1_edgeRest: true/.test(js), "settings.js default edgeRest must be true");
expect(/vcp1_avoidCursor: true/.test(js), "settings.js default avoidCursor must be true");
expect(/vcp1_personality: "standard"/.test(js), "settings.js default personality must be standard");
expect(/vcp1_mode: "follow"/.test(js), "settings.js default mode must be follow");
expect(/vcp1_favorite_packs: \[\]/.test(js), "settings.js default favorite packs must be empty");
expect(/vcp1_rotation_interval_minutes: 15/.test(js), "settings.js default rotation interval must be 15");
expect(/const lerpUI = lerp \* 10;/.test(js), "settings.js must expose lerp as x10 speed UI");
expect(/const lerp = normalized \/ 10;/.test(js), "settings.js must convert speed UI back to internal lerp");
expect(/toHira/.test(js) && /romaji/.test(js) && /#"\s*\+\s*padded/.test(js), "settings search must include kana, romaji, and dex number terms");
expect(/stepUp\(\)/.test(js) && /stepDown\(\)/.test(js), "settings arrows must use native number input stepping");
expect(/width: 420, height: 760/.test(fs.readFileSync(path.join(root, "src", "main", "main.js"), "utf8")), "settings window must leave room for notification controls");
expect(/flex: 1 1 280px/.test(html), "pack grid must keep flexible vertical space");
expect(/min-height: 160px/.test(html), "pack grid must keep a usable minimum height");
expect(/grid-template-columns: 1fr auto/.test(html), "notification companion row must keep compact action layout");
expect(/\.tile\.favorite::after/.test(html), "favorite Pokemon tiles must show a stable favorite marker");
expect(/favoriteAddEl\.textContent = selectedIsFavorite \? "DEL" : "ADD"/.test(js), "favorite add button must toggle between add and remove for the selected Pokemon");
expect(/window\.settingsApi\.addFavorite\(selectedId\)/.test(js), "settings UI must persist selected Pokemon additions through favorites:add IPC");
expect(/window\.settingsApi\.removeFavorite\(selectedId\)/.test(js), "settings UI must persist selected Pokemon removals through favorites:remove IPC");
expect(/window\.settingsApi\.exportCodexPet\(packKey\)/.test(js), "settings UI must export the currently selected Pokemon through Codex pet IPC");
expect(/document\.querySelector\("\.tile\.selected"\)\?\.dataset\.id/.test(js), "Codex pet export must use the currently selected tile");

for (const surface of [
  'getSettings: () => ipcRenderer.invoke("settings:get")',
  'setSettings: (patch) => ipcRenderer.send("settings:set", patch)',
  'listPacks: () => ipcRenderer.invoke("packs:list")',
  'testCompanionNotification: () => ipcRenderer.invoke("companion:test-notification")',
  'startWorkWatch: () => ipcRenderer.invoke("work-watch:start")',
  'stopWorkWatch: () => ipcRenderer.invoke("work-watch:stop")',
  'resetWorkWatch: () => ipcRenderer.invoke("work-watch:reset")',
  'nextFavorite: () => ipcRenderer.invoke("favorites:next")',
  'addFavorite: (packKey) => ipcRenderer.invoke("favorites:add", packKey)',
  'removeFavorite: (packKey) => ipcRenderer.invoke("favorites:remove", packKey)',
  'exportCodexPet: (packKey) => ipcRenderer.invoke("codex-pet:export-current", packKey)',
]) {
  expect(preload.includes(surface), `settings preload missing surface: ${surface}`);
}

if (errors.length > 0) {
  for (const error of errors) console.error(`[verify-settings-ui] ${error}`);
  process.exit(1);
}

console.log("[verify-settings-ui] ok: settings UI DOM, preload, and mapping invariants are consistent");

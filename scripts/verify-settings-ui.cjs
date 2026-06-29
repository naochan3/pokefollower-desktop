const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "src", "settings", "settings.html"), "utf8");
const js = fs.readFileSync(path.join(root, "src", "settings", "settings.js"), "utf8");
const generationLabels = fs.readFileSync(path.join(root, "src", "settings", "generation-labels.js"), "utf8");
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

// ─── 1. 必須 ID（新3タブDOM契約） ───────────────────────────────────────
for (const id of [
  // タブ / パネル
  "tabs", "panel-aibou", "panel-box", "panel-settings",
  // あいぼうパネル
  "heroSprite", "heroName", "heroNum", "heroTypes", "nicknameEdit",
  "partyRowAibou", "partyRowBox",
  // スライダー（あいぼうパネル）
  "scale", "scaleVal", "offset", "offsetVal", "lerp", "lerpVal",
  // ボックスパネル
  "search", "kind", "genChips", "typeChips", "grid",
  // せっていパネル
  "enabled", "avoidCursor", "avoidCursorStrength", "appReactions",
  "notificationCompanion", "testCompanion", "exportCodexPet",
  "comingSoonList", "roamSoon",
]) {
  expect(html.includes(`id="${id}"`), `settings.html missing id="${id}"`);
}

// settings.js が主要 DOM 要素を取得していること
for (const id of [
  "heroSprite", "heroName", "heroNum", "heroTypes", "nicknameEdit",
  "partyRowAibou", "partyRowBox",
  "scale", "offset", "lerp", "scaleVal", "offsetVal", "lerpVal",
  "grid", "search", "genChips", "typeChips", "kind",
  "enabled", "avoidCursor", "avoidCursorStrength", "appReactions",
  "notificationCompanion", "testCompanion", "exportCodexPet",
]) {
  expect(js.includes(`getElementById("${id}")`), `settings.js should query #${id}`);
}

// ─── 2. 世代チップ（保存） ─────────────────────────────────────────────
expect(html.includes('id="genChips"'), 'settings.html must contain id="genChips" chip row');
expect(html.includes('data-gen="all"'), 'settings.html must contain "全" chip with data-gen="all"');
for (const [g, short, titleNeedle] of [
  [1, "赤緑", "赤・緑 / 青 / ピカチュウ"],
  [2, "金銀", "金・銀 / クリスタル"],
  [3, "RS", "ルビー・サファイア / エメラルド"],
  [4, "DP", "ダイヤモンド・パール / プラチナ"],
  [5, "BW", "ブラック・ホワイト / B2W2"],
  [6, "XY", "X・Y"],
  [7, "SM", "サン・ムーン / USUM"],
  [8, "剣盾", "ソード・シールド / Legends アルセウス"],
  [9, "SV", "スカーレット・バイオレット"],
]) {
  expect(html.includes(`data-gen="${g}"`), `settings.html must contain chip data-gen="${g}"`);
  expect(html.includes(`>${short}</button>`), `settings.html must render short generation label ${short}`);
  expect(html.includes(titleNeedle), `settings.html must expose generation tooltip text: ${titleNeedle}`);
  expect(generationLabels.includes(`gen: ${g}`), `generation-labels.js must define generation ${g}`);
  expect(generationLabels.includes(`short: "${short}"`), `generation-labels.js must define short label ${short}`);
}

// ─── 3. スクリプトロード順 / モジュール形式（保存） ────────────────────
expect(html.includes('<script src="generation-labels.js"></script>'), "settings.html must load generation labels before settings.js");
expect(html.includes('<script src="search-engine.js"></script>'), "settings.html must load search-engine.js before settings.js");
expect(html.includes('<script type="module" src="settings.js">'), "settings.html must load settings.js as ES module");

// ─── 4. 検索プレースホルダ / アクセシビリティ（保存） ────────────────
expect(html.includes('placeholder="名前・タイプ・作品名で検索"'), "search placeholder must describe supported search keys");
expect(html.includes('role="listbox"'), "pack grid must keep listbox role");
expect(html.includes('aria-label="ポケモン一覧"'), "pack grid must keep Japanese aria label");

// ─── 5. #kind select（保存） ──────────────────────────────────────────
expect(html.includes('<select id="kind">'), "kind select must exist");
expect(html.includes('value="normal"'), 'kind select must include value="normal"');
expect(html.includes('value="forms"'), 'kind select must include value="forms"');

// ─── 6. スライダー属性（保存） ─────────────────────────────────────────
expect(inputAttrs("scale")?.type === "number", "scale input must be number");
expect(inputAttrs("scale")?.min === "0.5", "scale min must be 0.5");
expect(inputAttrs("scale")?.max === "10.0", "scale max must be 10.0");
expect(inputAttrs("scale")?.step === "0.05", "scale step must be 0.05");
expect(inputAttrs("offset")?.type === "number", "offset input must be number");
expect(inputAttrs("offset")?.min === "0", "offset min must be 0");
expect(inputAttrs("offset")?.max === "250", "offset max must be 250");
expect(inputAttrs("offset")?.step === "1", "offset step must be 1");
expect(inputAttrs("lerp")?.type === "number", "lerp input must be number");
expect(inputAttrs("lerp")?.min === "0.5", "lerp min must be 0.5");
expect(inputAttrs("lerp")?.max === "10.0", "lerp max must be 10.0");
expect(inputAttrs("lerp")?.step === "0.1", "lerp step must be 0.1");
expect(inputAttrs("enabled")?.type === "checkbox", "enabled input must be a checkbox");
expect(inputAttrs("notificationCompanion")?.type === "checkbox", "notification companion input must be a checkbox");
expect(inputAttrs("search")?.type === "text", "search input must be text");

// ─── 7. グリッド / お気に入りタイルスタイル（保存） ───────────────────
expect(/flex: 1 1 280px/.test(html), "pack grid must keep flexible vertical space");
expect(/min-height: 160px/.test(html), "pack grid must keep a usable minimum height");
expect(/grid-template-columns: 1fr auto/.test(html), "companion card must keep compact action layout");
expect(/\.tile\.favorite::after/.test(html), "favorite Pokemon tiles must show a stable favorite marker");

// ─── 8. settings.js — 世代/検索エンジン ロジック（保存） ─────────────
expect(js.includes("window.PokeFollowerGenerationLabels"), "settings.js must read canonical generation labels");
expect(js.includes("generationLabelFor(g)"), "settings.js must render generation chips from generation labels");
expect(js.includes("genOfDex"), "settings.js must reference genOfDex for generation filter");
expect(js.includes("selectedGen"), "settings.js must maintain selectedGen state");
expect(js.includes("window.PokeFollowerSearch"), "settings UI must use shared Pokemon search engine");
expect(js.includes("getSearchMetadata"), "settings UI must load search metadata through preload IPC");
expect(js.includes('searchIds ? "" : raw'), "settings UI must fall back to tile text search if shared search engine is unavailable");
expect(/toHira/.test(js) && /romaji/.test(js) && /#"\s*\+\s*padded/.test(js), "settings search must include kana, romaji, and dex number terms");

// ─── 9. settings.js — 新 import（追加） ──────────────────────────────
expect(js.includes('from "./type-colors.mjs"'), "settings.js must import from type-colors.mjs");
expect(js.includes('from "./party.mjs"'), "settings.js must import from party.mjs");
expect(js.includes('from "./filter.mjs"'), "settings.js must import from filter.mjs");
expect(js.includes('from "./sprite-view.mjs"'), "settings.js must import from sprite-view.mjs");

// ─── 10. settings.js — 新 IPC 呼び出し（追加） ───────────────────────
expect(js.includes("getPackMeta"), "settings.js must call getPackMeta IPC");
expect(js.includes("setNickname"), "settings.js must call setNickname IPC");
expect(js.includes("setLead"), "settings.js must call setLead IPC");

// ─── 11. settings.js — lerp 変換（保存） ─────────────────────────────
expect(/const lerpUI = lerp \* 10;/.test(js), "settings.js must expose lerp as x10 speed UI");
expect(/const lerp = normalized \/ 10;/.test(js), "settings.js must convert speed UI back to internal lerp");

// ─── 12. settings.js — mapKeys（現存キーのみ） ────────────────────────
for (const mapping of [
  "vcp1_enabled: \"enabled\"",
  "vcp1_pack: \"pack\"",
  "vcp1_favorite_packs: \"favoritePacks\"",
  "vcp1_scale: \"scale\"",
  "vcp1_offset: \"offset\"",
  "vcp1_lerp: \"lerp\"",
  "vcp1_notification_companion: \"notificationCompanionEnabled\"",
]) {
  expect(js.includes(mapping), `settings.js missing key mapping ${mapping}`);
}

// ─── 13. settings.js — 既定値（現存のもの） ──────────────────────────
expect(/vcp1_scale: 1\.25/.test(js), "settings.js default scale must be 1.25");
expect(/vcp1_offset: 70/.test(js), "settings.js default offset must be 70");
expect(/vcp1_lerp: 0\.20/.test(js), "settings.js default lerp must be 0.20");

// ─── 14. settings.js — exportCodexPet（保存） ────────────────────────
expect(/window\.settingsApi\.exportCodexPet\(packKey\)/.test(js), "settings UI must export Pokemon through Codex pet IPC");

// ─── 15. preload IPC surface（保存 + 新規） ───────────────────────────
for (const surface of [
  'getSettings: () => ipcRenderer.invoke("settings:get")',
  'setSettings: (patch) => ipcRenderer.send("settings:set", patch)',
  'listPacks: () => ipcRenderer.invoke("packs:list")',
  'getSearchMetadata: () => ipcRenderer.invoke("packs:search-metadata")',
  'testCompanionNotification: () => ipcRenderer.invoke("companion:test-notification")',
  'nextFavorite: () => ipcRenderer.invoke("favorites:next")',
  'addFavorite: (packKey) => ipcRenderer.invoke("favorites:add", packKey)',
  'removeFavorite: (packKey) => ipcRenderer.invoke("favorites:remove", packKey)',
  'exportCodexPet: (packKey) => ipcRenderer.invoke("codex-pet:export-current", packKey)',
  // 新 surface（Task 11 で追加）
  'getPackMeta: (packKey) => ipcRenderer.invoke("packs:meta", packKey)',
  'setNickname: (packKey, name) => ipcRenderer.invoke("nickname:set", { packKey, name })',
  'setLead: (packKey) => ipcRenderer.invoke("party:set-lead", packKey)',
]) {
  expect(preload.includes(surface), `settings preload missing surface: ${surface}`);
}

// ─── 16. メインウィンドウ寸法（保存） ────────────────────────────────
expect(
  /width: 420, height: 760/.test(fs.readFileSync(path.join(root, "src", "main", "main.js"), "utf8")),
  "settings window size must be width:420, height:760"
);

if (errors.length > 0) {
  for (const error of errors) console.error(`[verify-settings-ui] ${error}`);
  process.exit(1);
}

console.log("[verify-settings-ui] ok: 3-tab DOM, new imports, IPC surfaces, and invariants verified");

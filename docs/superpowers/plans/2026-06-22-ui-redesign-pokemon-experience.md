# 設定UX刷新（ポケモン体験ベース・3タブ）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 設定ウィンドウを「あいぼう／ボックス／せってい」の3タブ＋ポケモンらしいタイプ色・手持ち6体・ニックネームへ刷新する。

**Architecture:** 追従の状態機械・WASM・アセットパイプラインは無変更。レンダラ（設定ウィンドウ）のUX層を作り直し、全1010体のタイプデータ＋タイプ色を新規追加する。論理/データは純関数でTDD、UIは構造＋`verify-settings-ui.cjs` の契約で担保。

**Tech Stack:** Electron（vanilla HTML/CSS/JS レンダラ・ビルド不要）、Node ESM `.mjs` スクリプト、CommonJS verifier、Vitest。

## Global Constraints

- 状態機械を変更しない：`src/main/follower-sim.js`、`crates/follower_core/**`、`native/*.wasm` に触れない。
- Coming Soon 機能（はじで休む・よける・アプリ反応・おさんぽ・せいかく・作業見守り・鳴き声）は **設定の既定値を無効化**して隠す。コードは消さない。状態機械コードは無変更（既定値だけ変える）。
- vanilla HTML/CSS 継続（`settings.html` 内CSS・ビルド不要）。Tailwind等は導入しない。
- タイプデータは外部API（PokéAPI）から取得し、**スナップショットJSONをコミット**（CIはネット非依存）。出典/ライセンス明記。
- 図鑑フレーバー説明は持たない（版依存のため不採用）。タイプのみ。
- 手持ちは最大6・先頭=相棒（デスクトップ表示）。既存favoritesの先頭6体を移行。
- フォルムは原種とタイプが異なるため、タイプは pack id で引く。
- 検索プレースホルダ文言 `名前・タイプ・作品名で検索` を維持。
- PRベース。ブランチ `feature/ui-redesign`（作成済み）。着手前に `git fetch && git merge --ff-only origin/main`。
- 各タスク完了時 `npm run verify:local` と `npx vitest run` を緑に保つ。

---

## File Structure（作成/変更するファイルと責務）

- 新規 `src/settings/type-colors.mjs` — 18タイプ→`{ja, color}`（純データ＋getter）。
- 新規 `scripts/gen-type-data.mjs` — PokéAPI から番号/フォルム→タイプを取得し `assets/packs/type-data.json` を生成（純変換関数を export）。
- 新規 `assets/packs/type-data.json` — 生成物（コミット）。
- 変更 `src/main/pack-reader.js` — `readPackList` に `types` をマージ。新IPC用に `readPackMeta` 公開済みを流用。
- 変更 `src/settings/filter.mjs` — `matchTile` にタイプ絞り込みを追加。
- 新規 `src/settings/party.mjs` — 手持ち（最大6・先頭=相棒）の純操作（add/remove/replace/setLead）。
- 変更 `src/main/settings-store.js` — favorites上限12→6、`nicknames` マップ追加、Coming Soon既定値をfalse化。
- 変更 `src/main/main.js` — IPC追加（`packs:meta`、`nickname:set`、`party:set-lead`）、設定ウィンドウ寸法。
- 変更 `src/settings/settings-preload.js` — 新IPCのブリッジ追加。
- 新規 `src/settings/sprite-view.mjs` — パックメタからIdleアニメを描画（オーバーレイの frame/row 方式を流用）。
- 変更 `src/settings/settings.html` — 3タブDOM＋CSS全面刷新。
- 変更 `src/settings/settings.js` — タブ制御・あいぼう・ボックス・せっていの配線、手持ち列、ニックネーム。
- 変更 `scripts/verify-settings-ui.cjs` — 新DOMに合わせて全面更新。
- テスト各種（下記タスク内）。

---

## Task 1: タイプ色モジュール

**Files:**
- Create: `src/settings/type-colors.mjs`
- Test: `tests/type-colors.test.mjs`

**Interfaces:**
- Produces: `TYPE_COLORS`（`{ [en]: { ja, color } }`、18タイプ）、`typeColor(en) -> string`（未知は `"#888888"`）、`typeJa(en) -> string`（未知は `en`）。

- [ ] **Step 1: Write the failing test**

```js
// tests/type-colors.test.mjs
import { describe, it, expect } from "vitest";
import { TYPE_COLORS, typeColor, typeJa } from "../src/settings/type-colors.mjs";

describe("type-colors", () => {
  it("defines all 18 types", () => {
    expect(Object.keys(TYPE_COLORS).length).toBe(18);
  });
  it("maps english type to color and ja", () => {
    expect(typeColor("electric")).toBe("#F8D030");
    expect(typeJa("electric")).toBe("でんき");
    expect(typeColor("water")).toBe("#6890F0");
  });
  it("falls back for unknown types", () => {
    expect(typeColor("mystery")).toBe("#888888");
    expect(typeJa("mystery")).toBe("mystery");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/type-colors.test.mjs`
Expected: FAIL（モジュール未作成）

- [ ] **Step 3: Write minimal implementation**

```js
// src/settings/type-colors.mjs
// ポケモンの18タイプ → 日本語名と代表色（標準パレット）
export const TYPE_COLORS = {
  normal:   { ja: "ノーマル", color: "#A8A878" },
  fire:     { ja: "ほのお",   color: "#F08030" },
  water:    { ja: "みず",     color: "#6890F0" },
  electric: { ja: "でんき",   color: "#F8D030" },
  grass:    { ja: "くさ",     color: "#78C850" },
  ice:      { ja: "こおり",   color: "#98D8D8" },
  fighting: { ja: "かくとう", color: "#C03028" },
  poison:   { ja: "どく",     color: "#A040A0" },
  ground:   { ja: "じめん",   color: "#E0C068" },
  flying:   { ja: "ひこう",   color: "#A890F0" },
  psychic:  { ja: "エスパー", color: "#F85888" },
  bug:      { ja: "むし",     color: "#A8B820" },
  rock:     { ja: "いわ",     color: "#B8A038" },
  ghost:    { ja: "ゴースト", color: "#705898" },
  dragon:   { ja: "ドラゴン", color: "#7038F8" },
  dark:     { ja: "あく",     color: "#705848" },
  steel:    { ja: "はがね",   color: "#B8B8D0" },
  fairy:    { ja: "フェアリー", color: "#EE99AC" },
};

export function typeColor(en) {
  const e = TYPE_COLORS[String(en || "").toLowerCase()];
  return e ? e.color : "#888888";
}

export function typeJa(en) {
  const e = TYPE_COLORS[String(en || "").toLowerCase()];
  return e ? e.ja : String(en || "");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/type-colors.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/settings/type-colors.mjs tests/type-colors.test.mjs
git commit -m "feat(types): 18タイプの色・日本語名パレットを追加"
```

---

## Task 2: タイプデータ生成スクリプト（純変換）

**Files:**
- Create: `scripts/gen-type-data.mjs`
- Test: `tests/gen-type-data.test.mjs`

**Interfaces:**
- Consumes: index.json のエントリ（`{ id, region }`）、PokéAPI レスポンス（`{ types: [{ type: { name } }] }`）。
- Produces: 純関数を export して `buildTypeData(entries, fetchTypesFor) -> { "<packId>": { types: string[] } }`、`pokeapiSlug(entry) -> string`（フォルムは `<baseSlug>-<region>`、通常種は `<baseSlug>`）。`isMain` ガードで実行時のみネット取得。

- [ ] **Step 1: Write the failing test**

```js
// tests/gen-type-data.test.mjs
import { describe, it, expect } from "vitest";
import { buildTypeData, pokeapiSlug } from "../scripts/gen-type-data.mjs";

describe("gen-type-data", () => {
  it("derives pokeapi slug for normal and form entries", () => {
    expect(pokeapiSlug({ id: "retro/gen-1/025-pikachu" })).toBe("pikachu");
    expect(pokeapiSlug({ id: "retro/forms/alola/026-raichu", region: "alola" })).toBe("raichu-alola");
  });
  it("builds a packId -> types map", async () => {
    const entries = [
      { id: "retro/gen-1/025-pikachu" },
      { id: "retro/forms/alola/026-raichu", region: "alola" },
    ];
    const fake = async (slug) =>
      slug === "pikachu" ? ["electric"] : ["electric", "psychic"];
    const out = await buildTypeData(entries, fake);
    expect(out["retro/gen-1/025-pikachu"]).toEqual({ types: ["electric"] });
    expect(out["retro/forms/alola/026-raichu"]).toEqual({ types: ["electric", "psychic"] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/gen-type-data.test.mjs`
Expected: FAIL（モジュール未作成）

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/gen-type-data.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// pack id（例 retro/gen-1/025-pikachu / retro/forms/alola/026-raichu）→ PokéAPI slug
export function pokeapiSlug(entry) {
  const slug = entry.id.split("/").pop();          // "025-pikachu"
  const base = slug.replace(/^[0-9]+-/, "");        // "pikachu"
  return entry.region ? `${base}-${entry.region}` : base;
}

// entries と取得関数からタイプマップを作る（純粋・テスト可能）
export async function buildTypeData(entries, fetchTypesFor) {
  const out = {};
  for (const e of entries) {
    const types = await fetchTypesFor(pokeapiSlug(e), e);
    if (Array.isArray(types) && types.length) out[e.id] = { types };
  }
  return out;
}

// 実行時のみ：PokéAPI から取得
async function fetchTypesFromPokeApi(slug) {
  const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${slug}`);
  if (!res.ok) throw new Error(`pokeapi ${slug}: ${res.status}`);
  const data = await res.json();
  return data.types.map((t) => t.type.name);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const index = JSON.parse(fs.readFileSync(path.join(ROOT, "assets/packs/index.json"), "utf8"));
  const entries = index.retro || [];
  const out = await buildTypeData(entries, async (slug) => {
    try { return await fetchTypesFromPokeApi(slug); }
    catch (err) { console.error(`[gen-type-data] ${slug}: ${err.message}`); return []; }
  });
  const dest = path.join(ROOT, "assets/packs/type-data.json");
  fs.writeFileSync(dest, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`[gen-type-data] wrote ${Object.keys(out).length} entries (source: PokéAPI)`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/gen-type-data.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/gen-type-data.mjs tests/gen-type-data.test.mjs
git commit -m "feat(types): タイプデータ生成スクリプト(PokéAPI)を追加"
```

---

## Task 3: タイプデータの実生成とコミット

**Files:**
- Create: `assets/packs/type-data.json`（生成物）

- [ ] **Step 1: 生成を実行**

Run: `node scripts/gen-type-data.mjs`
Expected: `[gen-type-data] wrote NNNN entries (source: PokéAPI)`（おおむね1010前後）。途中 404 の slug は stderr に出る。

- [ ] **Step 2: 取りこぼし確認（フォルムのslug不一致を洗う）**

Run: `node -e "const t=require('./assets/packs/type-data.json');const i=require('./assets/packs/index.json');const miss=(i.retro||[]).filter(e=>!t[e.id]).map(e=>e.id);console.log('missing',miss.length);console.log(miss.slice(0,40).join('\n'))"`
Expected: `missing` が 0 に近い。残るフォルムslug不一致（例: hisui/galar の命名差）は次stepで補正。

- [ ] **Step 3: 不一致slugを補正**

`scripts/gen-type-data.mjs` の `pokeapiSlug` に、PokéAPIの命名差を吸収する例外マップを追加する（実データで判明した分のみ）。例：

```js
const SLUG_FIXUP = {
  // pack id -> pokeapi slug（PokéAPIの命名差を吸収。実測で判明した分だけ追加）
  // 例: "retro/forms/galar/618-stunfisk": "stunfisk-galar",
};
export function pokeapiSlug(entry) {
  if (SLUG_FIXUP[entry.id]) return SLUG_FIXUP[entry.id];
  const slug = entry.id.split("/").pop();
  const base = slug.replace(/^[0-9]+-/, "");
  return entry.region ? `${base}-${entry.region}` : base;
}
```

その後再生成：`node scripts/gen-type-data.mjs` → Step 2 を再実行し `missing 0` を確認。

- [ ] **Step 4: Commit**

```bash
git add assets/packs/type-data.json scripts/gen-type-data.mjs
git commit -m "feat(types): 全パックのタイプデータを生成(スナップショット)"
```

---

## Task 4: pack-reader がタイプを返す

**Files:**
- Modify: `src/main/pack-reader.js`
- Test: `tests/pack-reader-types.test.js`

**Interfaces:**
- Consumes: `assets/packs/type-data.json`（`{ "<packId>": { types } }`）。
- Produces: `readPackList()` の各要素に `types: string[]`（無い場合 `[]`）を追加。既存フィールド（id/num/region/ja/romaji/en）は維持。

- [ ] **Step 1: Write the failing test**

```js
// tests/pack-reader-types.test.js
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { makePackReader } = require("../src/main/pack-reader.js");

function tmpRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pf-types-"));
  fs.mkdirSync(path.join(dir, "assets", "packs"), { recursive: true });
  return dir;
}

test("readPackList attaches types from type-data.json", () => {
  const root = tmpRoot();
  const p = (f) => path.join(root, "assets", "packs", f);
  fs.writeFileSync(p("index.json"), JSON.stringify({ retro: [
    { id: "retro/gen-1/025-pikachu", name: "025-Pikachu" },
    { id: "retro/gen-1/001-bulbasaur", name: "001-Bulbasaur" },
  ] }));
  fs.writeFileSync(p("jp-names.json"), JSON.stringify({ "25": { ja: "ピカチュウ" }, "1": { ja: "フシギダネ" } }));
  fs.writeFileSync(p("type-data.json"), JSON.stringify({
    "retro/gen-1/025-pikachu": { types: ["electric"] },
  }));
  const list = makePackReader(root).readPackList();
  const pika = list.find((x) => x.id === "retro/gen-1/025-pikachu");
  const bulba = list.find((x) => x.id === "retro/gen-1/001-bulbasaur");
  expect(pika.types).toEqual(["electric"]);
  expect(bulba.types).toEqual([]); // 未登録は空配列
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pack-reader-types.test.js`
Expected: FAIL（`types` が undefined）

- [ ] **Step 3: Write minimal implementation**

`src/main/pack-reader.js` に type-data 読み込みを追加し、`readPackList` のmapに `types` を足す。

`readJpNames` の下に追加：

```js
  function readTypeData() {
    const file = path.join(root, "assets", "packs", "type-data.json");
    try { return JSON.parse(fs.readFileSync(file, "utf8")); }
    catch (_) { return {}; }
  }
```

`readPackList` 内、`const jp = readJpNames();` の直後に：

```js
    const typeData = readTypeData();
```

返却オブジェクトに1行追加（`en: en || slug,` の前）：

```js
        types: (typeData[item.id] && Array.isArray(typeData[item.id].types)) ? typeData[item.id].types : [],
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pack-reader-types.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/pack-reader.js tests/pack-reader-types.test.js
git commit -m "feat(types): pack-reader が types を返す"
```

---

## Task 5: ボックスのタイプ絞り込み（filter.mjs）

**Files:**
- Modify: `src/settings/filter.mjs`
- Test: `tests/settings-filter-type.test.mjs`

**Interfaces:**
- Consumes: `tile = { region, gen, search, types: string[] }`、`sel = { kind, gen, region, type, q }`（`type` は `"all"` または英語タイプ名）。
- Produces: `matchTile` がタイプ条件を追加（`sel.type !== "all"` のとき `tile.types` に含むこと）。既存の kind/gen/region/q 条件は維持。

- [ ] **Step 1: Write the failing test**

```js
// tests/settings-filter-type.test.mjs
import { describe, it, expect } from "vitest";
import { matchTile } from "../src/settings/filter.mjs";

const base = { region: "", gen: "1", search: "ぴかちゅう", types: ["electric"] };

describe("matchTile type filter", () => {
  it("passes when type matches", () => {
    expect(matchTile(base, { kind: "normal", gen: "all", region: "all", type: "electric", q: "" })).toBe(true);
  });
  it("filters out non-matching type", () => {
    expect(matchTile(base, { kind: "normal", gen: "all", region: "all", type: "water", q: "" })).toBe(false);
  });
  it("type=all keeps all", () => {
    expect(matchTile(base, { kind: "normal", gen: "all", region: "all", type: "all", q: "" })).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/settings-filter-type.test.mjs`
Expected: FAIL（type未対応で `water` でも true）

- [ ] **Step 3: Write minimal implementation**

`src/settings/filter.mjs` の `matchTile` に、検索条件の手前へタイプ判定を追加：

```js
  if (sel.type && sel.type !== "all") {
    const types = Array.isArray(tile.types) ? tile.types : [];
    if (!types.includes(sel.type)) return false;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/settings-filter-type.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/settings/filter.mjs tests/settings-filter-type.test.mjs
git commit -m "feat(box): タイプ絞り込みを filter に追加"
```

---

## Task 6: 手持ち（パーティ）純操作モジュール

**Files:**
- Create: `src/settings/party.mjs`
- Test: `tests/party.test.mjs`

**Interfaces:**
- Produces:
  - `PARTY_MAX = 6`
  - `addToParty(party, id) -> string[]`（空きがあれば末尾追加。満杯/既属なら不変）
  - `removeFromParty(party, id) -> string[]`
  - `replaceInParty(party, slotId, newId) -> string[]`（満杯時に slotId を newId へ置換。newId が既属なら不変）
  - `setLead(party, id) -> string[]`（id を先頭へ移動＝相棒。未所属なら不変）
  - `isFull(party) -> boolean`

- [ ] **Step 1: Write the failing test**

```js
// tests/party.test.mjs
import { describe, it, expect } from "vitest";
import { addToParty, removeFromParty, replaceInParty, setLead, isFull, PARTY_MAX } from "../src/settings/party.mjs";

describe("party", () => {
  it("adds until full (6)", () => {
    let p = [];
    for (let i = 0; i < 8; i++) p = addToParty(p, "m" + i);
    expect(p.length).toBe(PARTY_MAX);
    expect(isFull(p)).toBe(true);
    expect(p).toEqual(["m0", "m1", "m2", "m3", "m4", "m5"]);
  });
  it("does not duplicate", () => {
    expect(addToParty(["a"], "a")).toEqual(["a"]);
  });
  it("removes", () => {
    expect(removeFromParty(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });
  it("replaces a slot when full", () => {
    const full = ["a", "b", "c", "d", "e", "f"];
    expect(replaceInParty(full, "c", "z")).toEqual(["a", "b", "z", "d", "e", "f"]);
  });
  it("does not replace with an already-present member", () => {
    const full = ["a", "b", "c", "d", "e", "f"];
    expect(replaceInParty(full, "c", "a")).toEqual(full);
  });
  it("sets lead to front", () => {
    expect(setLead(["a", "b", "c"], "c")).toEqual(["c", "a", "b"]);
    expect(setLead(["a", "b"], "z")).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/party.test.mjs`
Expected: FAIL（モジュール未作成）

- [ ] **Step 3: Write minimal implementation**

```js
// src/settings/party.mjs
// 手持ち（最大6・先頭=相棒）の純操作。UIと設定保存の両方から使う。
export const PARTY_MAX = 6;

export function isFull(party) {
  return (party || []).length >= PARTY_MAX;
}
export function addToParty(party, id) {
  const p = Array.isArray(party) ? party.slice() : [];
  if (!id || p.includes(id) || p.length >= PARTY_MAX) return p;
  p.push(id);
  return p;
}
export function removeFromParty(party, id) {
  return (Array.isArray(party) ? party : []).filter((x) => x !== id);
}
export function replaceInParty(party, slotId, newId) {
  const p = Array.isArray(party) ? party.slice() : [];
  if (!newId || p.includes(newId)) return p;
  const i = p.indexOf(slotId);
  if (i === -1) return p;
  p[i] = newId;
  return p;
}
export function setLead(party, id) {
  const p = Array.isArray(party) ? party.slice() : [];
  const i = p.indexOf(id);
  if (i <= 0) return p;
  p.splice(i, 1);
  p.unshift(id);
  return p;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/party.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/settings/party.mjs tests/party.test.mjs
git commit -m "feat(party): 手持ち最大6・先頭=相棒の純操作を追加"
```

---

## Task 7: settings-store（手持ち6・ニックネーム・Coming Soon既定OFF）

**Files:**
- Modify: `src/main/settings-store.js`
- Test: `tests/settings-store-redesign.test.js`（既存 `tests/settings-store.test.js` は壊さない）

**Interfaces:**
- Produces: `DEFAULTS` で `edgeRest:false`、`avoidCursor:false`、`appReactionsEnabled:false`（Coming Soon＝既定OFF）。`mode:"follow"` 維持。`nicknames:{}` 追加。`favoritePacks` 上限 12→6。`sanitize` が `nicknames`（`{ [packId]: string }`、packIdは `isSafePackKey`、値は1..24文字へtrim）を許可。

- [ ] **Step 1: Write the failing test**

```js
// tests/settings-store-redesign.test.js
const { DEFAULTS, sanitize } = require("../src/main/settings-store.js");

test("coming-soon behaviors default OFF", () => {
  expect(DEFAULTS.edgeRest).toBe(false);
  expect(DEFAULTS.avoidCursor).toBe(false);
  expect(DEFAULTS.appReactionsEnabled).toBe(false);
  expect(DEFAULTS.mode).toBe("follow");
});

test("party cap is 6", () => {
  const many = Array.from({ length: 10 }, (_, i) => `retro/gen-1/00${i}-x`.replace("00", "0"));
  const safe = ["retro/gen-1/001-bulbasaur","retro/gen-1/004-charmander","retro/gen-1/007-squirtle","retro/gen-1/025-pikachu","retro/gen-1/133-eevee","retro/gen-1/006-charizard","retro/gen-1/009-blastoise"];
  const out = sanitize({ favoritePacks: safe });
  expect(out.favoritePacks.length).toBe(6);
});

test("nicknames are sanitized to safe pack keys and trimmed", () => {
  const out = sanitize({ nicknames: {
    "retro/gen-1/025-pikachu": "  ピカ  ",
    "../evil": "x",
    "retro/gen-1/001-bulbasaur": "",
  }});
  expect(out.nicknames["retro/gen-1/025-pikachu"]).toBe("ピカ");
  expect(out.nicknames["../evil"]).toBeUndefined();
  expect(out.nicknames["retro/gen-1/001-bulbasaur"]).toBeUndefined(); // 空は捨てる
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/settings-store-redesign.test.js`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

`DEFAULTS` を更新：`edgeRest: false`、`avoidCursor: false`、`appReactionsEnabled: false`、末尾に `nicknames: {}` を追加。
favorites上限を 6 に：`if (safePacks.length >= 12) break;` を `>= 6` に。
`sanitize` の `favoritePacks` 分岐の後に `nicknames` 分岐を追加：

```js
    if (k === "nicknames") {
      const src = (v && typeof v === "object" && !Array.isArray(v)) ? v : {};
      const out2 = {};
      for (const [pk, name] of Object.entries(src)) {
        if (!isSafePackKey(pk)) continue;
        const nm = typeof name === "string" ? name.trim().slice(0, 24) : "";
        if (nm) out2[pk] = nm;
      }
      out.nicknames = out2;
      continue;
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/settings-store-redesign.test.js`
Then: `npx vitest run tests/settings-store.test.js`（既存が壊れていないか）。既存テストが旧既定値(edgeRest:true等)を期待していたら、その期待値を新既定に合わせて更新する（挙動の意図変更＝既定OFF）。

- [ ] **Step 5: Commit**

```bash
git add src/main/settings-store.js tests/settings-store-redesign.test.js tests/settings-store.test.js
git commit -m "feat(settings): 手持ち6・ニックネーム・ComingSoon既定OFF"
```

---

## Task 8: IPC追加（packs:meta / nickname:set / party:set-lead）

**Files:**
- Modify: `src/main/main.js`（IPC handlers・設定ウィンドウ寸法）
- Modify: `src/settings/settings-preload.js`
- Test: `tests/settings-preload-surface.test.js`

**Interfaces:**
- Produces（preload）:
  - `getPackMeta(packKey) -> invoke("packs:meta", packKey)`
  - `setNickname(packKey, name) -> invoke("nickname:set", { packKey, name })`
  - `setLead(packKey) -> invoke("party:set-lead", packKey)`
- Produces（main）:
  - `packs:meta` → `packReader.readPackMeta(packKey)`（`{ resolvedKey, meta }`、meta は rawPath/states を含む）
  - `nickname:set` → settingsStore.set で `nicknames` をマージして全体を返す
  - `party:set-lead` → favoritePacks を setLead して保存＋ `pack` を先頭に切替

- [ ] **Step 1: Write the failing test**

```js
// tests/settings-preload-surface.test.js
const fs = require("node:fs");
const path = require("node:path");
const src = fs.readFileSync(path.join(__dirname, "..", "src", "settings", "settings-preload.js"), "utf8");

test("preload exposes new IPC surfaces", () => {
  expect(src).toContain('getPackMeta: (packKey) => ipcRenderer.invoke("packs:meta", packKey)');
  expect(src).toContain('setNickname: (packKey, name) => ipcRenderer.invoke("nickname:set", { packKey, name })');
  expect(src).toContain('setLead: (packKey) => ipcRenderer.invoke("party:set-lead", packKey)');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/settings-preload-surface.test.js`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

`src/settings/settings-preload.js` の `exposeInMainWorld` 内に3行追加（`exportCodexPet` の後）：

```js
  getPackMeta: (packKey) => ipcRenderer.invoke("packs:meta", packKey),
  setNickname: (packKey, name) => ipcRenderer.invoke("nickname:set", { packKey, name }),
  setLead: (packKey) => ipcRenderer.invoke("party:set-lead", packKey),
```

`src/main/main.js` の IPC群（`packs:list` の近く）に追加：

```js
ipcMain.handle("packs:meta", (event, packKey) => {
  requireSettingsSender(event);
  try { return packReader.readPackMeta(packKey); }
  catch (_) { return null; }
});
ipcMain.handle("nickname:set", (event, payload) => {
  requireSettingsSender(event);
  const packKey = payload && payload.packKey;
  const name = payload && payload.name;
  const nicknames = { ...(settingsStore.get("nicknames") || {}) };
  if (typeof name === "string" && name.trim()) nicknames[packKey] = name;
  else delete nicknames[packKey];
  return settingsStore.set({ nicknames });
});
ipcMain.handle("party:set-lead", (event, packKey) => {
  requireSettingsSender(event);
  const { setLead } = require("../settings/party.mjs"); // ※ESM相互運用が不可なら下記注を参照
  const party = setLead(settingsStore.get("favoritePacks"), packKey);
  settingsStore.set({ favoritePacks: party });
  applySettingsPatch({ pack: packKey }, { settingsStore, sim, loadPackIntoSim, setEnabled, refreshTrayMenu, syncFavoriteRotation });
  return settingsStore.getAll();
});
```

> ⚠ 注: main.js は CommonJS。`party.mjs` を require できない場合は、`party.mjs` のロジック（`setLead`）を main 側にインラインで複製せず、`src/main/party-core.cjs` として CommonJS 版を切り出し、`party.mjs` から再export する形にする（DRY）。実装時に相互運用を確認し、ダメなら party を `.cjs` 化して settings.js からは別途読む。**この判断はTask実装者がモジュール形式を確認してから決める。**

設定ウィンドウ寸法：`width: 420, height: 760` を維持（タブUIで足りなければ実装時に調整し、verify を合わせて更新）。

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/settings-preload-surface.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main/main.js src/settings/settings-preload.js tests/settings-preload-surface.test.js
git commit -m "feat(ipc): packs:meta / nickname:set / party:set-lead を追加"
```

---

## Task 9: 新DOM＋CSS（3タブの骨格）

**Files:**
- Modify: `src/settings/settings.html`（全面刷新）

**Interfaces:**
- Produces（settings.js / verify が依存するDOM契約）:
  - タブバー: `<nav id="tabs">` 内に `<button class="tab" data-tab="aibou">あいぼう</button>`、`data-tab="box"`（ボックス）、`data-tab="settings"`（せってい）。
  - パネル: `<section id="panel-aibou">`、`<section id="panel-box">`、`<section id="panel-settings">`。
  - あいぼう: `#heroSprite`（相棒大表示の器）、`#heroName`（名前）、`#heroNum`（#番号）、`#heroTypes`（タイプチップ器）、`#nicknameEdit`（✎ボタン）、スライダー `#scale`/`#offset`/`#lerp`（既存ID維持、ラベルは「大きさ/距離/速さ」）、`#partyRowAibou`（手持ち列）、`#roamSoon`（おさんぽ近日・disabled）。
  - ボックス: `#partyRowBox`（手持ち列・常駐）、`#search`、`#kind`（通常/地方フォルム）、`#genChips`、`#typeChips`（タイプ絞り込み）、`#grid`。
  - せってい: `#enabled`（表示する）、`#notificationCompanion`+`#testCompanion`、`#exportCodexPet`、`#comingSoonList`（近日公開の説明）。
  - スクリプト読み込み順: `generation-labels.js` → `search-engine.js` → `settings.js`（type-colors/party/filter/sprite-view は settings.js から ESM import）。

- [ ] **Step 1: 新しい settings.html を書く**

旧 `<body>` 内容を、上記DOM契約を満たす3タブ構造へ全面置換する。CSSは内部 `<style>` に、下タブ固定・パネル切替（`.panel[hidden]`）・ヒーロー中央寄せ・手持ち6枠の横並び・タイプチップ・グリッド（`flex: 1 1 280px` / `min-height: 160px` を維持）を実装。命名は日本語（大きさ/距離/速さ/手持ち/表示する 等）。スライダーのIDと属性（`#scale` min0.5 max5.0 step0.05、`#offset` min0 max100 step1、`#lerp` min0.5 max5.0 step0.1）は既存維持。`#kind` の option は `通常`/`地方フォルム`。世代チップ（data-gen と tooltip 文言）は既存の文言を維持（verify が参照）。

> 実装ガイド: 旧HTMLの「search/kind/genChips/grid/scale/offset/lerp/enabled/notificationCompanion/testCompanion/exportCodexPet」要素は**IDを維持して移設**する（settings.js とverifyの差分を最小化）。削除するのは旧 behaviors 行（edgeRest/avoidCursor/avoidCursorStrength/appReactions）・mode/personality・workWatch一式・rotation一式・favoriteAdd/Next/Clear（これらは Coming Soon かパーティ列へ置換）。

- [ ] **Step 2: 静的検証（最低限の存在チェック）**

Run: `node -e "const h=require('fs').readFileSync('src/settings/settings.html','utf8');for(const id of ['tabs','panel-aibou','panel-box','panel-settings','heroSprite','heroName','heroTypes','partyRowAibou','partyRowBox','typeChips','search','kind','genChips','grid','scale','offset','lerp','enabled','notificationCompanion','exportCodexPet','comingSoonList','roamSoon','nicknameEdit']){if(!h.includes('id=\"'+id+'\"')){console.error('MISSING',id);process.exit(1)}}console.log('html ids ok')"`
Expected: `html ids ok`

- [ ] **Step 3: Commit**

```bash
git add src/settings/settings.html
git commit -m "feat(ui): 設定を3タブDOM(あいぼう/ボックス/せってい)へ刷新"
```

---

## Task 10: ヒーロー用スプライト描画モジュール

**Files:**
- Create: `src/settings/sprite-view.mjs`
- Test: `tests/sprite-view.test.mjs`

**Interfaces:**
- Consumes: パックメタ `{ resolvedKey, meta: { rawPath, states: { idle: { sheet, frame:{w,h}, fps, frames, rows } } } }`。
- Produces:
  - `idleSheetUrl(meta) -> string`（`app://bundle/assets/raw/<rawPath>/<idle.sheet>`）
  - `frameBackgroundPosition(frameIndex, row, frame) -> string`（`"-{x}px -{y}px"`、overlay と同式）
  - `mountIdleSprite(el, packMeta, { row = 0 } = {}) -> stop()`（背景画像/サイズを設定し、fpsで frame を回す。`requestAnimationFrame` ベース、`stop()` で停止）

- [ ] **Step 1: Write the failing test**

```js
// tests/sprite-view.test.mjs
import { describe, it, expect } from "vitest";
import { idleSheetUrl, frameBackgroundPosition } from "../src/settings/sprite-view.mjs";

describe("sprite-view", () => {
  it("builds the idle sheet url from rawPath + sheet", () => {
    const meta = { meta: { rawPath: "gen-1/025-pikachu", states: { idle: { sheet: "Idle-Anim.png" } } } };
    expect(idleSheetUrl(meta)).toBe("app://bundle/assets/raw/gen-1/025-pikachu/Idle-Anim.png");
  });
  it("computes frame background position like the overlay", () => {
    expect(frameBackgroundPosition(2, 1, { w: 32, h: 40 })).toBe("-64px -40px");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/sprite-view.test.mjs`
Expected: FAIL

- [ ] **Step 3: Write minimal implementation**

```js
// src/settings/sprite-view.mjs
// あいぼうの相棒大表示: パックメタの Idle アニメを背景位置送りで再生する（overlay.js と同方式）。
export function idleSheetUrl(packMeta) {
  const meta = packMeta && packMeta.meta ? packMeta.meta : {};
  const idle = meta.states && meta.states.idle ? meta.states.idle : {};
  return `app://bundle/assets/raw/${meta.rawPath}/${idle.sheet}`;
}
export function frameBackgroundPosition(frameIndex, row, frame) {
  return `${-(frameIndex * frame.w)}px ${-(row * frame.h)}px`;
}
// el: 表示器。packMeta: getPackMeta() の戻り。戻り値 stop() でアニメ停止。
export function mountIdleSprite(el, packMeta, { row = 0 } = {}) {
  const meta = packMeta && packMeta.meta ? packMeta.meta : null;
  const idle = meta && meta.states && meta.states.idle ? meta.states.idle : null;
  if (!el || !idle) return () => {};
  const { w, h } = idle.frame;
  const frames = Number(idle.frames) || 1;
  const fps = Number(idle.fps) || 8;
  el.style.backgroundImage = `url("${idleSheetUrl(packMeta)}")`;
  el.style.width = `${w}px`;
  el.style.height = `${h}px`;
  el.style.backgroundRepeat = "no-repeat";
  el.style.imageRendering = "pixelated";
  let i = 0, last = 0, raf = 0, running = true;
  const tick = (t) => {
    if (!running) return;
    if (!last) last = t;
    if (t - last >= 1000 / fps) {
      el.style.backgroundPosition = frameBackgroundPosition(i, row, idle.frame);
      i = (i + 1) % frames;
      last = t;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => { running = false; cancelAnimationFrame(raf); };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/sprite-view.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/settings/sprite-view.mjs tests/sprite-view.test.mjs
git commit -m "feat(ui): 相棒Idleアニメ描画モジュールを追加"
```

---

## Task 11: settings.js 刷新（タブ・あいぼう・ボックス・せってい配線）

**Files:**
- Modify: `src/settings/settings.js`（全面刷新）

**Interfaces:**
- Consumes: `window.settingsApi`（既存＋Task8の新IPC）、`window.PokeFollowerSearch`、`window.PokeFollowerGenerationLabels`、ESM import で `type-colors.mjs`/`party.mjs`/`filter.mjs`/`sprite-view.mjs`。
- Produces（verify契約）: 後述 Task12 の検証が通るDOM操作。

> 注: settings.js を ESM import 可能にするため、`settings.html` の読み込みを `<script type="module" src="settings.js"></script>` にする（Task9で対応）。`generation-labels.js`/`search-engine.js` は従来通り window グローバルを使う（importしない）。

- [ ] **Step 1: タブ切替を実装**

`settings.js` 冒頭（DOMContentLoaded内）に、`#tabs` のボタンで `.panel` を出し分けるロジックを追加：

```js
function initTabs() {
  const tabs = document.getElementById("tabs");
  const panels = { aibou: "panel-aibou", box: "panel-box", settings: "panel-settings" };
  function show(name) {
    for (const [k, id] of Object.entries(panels)) {
      const p = document.getElementById(id);
      if (p) p.hidden = (k !== name);
    }
    for (const b of tabs.querySelectorAll(".tab")) b.classList.toggle("active", b.dataset.tab === name);
  }
  tabs.addEventListener("click", (e) => {
    const b = e.target.closest(".tab");
    if (b) show(b.dataset.tab);
  });
  show("aibou");
}
```

- [ ] **Step 2: あいぼう（相棒大表示＋スライダー＋手持ち列）を配線**

`getPackMeta(activePack)` を取得して `mountIdleSprite(#heroSprite, meta)`、`#heroName`（ニックネーム優先・無ければ ja）、`#heroNum`、`#heroTypes`（types を `typeColor`/`typeJa` でチップ化）。`#nicknameEdit` で `setNickname` を呼ぶ。スライダー（scale/offset/lerp）は**既存の commit ロジックをそのまま流用**（Task内で関数を移植）。手持ち列 `#partyRowAibou` は favoritePacks を描画し、枠タップで `setLead(packKey)`（→相棒切替）、`×` で `removeFavorite`。

- [ ] **Step 3: ボックス（手持ち列常駐＋検索＋フィルタ＋グリッド）を配線**

`#partyRowBox` を常駐描画。`initGrid` 相当を移植しつつ、`matchTile` を import 版に差し替え、`#typeChips`（type-colors から18チップ＋全）を生成して `selectedType` を AND。タイル click は**選択ではなく手持ち操作**に変更：

```js
function onTileTap(packId) {
  let party = currentParty();
  if (party.includes(packId)) { setLeadAndRefresh(packId); return; } // 既属→相棒に
  if (!isFull(party)) { party = addToParty(party, packId); persistParty(party); }
  else { enterReplaceMode(packId); } // 手持ち列が点滅→枠タップで replaceInParty
}
```

`enterReplaceMode` は `#partyRowBox` に `.replacing` を付け、枠クリックで `replaceInParty(party, slotId, pendingId)` → 保存 → モード解除。

- [ ] **Step 4: せってい（表示・通知・Codex・近日公開）を配線**

`#enabled`（表示する）、`#notificationCompanion`+`#testCompanion`、`#exportCodexPet`（現在の相棒=先頭を使う）を既存ロジックで配線。`#comingSoonList` は静的説明（JS操作不要）。**mode/personality/edgeRest/avoidCursor/appReactions/workWatch/rotation の配線は削除**（Coming Soon・既定OFF）。

- [ ] **Step 5: 手動確認用に最小スモークを足す（純関数の結線のみ）**

ここはDOM依存のため、結線の正しさは Task12 の verify と Task14 の起動確認で担保する。settings.js 内に純ロジックを増やさない（全て import 済みモジュールを使う）。

- [ ] **Step 6: Commit**

```bash
git add src/settings/settings.js
git commit -m "feat(ui): settings.js を3タブ・手持ち・タイプ色へ刷新"
```

---

## Task 12: verify-settings-ui.cjs を新DOMへ更新

**Files:**
- Modify: `scripts/verify-settings-ui.cjs`（全面更新）

**Interfaces:**
- Produces: 新DOM契約（Task9/11）に対する不変条件チェック。旧 behaviors/mode/personality/workWatch/rotation の必須チェックは削除し、3タブ・あいぼう要素・手持ち列・タイプチップ・新IPC surface を必須化。

- [ ] **Step 1: 旧チェックを新契約へ置換**

`scripts/verify-settings-ui.cjs` を以下方針で更新：
- 必須ID（html/js）: `tabs, panel-aibou, panel-box, panel-settings, heroSprite, heroName, heroTypes, nicknameEdit, partyRowAibou, partyRowBox, search, kind, genChips, typeChips, grid, scale, offset, lerp, enabled, notificationCompanion, testCompanion, exportCodexPet, comingSoonList, roamSoon`。
- 維持: 世代チップ（data-gen と tooltip 文言）・`placeholder="名前・タイプ・作品名で検索"`・`role="listbox"`・スライダー属性（scale/offset/lerp の min/max/step）・`window.PokeFollowerSearch`・`getSearchMetadata`。
- 追加: preload surface に `packs:meta`/`nickname:set`/`party:set-lead` を必須化。`settings.js` が `type-colors.mjs`/`party.mjs`/`filter.mjs`/`sprite-view.mjs` を import していること（`from "./type-colors.mjs"` 等）。
- 削除: edgeRest/avoidCursor/avoidCursorStrength/appReactions/personality/mode/workWatch*/rotation*/favoriteAdd/Next/Clear の必須チェック、旧 mapKeys マッピングのうち削除したキー、旧既定値（edgeRest:true 等）のチェック。
- 設定ウィンドウ寸法チェックは実装後の実値に合わせる（Task9で変えたら合わせる）。

- [ ] **Step 2: 実行して緑を確認**

Run: `node scripts/verify-settings-ui.cjs`
Expected: `[verify-settings-ui] ok: ...`

- [ ] **Step 3: Commit**

```bash
git add scripts/verify-settings-ui.cjs
git commit -m "test(ui): verify-settings-ui を3タブDOM契約へ更新"
```

---

## Task 13: 既存 verify との整合（mapKeys/旧キー掃除）

**Files:**
- Modify: 必要に応じて `scripts/verify-roadmap-issues.cjs` 等（旧UI機能の言及）
- Modify: `src/settings/settings.js`（`mapKeys` から削除キーを除去）

- [ ] **Step 1: 旧キー参照を掃除**

`mapKeys` から削除した機能（edgeRest/avoidCursor/personality/mode/workWatch/rotation/appReactions）のマッピングを除去（保存しないため）。Grep で旧ID/関数の死参照が無いか確認：

Run: `grep -rn "avoidCursorStrength\|workWatchStart\|rotationInterval\|personalityEl" src/settings/settings.js`
Expected: 出力なし（全て除去済み）。残っていれば削除。

- [ ] **Step 2: STATUS/README の機能記述を整合**

`docs/STATUS.md` の「現在含まれているもの」から、Coming Soon化した機能（散歩/性格/作業見守り/端休み/よける/アプリ反応）を「近日」へ移すか注記。`verify-roadmap-issues.cjs`/`verify-docs-consistency.cjs` が落ちないよう文言を合わせる。

Run: `npm run verify:local`
Expected: 全ゲート ok（落ちた項目の文言を合わせて再実行）。

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore(ui): 旧UIキーの掃除とSTATUS整合"
```

---

## Task 14: 統合確認（verify:local 全緑＋Vitest＋起動）

**Files:**
- なし（検証のみ）

- [ ] **Step 1: 全ゲート**

Run: `npm run verify:local`
Expected: 18ゲート ok。

- [ ] **Step 2: 全テスト**

Run: `npx vitest run`
Expected: 全 PASS（新規テスト含む）。

- [ ] **Step 3: 起動確認（ユーザー連携）**

インストール版を終了してもらった上で `npm start`。あいぼう/ボックス/せってい のタブ切替、相棒のIdleアニメ表示、ボックスからの手持ち追加（空き=追加／満杯=枠タップ入替）、相棒切替、スライダー反映、ニックネーム編集、タイプ色チップ、検索（タイプで全種ヒット）を目視確認。

- [ ] **Step 4: 最終コミット（必要なら微修正）**

```bash
git add -A
git commit -m "chore(ui): 3タブ刷新の統合確認"
```

---

## Self-Review（記録）

- **Spec coverage**: 3タブ(Task9/11)・あいぼう相棒大表示(Task10/11)・手持ち6先頭=相棒(Task6/7/11)・ボックス常駐＋満杯入替(Task11)・タイプ色(Task1)＋全種タイプ(Task2/3/4)＋タイプ絞り込み(Task5)・検索充実(Task4で types付与→既存検索が活用)・命名総入れ替え(Task9/11)・ニックネーム(Task7/8/11)・Coming Soon既定OFF(Task7)・verify更新(Task12/13)・状態機械無変更（全タスクで遵守）。
- **検索の全種タイプ対応**: 既存 `search-engine.js` がタイプ検索に type-data を使うかは未確認。Task4 で pack-reader が types を返すため、必要なら search-engine 側で types を引く小改修を Task5 か Task11 で行う（実装時に search-engine の入力を確認し、types を渡す）。
- **ESM/CJS 相互運用**（party.mjs を main.js から使う）は Task8 の注記で実装者が確認して決定。
- **既存テスト破壊**: settings-store の既定値変更で `tests/settings-store.test.js` が落ちる可能性 → Task7 Step4 で更新。

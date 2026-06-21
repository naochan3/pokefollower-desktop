# 地方フォルム（アローラ等）対応 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 原種と図鑑番号を共有する地方フォルム（アローラ/ガラル/ヒスイ/パルデア）を別パックidとして追加し、設定ピッカーに「種類」軸を足して1行のチップで絞り込めるようにする。フォルムのアセットは全アニメを取得・保持する（消費は次回）。

**Architecture:** 地方フォルムは「id文字列で選ぶ別パック」として既存の追従基盤にそのまま乗る。追従の状態機械（`src/main/follower-sim.js` / `crates/follower_core`）は一切変更しない。変更は (1) アセット生成パイプライン、(2) index/pack-reader のデータモデル、(3) 設定UIフィルタ、(4) 検証スクリプト の4領域。

**Tech Stack:** Node ESM スクリプト（`gh api`, `fetch`, `fast-xml-parser`, `sharp`）、Electron 設定UI（vanilla JS）、CommonJS 検証スクリプト、Vitest。

## Global Constraints

- 状態機械を変更しない: `src/main/follower-sim.js`、`crates/follower_core/**`、`native/*.wasm` に触れない。
- 各タスク着手前に `git fetch origin && git merge --ff-only origin/main`（Nicolas が `settings.js`/`settings.html`/`follower-sim.js` を頻繁に更新するため）。Nicolas の既存機能（#48/#49/#51 等）はビルド・リリース・改変しない。
- フィーチャーブランチ `feature/regional-forms`（現行main基準）。main直push不可、PRで出す。
- パスセキュリティ: フォルム用に許可するのは `retro/forms/<region>/<dex>-<slug>` の厳密形のみ。`..`・ワイルドカードを通さない。
- 既存956種は再取得・再生成しない。全アニメ取得は今回追加するフォルムにのみ適用。
- region スラッグは `alola | galar | hisui | paldea` の4種のみ。
- パックJSONの全アニメは既存スキーマ（`{sheet,frame:{w,h},fps,frames,rows:{8方向}}`）を流用し `states[<anim名小文字>]` に格納（Nicolas roam の `meta.states[name]` アクセサと互換）。

---

### Task 1: asset-path がフォルムidを安全に解決する

**Files:**
- Modify: `src/main/asset-path.js`
- Test: `tests/asset-path.test.js`（無ければ新規）

**Interfaces:**
- Produces: `isSafePackKey("retro/forms/alola/026-raichu") === true`、`buildPackCandidates("retro/forms/alola/026-raichu")` が `["retro/forms/alola/026-raichu"]` を返す（gen推定を行わない）。

- [ ] **Step 1: 失敗するテストを書く**

`tests/asset-path.test.js` に追記（無ければ `const { isSafePackKey, buildPackCandidates } = require("../src/main/asset-path.js");` で開始）:

```js
const { test, expect } = require("vitest");
const { isSafePackKey, buildPackCandidates } = require("../src/main/asset-path.js");

test("forms key is safe and resolves to itself only", () => {
  const key = "retro/forms/alola/026-raichu";
  expect(isSafePackKey(key)).toBe(true);
  expect(buildPackCandidates(key)).toEqual([key]);
});

test("forms key rejects traversal and bad region", () => {
  expect(isSafePackKey("retro/forms/../gen-1/026-raichu")).toBe(false);
  expect(isSafePackKey("retro/forms/Alola/026-raichu")).toBe(false); // 大文字不可
  expect(isSafePackKey("retro/forms/alola/")).toBe(false);
});
```

- [ ] **Step 2: 失敗を確認** — `npx vitest run tests/asset-path.test.js` → FAIL（forms が unsafe 判定）。

- [ ] **Step 3: 実装**

`src/main/asset-path.js`:

```js
// PACK_KEY_PATTERN を差し替え（forms/<region>/ を許可。region は小文字英字のみ）
const PACK_KEY_PATTERN = /^retro\/(?:gen-[1-9]\/|forms\/[a-z]+\/)?[0-9]{3,4}-[a-z0-9-]+$/;
```

`buildPackCandidates` の gen 推定分岐をフォルムに適用しないよう、関数先頭付近に早期 return を追加:

```js
function buildPackCandidates(packKey) {
  const clean = typeof packKey === "string" ? packKey.trim().replace(/^\/+|\/+$/g, "") : "";
  if (!clean) return [DEFAULT_PACK];
  if (!isSafePackKey(clean)) return [];
  // フォルムは完全修飾。gen 推定を行わずそのまま返す。
  if (clean.startsWith("retro/forms/")) return [clean];
  const candidates = [clean];
  if (!clean.includes("/gen-")) {
    // …（既存のまま）
  }
  return candidates;
}
```

- [ ] **Step 4: パス** — `npx vitest run tests/asset-path.test.js` → PASS。既存 asset-path テストも維持。

- [ ] **Step 5: コミット** — `git add src/main/asset-path.js tests/asset-path.test.js && git commit -m "feat(forms): asset-path がフォルムidを安全解決"`

---

### Task 2: parse-anim が全アニメを states に出力する

**Files:**
- Modify: `scripts/parse-anim.mjs`
- Test: `tests/parse-anim-allstates.test.mjs`（新規）

**Interfaces:**
- Produces: parse-anim の出力 `states` に、AnimData.xml の全 `Anim` がキー小文字で入る（最低でも idle/walk/sleep を含む。`--all` フラグ時）。既存呼び出し（フラグ無し）の idle/walk/sleep 出力は不変。

**背景:** 現状 parse-anim は `--idle/--walk/--sleep` で指定した3シートのみ `states` に出力する。フォルム用に「AnimData.xml に存在する全 Anim を、対応する `<Name>-Anim.webp` シートが raw に存在する分だけ states に出力」する `--all` モードを足す。各 state は既存スキーマ（sheet/frame/fps/frames/rows 8方向）。row は既存の方向推定ロジックを流用（多くの Anim は 8 方向 = row 0..7、単方向 Anim は全方向 row 0）。

- [ ] **Step 1: 失敗するテストを書く**

`tests/parse-anim-allstates.test.mjs`:

```js
import { test, expect } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// フィクスチャ: 既存 raw を1体使い --all で複数 state が出ることを確認
test("--all emits idle/walk/sleep plus extra anims when sheets exist", () => {
  const out = path.join(os.tmpdir(), `pa-${process.pid}.json`);
  // gen-1 ブラストイズは Idle/Walk/Sleep のみ raw に存在 → 最低3 state
  execFileSync("node", [
    "scripts/parse-anim.mjs",
    "--xml", "assets/raw/gen-1/009-blastoise/AnimData.xml",
    "--dir", "assets/raw/gen-1/009-blastoise",
    "--name", "009-blastoise", "--generation", "gen-1",
    "--out", out, "--all",
  ]);
  const pack = JSON.parse(fs.readFileSync(out, "utf8"));
  expect(pack.states.idle).toBeTruthy();
  expect(pack.states.walk).toBeTruthy();
  expect(Object.keys(pack.states).length).toBeGreaterThanOrEqual(2);
  fs.rmSync(out, { force: true });
});
```

- [ ] **Step 2: 失敗を確認** — `npx vitest run tests/parse-anim-allstates.test.mjs` → FAIL（`--all` 未実装）。

- [ ] **Step 3: 実装**

`scripts/parse-anim.mjs` に `--all` を追加。フラグ時は anims 配列を走査し、`<Name>-Anim.webp`（小文字化前の Name）が baseDir に存在する Anim だけ state 化する。既存の単一 state 構築ロジック（frame/fps/frames/rows 算出）を関数に切り出し、各 Anim に適用してから `states[name.toLowerCase()] = stateObj` を書く。シート名は実ファイル名（例 `Attack-Anim.webp`）。idle/walk/sleep の row/fps 規約は現行ロジックを維持。

```js
const emitAll = process.argv.includes('--all');
// …既存の単一state構築を buildState(anim, sheetFile, rowOverride, fpsArg) に切り出す…
if (emitAll) {
  const states = {};
  for (const anim of anims) {
    const nm = String(anim.Name || '').trim();
    if (!nm) continue;
    const sheetFile = `${nm}-Anim.webp`;
    if (!fs.existsSync(path.join(baseDir, sheetFile))) continue;
    states[nm.toLowerCase()] = buildState(resolveCopy(anim), sheetFile);
  }
  writePack(states); // name/generation/rawPath/flipX + states
} else {
  // 既存の idle/walk/sleep 経路（不変）
}
```

- [ ] **Step 4: パス** — `npx vitest run tests/parse-anim-allstates.test.mjs` → PASS。`node scripts/__check__/regen-existing.mjs`（既存キャリブレーション）も実行し、既存（非 --all）経路の frame/frames/rows/fps が不変であることを確認。

- [ ] **Step 5: コミット** — `git add scripts/parse-anim.mjs tests/parse-anim-allstates.test.mjs && git commit -m "feat(forms): parse-anim に全アニメ出力(--all)を追加"`

---

### Task 3: forms-manifest.mjs（地方フォルムの収録判定）

**Files:**
- Create: `scripts/forms-manifest.mjs`
- Create: `scripts/forms-region.mjs`（地方名→regionスラッグ判定。純関数・テスト対象）
- Test: `tests/forms-region.test.mjs`

**Interfaces:**
- Produces: `regionOf(subgroupName)` → `"alola"|"galar"|"hisui"|"paldea"|null`。`forms-manifest.mjs` 実行で `assets/packs/forms-manifest.json` = `{ includable:[{dex, region, subindex, baseSlug, slug}], missing:[{dex, region, name}] }`。

- [ ] **Step 1: 失敗するテストを書く**

`tests/forms-region.test.mjs`:

```js
import { test, expect } from "vitest";
import { regionOf } from "../scripts/forms-region.mjs";

test("maps regional subgroup names to slugs", () => {
  expect(regionOf("Alola")).toBe("alola");
  expect(regionOf("Galar")).toBe("galar");
  expect(regionOf("Galar_Zen")).toBe("galar"); // 派生はプレフィックスで丸める
  expect(regionOf("Hisui")).toBe("hisui");
  expect(regionOf("Paldea")).toBe("paldea");
  expect(regionOf("Mega_X")).toBe(null);
  expect(regionOf("Altcolor")).toBe(null);
  expect(regionOf("")).toBe(null);
});
```

- [ ] **Step 2: 失敗を確認** — `npx vitest run tests/forms-region.test.mjs` → FAIL。

- [ ] **Step 3: 実装**

`scripts/forms-region.mjs`:

```js
const REGIONS = ["alola", "galar", "hisui", "paldea"];
export function regionOf(name) {
  const n = String(name || "").toLowerCase();
  return REGIONS.find((r) => n.startsWith(r)) || null;
}
```

`scripts/forms-manifest.mjs`（`gen-manifest.mjs` を踏襲。tracker.json を取得→各 dex の `subgroups` を走査→`regionOf(name)` 非nullかつ `sprite_complete>=1` を候補→`gh api .../sprite/<d4>/<subindex>` で Idle/Walk/Sleep-Anim.png と AnimData.xml の4点が揃うものを includable。重複 region+dex は最初の1件を採用し残りは missing にログ）。`baseSlug` は tracker の原種 `name` を `toSlug`。`slug = <NNN>-<baseSlug>`。

- [ ] **Step 4: パス** — `npx vitest run tests/forms-region.test.mjs` → PASS。`node scripts/forms-manifest.mjs` を実行し `assets/packs/forms-manifest.json` が生成され includable に少なくとも `{dex:26, region:"alola"}` を含むことを目視確認（実数はここで確定）。

- [ ] **Step 5: コミット** — `git add scripts/forms-region.mjs scripts/forms-manifest.mjs tests/forms-region.test.mjs assets/packs/forms-manifest.json && git commit -m "feat(forms): 地方フォルム収録判定 forms-manifest を追加"`

---

### Task 4: gen-fetch.fetchForm + gen-build --forms（フォルム取得・変換・全アニメ）

**Files:**
- Modify: `scripts/gen-fetch.mjs`（`fetchForm` 追加）
- Modify: `scripts/gen-build.mjs`（`--forms` モード追加）
- Test: `tests/gen-fetch-form.test.mjs`（fetchForm の URL 構築を検証。ネットワーク無しでパス計算のみ）

**Interfaces:**
- Consumes: `forms-manifest.json`（Task 3）、parse-anim `--all`（Task 2）。
- Produces: `assets/packs/retro/forms/<region>/<slug>.json`、`assets/raw/forms/<region>/<slug>/*.webp`、`assets/ui/forms/<region>/<slug>.png`。

- [ ] **Step 1: 失敗するテストを書く**

`tests/gen-fetch-form.test.mjs`:

```js
import { test, expect } from "vitest";
import { formSpriteDir } from "../scripts/gen-fetch.mjs";

test("form sprite dir uses subindex under dex", () => {
  // dex 26, subindex "0001" → sprite/0026/0001
  expect(formSpriteDir(26, "0001")).toBe("0026/0001");
});
```

- [ ] **Step 2: 失敗を確認** — `npx vitest run tests/gen-fetch-form.test.mjs` → FAIL（`formSpriteDir` 未export）。

- [ ] **Step 3: 実装**

`scripts/gen-fetch.mjs` に追加（全 `*-Anim.png` を取得。一覧は `gh api .../contents/sprite/<dir>` で列挙し、`-Anim.png` で終わるものを全DL。tile は pokemondb の `<base>-<region>` を試行→404 で `none`）:

```js
export function formSpriteDir(dex, subindex) {
  return `${String(dex).padStart(4, "0")}/${subindex}`;
}

export async function fetchForm(dex, subindex, baseSlug, region, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const dir = formSpriteDir(dex, subindex);
  const got = { anim: false, sheets: [], tile: "none" };
  got.anim = await dl(`${SC}/${dir}/AnimData.xml`, path.join(destDir, "AnimData.xml"));
  const names = await listAnimSheets(dir); // gh api で *-Anim.png 列挙
  for (const n of names) {
    if (await dl(`${SC}/${dir}/${n}`, path.join(destDir, n))) got.sheets.push(n);
  }
  const pdb = `https://img.pokemondb.net/sprites/black-white/normal/${pokedbSlug(baseSlug)}-${region}.png`;
  got.tile = (await dl(pdb, path.join(destDir, "tile.png"))) ? "pokemondb" : "none";
  return got;
}
```

`scripts/gen-build.mjs` に `--forms` モード: `forms-manifest.json` の includable を回し、各フォルムを `fetchForm` → 全 png を `toWebp`（raw を `assets/raw/forms/<region>/<slug>/`）→ `parse-anim.mjs --all` でパック JSON（`generation:"forms/<region>"`, `rawPath:"forms/<region>/<slug>"`）→ tile を `assets/ui/forms/<region>/<slug>.png`（pokemondb 無ければ Idle 正面からフォールバック生成、既存ロジック流用）。

- [ ] **Step 4: パス** — `npx vitest run tests/gen-fetch-form.test.mjs` → PASS。単体実証として1体だけ生成: `node scripts/gen-build.mjs --forms --only 026-raichu`（`--only` で slug 一致のみ処理する分岐も足す）。`assets/packs/retro/forms/alola/026-raichu.json` に idle/walk/sleep＋追加 state が出ることを確認。

- [ ] **Step 5: コミット** — `git add scripts/gen-fetch.mjs scripts/gen-build.mjs tests/gen-fetch-form.test.mjs && git commit -m "feat(forms): gen-fetch/gen-build にフォルム取得・全アニメ変換を追加"`（生成アセットはまだコミットしない＝Task 9 で一括）

---

### Task 5: build-index がフォルムを再帰収集し region/ja を出力

**Files:**
- Modify: `scripts/build-index.mjs`
- Test: `tests/build-index-forms.test.mjs`

**Interfaces:**
- Consumes: `assets/packs/retro/forms/<region>/<slug>.json`、`jp-names.json`。
- Produces: `index.json` のフォルムエントリ `{ id, name:"<NNN>-<Base>-<Region>", region, ja:"<地方JA><原種JA>" }`。通常種は `{id,name}` のまま。

- [ ] **Step 1: 失敗するテストを書く**

`tests/build-index-forms.test.mjs`: 一時ディレクトリに `retro/gen-1/026-raichu.json`（通常）と `retro/forms/alola/026-raichu.json`（フォルム）を置き、build-index を関数化した `buildEntries(base, jp, existingNames)` を呼び、フォルムエントリに `region:"alola"`、`ja:"アローラライチュウ"`、通常エントリに region 無しを期待。

```js
import { test, expect } from "vitest";
import { buildEntries } from "../scripts/build-index.mjs";

test("form entry gets region and composed ja", () => {
  const jp = { "26": { ja: "ライチュウ", romaji: "Raichu" } };
  const entries = buildEntries({
    "gen-1": ["026-raichu"],
    "forms/alola": ["026-raichu"],
  }, jp, new Map());
  const form = entries.find((e) => e.id === "retro/forms/alola/026-raichu");
  expect(form.region).toBe("alola");
  expect(form.ja).toBe("アローラライチュウ");
  const base = entries.find((e) => e.id === "retro/gen-1/026-raichu");
  expect(base.region).toBeUndefined();
});
```

- [ ] **Step 2: 失敗を確認** — `npx vitest run tests/build-index-forms.test.mjs` → FAIL（`buildEntries` 未export）。

- [ ] **Step 3: 実装** — build-index を `buildEntries(tree, jp, existingNames)` に切り出し、`forms/<region>` ツリーを再帰収集。region JA は `{alola:"アローラ",galar:"ガラル",hisui:"ヒスイ",paldea:"パルデア"}`。`ja = REGION_JA[region] + jp[dex].ja`。`name = "<NNN>-<Base>-<Region(先頭大文字)>"`。既存名は保持。出力は dex 昇順、フォルムは原種直後に来るよう dex→region 順でソート。

- [ ] **Step 4: パス** — `npx vitest run tests/build-index-forms.test.mjs` → PASS。

- [ ] **Step 5: コミット** — `git add scripts/build-index.mjs tests/build-index-forms.test.mjs && git commit -m "feat(forms): build-index がフォルムを収集し region/ja を出力"`

---

### Task 6: pack-reader が region と ja を返す

**Files:**
- Modify: `src/main/pack-reader.js:28-46`
- Test: `tests/pack-reader.test.js`（既存に追記）

**Interfaces:**
- Produces: `readPackList()` の各要素に `region`（`item.region || null`）。`ja` は `item.ja`（フォルム）優先、無ければ `jp[dex].ja`。

- [ ] **Step 1: 失敗するテストを書く** — 一時 root に index.json（通常＋フォルムエントリ）と jp-names.json を置き、`makePackReader(root).readPackList()` がフォルム要素で `region:"alola"`、`ja:"アローラライチュウ"` を返すこと、通常要素で `region:null` を返すことを期待。

```js
test("readPackList surfaces region and form ja", () => {
  // root に index.json = {retro:[{id:"retro/forms/alola/026-raichu",name:"026-Raichu-Alola",region:"alola",ja:"アローラライチュウ"}]} 等を用意
  const list = makePackReader(root).readPackList();
  const form = list.find((p) => p.id === "retro/forms/alola/026-raichu");
  expect(form.region).toBe("alola");
  expect(form.ja).toBe("アローラライチュウ");
});
```

- [ ] **Step 2: 失敗を確認** — `npx vitest run tests/pack-reader.test.js` → FAIL（region undefined / ja が原種名）。

- [ ] **Step 3: 実装** — `readPackList` の map を変更:

```js
return {
  id: item.id,
  num: num,
  region: item.region || null,
  ja: item.ja || jpEntry.ja || null,
  romaji: jpEntry.romaji || null,
  en: en || slug,
};
```

- [ ] **Step 4: パス** — `npx vitest run tests/pack-reader.test.js` → PASS。

- [ ] **Step 5: コミット** — `git add src/main/pack-reader.js tests/pack-reader.test.js && git commit -m "feat(forms): pack-reader が region/フォルムja を返す"`

---

### Task 7: 設定UI — 種類セレクタとチップ意味切替

**Files:**
- Modify: `src/settings/settings.html`（`#kind` 追加・UIパス一般化）
- Modify: `src/settings/settings.js`（`initGrid`/`applyFilter`/チップ再描画）
- Test: `tests/settings-filter.test.mjs`（フィルタ純関数を切り出してテスト）

**Interfaces:**
- Consumes: `listPacks()` の `region`（Task 6）。
- Produces: 種類 `通常`/`地方フォルム` 切替で、チップ行が `全/1-9` ↔ `全/地方` に切替わり、タイルが種類×(世代|地方)×検索でフィルタされる。

- [ ] **Step 1: 失敗するテストを書く**

`tests/settings-filter.test.mjs`（settings.js から純関数 `matchTile(tile, {kind, gen, region, search})` を export して検証）:

```js
import { test, expect } from "vitest";
import { matchTile } from "../src/settings/filter.mjs";

const base = { region: "", gen: "1", search: " raichu " };
const alola = { region: "alola", gen: "1", search: " アローラライチュウ " };

test("normal kind hides forms", () => {
  expect(matchTile(base, { kind: "normal", gen: "all", region: "all", q: "" })).toBe(true);
  expect(matchTile(alola, { kind: "normal", gen: "all", region: "all", q: "" })).toBe(false);
});
test("forms kind shows only forms, filtered by region", () => {
  expect(matchTile(alola, { kind: "forms", gen: "all", region: "alola", q: "" })).toBe(true);
  expect(matchTile(alola, { kind: "forms", gen: "all", region: "galar", q: "" })).toBe(false);
  expect(matchTile(base, { kind: "forms", gen: "all", region: "all", q: "" })).toBe(false);
});
```

- [ ] **Step 2: 失敗を確認** — `npx vitest run tests/settings-filter.test.mjs` → FAIL（`src/settings/filter.mjs` 無し）。

- [ ] **Step 3: 実装**

`src/settings/filter.mjs`（パッケージング耐性のため settings.js にも同ロジックをインライン化。`gen-util.js` と同方針）:

```js
export function matchTile(tile, sel) {
  const isForm = !!tile.region;
  if (sel.kind === "normal" && isForm) return false;
  if (sel.kind === "forms" && !isForm) return false;
  if (sel.kind === "normal") {
    if (sel.gen !== "all" && String(tile.gen) !== String(sel.gen)) return false;
  } else {
    if (sel.region !== "all" && tile.region !== sel.region) return false;
  }
  if (sel.q && !tile.search.includes(sel.q)) return false;
  return true;
}
```

`settings.html`: `#genChips` の直前に種類セレクタを追加（`.select-row` 様式流用）:

```html
<label class="select-row" for="kind">
  <span>種類</span>
  <select id="kind">
    <option value="normal">通常</option>
    <option value="forms">地方フォルム</option>
  </select>
</label>
```

`settings.js`:
- タイル生成で `btn.dataset.region = p.region || ""`、UI画像ディレクトリを `p.id.split("/").slice(1, -1).join("/")`（通常=`gen-1`、フォルム=`forms/alola`）で導出。
- 状態 `selectedKind='normal'`、`selectedRegion='all'`。`#kind` 変更で `renderChips()`（通常→世代チップ／フォルム→`全`＋存在 region チップを再生成）＋選択リセット＋ `applyFilter()`。
- `applyFilter()` は各タイルにつき上記 `matchTile` 相当で `hidden` を切替。

- [ ] **Step 4: パス** — `npx vitest run tests/settings-filter.test.mjs` → PASS。`run` スキルで設定ウィンドウを起動し、種類切替でチップとタイルが切替わることを目視（インストール版は終了してから）。

- [ ] **Step 5: コミット** — `git add src/settings/settings.html src/settings/settings.js src/settings/filter.mjs tests/settings-filter.test.mjs && git commit -m "feat(forms): 設定に種類セレクタとチップ意味切替を追加"`

---

### Task 8: 検証スクリプトをフォルム対応に拡張

**Files:**
- Modify: `scripts/verify-assets-consistency.cjs`
- Modify: `scripts/verify-settings-ui.cjs`

**Interfaces:**
- Consumes: index.json（region付きフォルム）、`forms/<region>` のパック/raw/ui。
- Produces: `npm run verify:assets` と settings-ui 検証がフォルムを含めて通る。

- [ ] **Step 1: 失敗を確認（先に実アセットが必要なので Task 9 後に本確認。ここではロジック単体で）** — フォルムエントリを含む index で `node scripts/verify-assets-consistency.cjs` を実行 → 現状は「duplicate dex」「unknown generation folder forms/alola」等で FAIL することを確認。

- [ ] **Step 2: 実装（verify-assets-consistency.cjs）**
  - dex 一意性: `entry.region` がある（フォルム）場合は `seenDex` に入れず、`seenFormKey`（`region+":"+dex`）で一意性を見る。
  - jp-names 参照: フォルムは `entry.ja`（非空文字列）を必須チェックし、`jp-names[dex]` 参照をスキップ。
  - ディレクトリ走査: `retro/` 直下の `forms` を特別扱いし、`forms/<region>/*.json` と `assets/ui/forms/<region>/*.png` を再帰収集して `packIds`/`uiIds` に加える。
  - GEN_RANGES: `generation` が `forms/` で始まるエントリはレンジ判定の対象外。
  - state 検証（idle/walk/sleep・8方向）は共通で維持。UI PNG パスは `generation`（`forms/alola`）を使う。

- [ ] **Step 3: 実装（verify-settings-ui.cjs）** — 既存の `#mode`/`#personality` チェックに倣い、`settings.html` に `id="kind"` の `<select>` が存在することのアサートを追加。

- [ ] **Step 4: パス** — Task 9 で実アセット生成後に `npm run verify:assets` と該当 settings-ui 検証が PASS することを確認（このタスクのコミットは Step 5 で先に行い、Task 9 で最終確認）。

- [ ] **Step 5: コミット** — `git add scripts/verify-assets-consistency.cjs scripts/verify-settings-ui.cjs && git commit -m "feat(forms): 検証をフォルム(region軸)対応に拡張"`

---

### Task 9: フォルムアセットを生成して取り込む

**Files:**
- Create（生成物）: `assets/packs/retro/forms/**`, `assets/raw/forms/**`, `assets/ui/forms/**`
- Modify: `assets/packs/index.json`（build-index 出力）

**Interfaces:** Consumes Task 2–8 の全スクリプト。Produces: 全収録フォルムの実アセット＋index。

- [ ] **Step 1: 着手前同期** — `git fetch origin && git merge --ff-only origin/main`（Nicolas 差分の取り込み）。
- [ ] **Step 2: マニフェスト最新化** — `node scripts/forms-manifest.mjs`（収録可能フォルムの実数確定）。
- [ ] **Step 3: 全フォルム生成** — `PATH="$HOME/.cargo/bin:$PATH" node scripts/gen-build.mjs --forms`（全 includable を取得・変換・タイル生成）。失敗フォルムはログに残す（無言の切り捨て禁止）。
- [ ] **Step 4: index 再生成** — `node scripts/build-index.mjs`。
- [ ] **Step 5: 全ゲート** — `npm run verify:assets` PASS、`npm run verify:local` PASS、`npx vitest run` PASS。Rust は不変なので `npm run test:rust` は不要（変更が無いことを `git status crates native` で確認）。
- [ ] **Step 6: コミット** — `git add assets && git commit -m "feat(forms): 地方フォルムの実アセットとindexを追加（N種）"`（N は実数）。

---

### Task 10: README に地方フォルムと未収録を追記

**Files:**
- Modify: `README.md`
- Modify: `docs/STATUS.md`（必要時。`verify-roadmap-issues.cjs` の既存アサートを壊さない範囲で追記のみ）

**Interfaces:** Produces: ユーザー向けの収録フォルム説明＋未収録フォルム一覧。

- [ ] **Step 1: 追記** — README に「地方フォルム（アローラ/ガラル/ヒスイ/パルデア）対応」節と、`forms-manifest.json` の `missing` から生成した未収録フォルム一覧を追加。STATUS は既存アサート文字列（`現在のバージョン: **v1.0.5**` 等）を変更しないこと（リリースは保留中）。
- [ ] **Step 2: 検証** — `node scripts/verify-roadmap-issues.cjs` が PASS（壊していない）こと、`npm run verify:local` PASS。
- [ ] **Step 3: コミット** — `git add README.md docs/STATUS.md && git commit -m "docs(forms): 地方フォルム対応と未収録一覧を追記"`

---

## 完了時

全タスク後、`superpowers:finishing-a-development-branch` で PR を作成（option 2: Push & PR）。**マージはしない**（Nicolas 同様、ユーザーのレビュー待ち）。PR 本文に「状態機械無変更／全アニメは準備のみ（消費なし）／収録 N 種・未収録 M 種」を明記。

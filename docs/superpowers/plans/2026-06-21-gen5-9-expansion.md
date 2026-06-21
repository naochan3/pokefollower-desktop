# 第5〜9世代ポケモン追加 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SpriteCollab から第5〜9世代の収録可463体を取得・変換し、現行493体と同形式で `assets/{raw,ui,packs}` ＋ `index.json`/`jp-names.json` に追加する。

**Architecture:** 上流 `_inspect_pokefollower` の生成器（`add_pokemon.py` ＋ `parse-anim.js`）を現行プロジェクトに **Node移植＋自動DL化**。`scripts/` に「取得 / pack生成 / オーケストレーション / マニフェスト生成」の小単位スクリプトを置く。`verify:assets` を真として、まず既存packで生成器を較正→1体スライス→世代バッチ。

**Tech Stack:** Node ESM（`.mjs`）、`fast-xml-parser`、`image-size`、`sharp`（PNG→lossless webp）、`gh`/`curl`（取得）、Vitest、既存 `verify:*` ゲート。

## Global Constraints

- 出典は SpriteCollab（`https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/sprite/0XXX/`）。タイルは pokemondb（`https://img.pokemondb.net/sprites/...`）。ライセンスは CC BY-NC、`NOTICE` の一括帰属方式を維持。
- 1図鑑番号＝基本フォルム1体のみ（色違い・別フォルム・メガは対象外）。
- 収録可否は SpriteCollab のスナップショット依存。**実装直前にマニフェストを再生成**する。
- 既存493体の assets/pack を**改変しない**（回帰ゼロ）。
- pack JSON 形式は現行 `assets/packs/retro/**.json` と構造一致（`name, generation, rawPath, flipX, states{idle,walk,sleep:{sheet,frame{w,h},fps,frames,rows{8方向}}}`）。
- 各タスク完了時に該当ゲート（`verify:assets` 等）が緑であること。Walk/AnimData 欠けの個体は**スキップしてレポート**（サイレント除外禁止）。
- 生成スクリプトは `scripts/` の `.mjs`。アプリ本体（`src/`）からは import しない（devツール扱い）。

---

### Task 1: 生成器の移植と較正（parse-anim.mjs）

上流 `parse-anim.js` を repo に移植し、**既存packを再生成して構造一致**を確認することで fps/frames/rows/flipX の導出を現行形式にロックする。

**Files:**
- Create: `scripts/parse-anim.mjs`（上流 `_inspect_pokefollower/src/scripts/parse-anim.js` の移植）
- Modify: `package.json`（devDependencies に `fast-xml-parser`, `image-size` 追加）, `package-lock.json`
- Create: `scripts/__check__/regen-existing.mjs`（較正用：既存rawから再生成し committed と比較）

**Interfaces:**
- Produces: CLI `node scripts/parse-anim.mjs --xml <AnimData.xml> --dir <rawDir> --name <NNN-name> --generation <gen-N> --out <pack.json> --idle Idle-Anim.webp --walk Walk-Anim.webp --sleep Sleep-Anim.webp --fpsIdle <n> --fpsWalk <n> --fpsSleep <n> --flipX <bool>` → pack JSON を out に書く。

- [ ] **Step 1: 依存を追加**

Run: `npm install --save-dev fast-xml-parser image-size`
Expected: `package.json` devDependencies に2件追加、`package-lock.json` 更新。

- [ ] **Step 2: parse-anim.js を移植**

`_inspect_pokefollower/src/scripts/parse-anim.js` の内容を `scripts/parse-anim.mjs` にコピー（ESMのまま）。冒頭の `__dirname` 算出は未使用なら削除可。ロジックは変更しない。

- [ ] **Step 3: 較正スクリプトを書く（失敗する状態で）**

`scripts/__check__/regen-existing.mjs`:
```js
// 既存の数体を raw から再生成し、committed pack と「構造一致」を確認する。
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SAMPLES = [
  ['gen-1', '025-pikachu'],
  ['gen-1', '003-venusaur'],
  ['gen-4', '470-leafeon'],
];
// committed pack から fps/flipX を読み、同じ引数で再生成して states 構造を比較
function load(p){ return JSON.parse(fs.readFileSync(p,'utf8')); }
let bad = 0;
for (const [gen, name] of SAMPLES) {
  const committed = load(`assets/packs/retro/${gen}/${name}.json`);
  const rawDir = `assets/raw/${gen}/${name}`;
  const out = path.join(os.tmpdir(), `${name}.json`);
  const fps = s => committed.states[s] ? String(committed.states[s].fps) : '6';
  execFileSync('node', ['scripts/parse-anim.mjs',
    '--xml', `${rawDir}/AnimData.xml`, '--dir', rawDir,
    '--name', name, '--generation', gen, '--out', out,
    '--idle','Idle-Anim.webp','--walk','Walk-Anim.webp','--sleep','Sleep-Anim.webp',
    '--fpsIdle', fps('idle'), '--fpsWalk', fps('walk'), '--fpsSleep', fps('sleep'),
    '--flipX', String(committed.flipX),
  ], { stdio: 'inherit' });
  const regen = load(out);
  // 構造比較: states キー・各 frame/frames/rows
  for (const st of Object.keys(committed.states)) {
    const c = committed.states[st], r = regen.states[st];
    const eq = r && JSON.stringify(c.frame)===JSON.stringify(r.frame)
      && c.frames===r.frames && JSON.stringify(c.rows)===JSON.stringify(r.rows);
    if (!eq) { console.error(`MISMATCH ${name}.${st}`, {c, r}); bad++; }
  }
}
if (bad) { console.error(`\n較正失敗: ${bad} 件の不一致`); process.exit(1); }
console.log('較正OK: 既存packを構造一致で再生成できる');
```

- [ ] **Step 4: 較正を実行（最初は不一致が出る想定）**

Run: `node scripts/__check__/regen-existing.mjs`
Expected: 不一致が出れば、`fps` の渡し方・`frame` 寸法・`flipX` の扱いを committed に合わせて調整（`frame` は AnimData 由来なので一致するはず／`frames` は Duration数 vs シート列で差が出たら parse-anim の `framesFrom` を committed 準拠に合わせる）。**構造一致するまで Step 2–4 を反復。**

- [ ] **Step 5: 較正が緑になったらコミット**

Run: `node scripts/__check__/regen-existing.mjs` → `較正OK`
```bash
git add scripts/parse-anim.mjs scripts/__check__/regen-existing.mjs package.json package-lock.json
git commit -m "feat: parse-anim.mjs を移植し既存packで較正 (#14)"
```

---

### Task 2: 1体取得スクリプト（gen-fetch.mjs）

dex を受け取り、SpriteCollab の素材と pokemondb タイルを一時フォルダに取得する。

**Files:**
- Create: `scripts/gen-fetch.mjs`
- Test: `scripts/__check__/fetch-one.mjs`（571 を取得して4ファイル存在を確認）

**Interfaces:**
- Consumes: なし（ネットワーク）
- Produces: `fetchPokemon(dex:number, slug:string, destDir:string): Promise<{walk:boolean, idle:boolean, sleep:boolean, anim:boolean, tile:'pokemondb'|'pmd'|'none'}>` — `destDir` に `AnimData.xml, Idle/Walk/Sleep-Anim.png, tile.png` を置く。

- [ ] **Step 1: 失敗するテストを書く**

`scripts/__check__/fetch-one.mjs`:
```js
import { fetchPokemon } from '../gen-fetch.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-fetch-'));
const r = await fetchPokemon(571, 'zoroark', d);
const need = ['AnimData.xml','Walk-Anim.png','Idle-Anim.png','Sleep-Anim.png','tile.png'];
const missing = need.filter(f => !fs.existsSync(path.join(d, f)));
if (missing.length) { console.error('欠落:', missing, r); process.exit(1); }
console.log('fetch OK', r);
```

- [ ] **Step 2: 実行して失敗を確認**

Run: `node scripts/__check__/fetch-one.mjs`
Expected: FAIL（`gen-fetch.mjs` 未実装）

- [ ] **Step 3: gen-fetch.mjs を実装**

```js
import fs from 'node:fs'; import path from 'node:path';
const SC = 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/sprite';
async function dl(url, dest) {
  const res = await fetch(url);
  if (!res.ok) return false;
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return true;
}
function pokedbSlug(slug){ return slug.toLowerCase().replace(/[ _.'’]/g,'-').replace(/--+/g,'-'); }
export async function fetchPokemon(dex, slug, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const d4 = String(dex).padStart(4, '0');
  const got = { anim:false, walk:false, idle:false, sleep:false, tile:'none' };
  got.anim = await dl(`${SC}/${d4}/AnimData.xml`, path.join(destDir,'AnimData.xml'));
  got.walk = await dl(`${SC}/${d4}/Walk-Anim.png`, path.join(destDir,'Walk-Anim.png'));
  got.idle = await dl(`${SC}/${d4}/Idle-Anim.png`, path.join(destDir,'Idle-Anim.png'));
  got.sleep= await dl(`${SC}/${d4}/Sleep-Anim.png`, path.join(destDir,'Sleep-Anim.png'));
  // タイル: pokemondb 優先（BWスプライト）、無ければ後段でPMD Idle切り出し
  const pdb = `https://img.pokemondb.net/sprites/black-white/normal/${pokedbSlug(slug)}.png`;
  got.tile = (await dl(pdb, path.join(destDir,'tile.png'))) ? 'pokemondb' : 'none';
  return got;
}
```

- [ ] **Step 4: 実行して成功を確認**

Run: `node scripts/__check__/fetch-one.mjs`
Expected: `tile.png` 以外は OK。pokedb が 571 で404なら `tile:'none'`（タイルフォールバックは Task 3 の webp 工程で PMD Idle から生成するため、ここでは tile 欠けを許容してテストを `tile.png` 必須から外す）。テストを `need` から `tile.png` を除いて再実行し PASS。

- [ ] **Step 5: コミット**

```bash
git add scripts/gen-fetch.mjs scripts/__check__/fetch-one.mjs
git commit -m "feat: gen-fetch.mjs（SpriteCollab/pokemondb取得） (#14)"
```

---

### Task 3: オーケストレーション（gen-build.mjs）と1体スライス検証

取得→webp変換→raw/ui配置→parse-anim→（バッチ後）index再生成、を束ねる。1体で end-to-end を通す。

**Files:**
- Create: `scripts/gen-build.mjs`
- Modify: `package.json`（devDependencies に `sharp` 追加；scripts に `"gen:build": "node scripts/gen-build.mjs"`, `"build:index": "node scripts/build-index.mjs"`）
- Create: `scripts/build-index.mjs`（`assets/packs/retro/**/*.json` を走査して `index.json` を再生成）

**Interfaces:**
- Consumes: `fetchPokemon`（Task 2）, `parse-anim.mjs`（Task 1）
- Produces: CLI `node scripts/gen-build.mjs --gen 5 --dex 571` / `--manifest <path>` → assets 一式生成。`build-index.mjs` → `assets/packs/index.json`。

- [ ] **Step 1: sharp 追加**

Run: `npm install --save-dev sharp`

- [ ] **Step 2: build-index.mjs を実装**

```js
import fs from 'node:fs'; import path from 'node:path';
const base = 'assets/packs/retro';
const entries = [];
for (const gen of fs.readdirSync(base)) {
  for (const f of fs.readdirSync(path.join(base, gen)).filter(x=>x.endsWith('.json'))) {
    const j = JSON.parse(fs.readFileSync(path.join(base, gen, f),'utf8'));
    const slug = f.replace(/\.json$/, '');
    const en = slug.replace(/^\d+-/, m=>m).replace(/^(\d+)-(.+)$/, (_,n,nm)=>`${n}-${nm[0].toUpperCase()+nm.slice(1)}`);
    entries.push({ id: `retro/${gen}/${slug}`, name: en });
  }
}
entries.sort((a,b)=> (parseInt(a.id.match(/\/(\d+)-/)[1]) - parseInt(b.id.match(/\/(\d+)-/)[1])));
fs.writeFileSync('assets/packs/index.json', JSON.stringify({ retro: entries }, null, 2));
console.log('index.json:', entries.length, 'entries');
```
注: 既存 `index.json` の `name` 表記（例 `025-Pikachu`）と一致するよう、生成名は committed と突き合わせて調整。既存と差分が出ないことを `git diff assets/packs/index.json` で確認してから新規分のみ増える状態にする。

- [ ] **Step 3: gen-build.mjs を実装**

```js
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { fetchPokemon } from './gen-fetch.mjs';

function arg(n,d){ const i=process.argv.indexOf(`--${n}`); return i>-1?process.argv[i+1]:d; }
async function toWebp(src, dest){ await sharp(src).webp({ lossless:true, quality:100 }).toFile(dest); }

async function buildOne(dex, slug, gen) {
  const mon = `${dex}-${slug}`, g = `gen-${gen}`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `pf-${mon}-`));
  const got = await fetchPokemon(dex, slug, tmp);
  if (!got.anim || !got.walk) { return { mon, skipped:true, reason:'Walk/AnimData欠け' }; }
  // フォールバック: Idle無→Walkコピー / Sleep無→Idleコピー（上流仕様）
  if (!got.idle) fs.copyFileSync(path.join(tmp,'Walk-Anim.png'), path.join(tmp,'Idle-Anim.png'));
  if (!got.sleep) fs.copyFileSync(path.join(tmp,'Idle-Anim.png'), path.join(tmp,'Sleep-Anim.png'));
  // raw 配置（webp 変換）
  const rawDir = `assets/raw/${g}/${mon}`; fs.mkdirSync(rawDir, { recursive:true });
  fs.copyFileSync(path.join(tmp,'AnimData.xml'), path.join(rawDir,'AnimData.xml'));
  for (const a of ['Idle','Walk','Sleep']) await toWebp(path.join(tmp,`${a}-Anim.png`), path.join(rawDir,`${a}-Anim.webp`));
  // ui タイル: pokemondb 無ければ PMD Idle 正面1コマ(96x96)を生成
  const uiDir = `assets/ui/${g}`; fs.mkdirSync(uiDir, { recursive:true });
  if (got.tile === 'pokemondb') {
    await sharp(path.join(tmp,'tile.png')).resize(96,96,{ fit:'contain', background:{r:0,g:0,b:0,alpha:0} }).png().toFile(`${uiDir}/${mon}.png`);
  } else {
    // PMD Idle の先頭フレーム(front,row0,frame0)を AnimData の FrameWidth/Height で切り出し
    const fw = 0; // 実装時: AnimData の Idle FrameWidth/Height を読む
    // ※ Task 3 実装時に parse-anim と同じ XML 読みで frame サイズを取得し crop
    await sharp(path.join(rawDir,'Idle-Anim.webp')).extract({ left:0, top:0, width: /*fw*/ 32, height: /*fh*/ 32 }).resize(96,96,{ fit:'contain' }).png().toFile(`${uiDir}/${mon}.png`);
  }
  // pack 生成
  execFileSync('node', ['scripts/parse-anim.mjs',
    '--xml', `${rawDir}/AnimData.xml`, '--dir', rawDir,
    '--name', mon, '--generation', g, '--out', `assets/packs/retro/${g}/${mon}.json`,
    '--idle','Idle-Anim.webp','--walk','Walk-Anim.webp','--sleep','Sleep-Anim.webp',
    '--flipX','true',
  ], { stdio:'inherit' });
  fs.rmSync(tmp, { recursive:true, force:true });
  return { mon, skipped:false, tile: got.tile };
}
// --dex 単体 or --manifest バッチ
const results = [];
const single = arg('dex'); const gen = arg('gen');
// manifest 形式: [{dex,gen,name}]
if (single) {
  const slug = arg('slug'); // 単体時は slug も渡す
  results.push(await buildOne(+single, slug, +gen));
} else {
  const manifest = JSON.parse(fs.readFileSync(arg('manifest'),'utf8'));
  const list = manifest.filter(m => String(m.gen) === String(gen));
  for (const m of list) results.push(await buildOne(m.dex, m.slug, m.gen));
}
const skipped = results.filter(r=>r.skipped);
console.log(`完了: ${results.length-skipped.length} 体生成 / スキップ ${skipped.length}`);
if (skipped.length) console.log('スキップ:', skipped.map(s=>`${s.mon}(${s.reason})`).join(', '));
```
（実装時の必須補完: PMDフォールバックの crop は AnimData の Idle FrameWidth/Height を読んで `extract` する。`slug` は manifest に含める＝Task 5 でマニフェストに `slug` を付与。）

- [ ] **Step 4: 1体スライスを実行**

Run: `node scripts/gen-build.mjs --gen 5 --dex 571 --slug zoroark`
次に: `node scripts/build-index.mjs`
Expected: `assets/raw/gen-5/571-zoroark/`（AnimData.xml + 3 webp）, `assets/ui/gen-5/571-zoroark.png`, `assets/packs/retro/gen-5/571-zoroark.json`, `index.json` に1件追加。

- [ ] **Step 5: ゲートとアプリで検証**

Run: `npm run verify:assets`
Expected: ok（gen-5 の参照整合・必要row・寸法が通る）
Run: `npm start`（開発版）→ 設定で「ゾロアーク / 571」を検索・選択 → デスクトップに表示・追従・向き・sleep を目視。

- [ ] **Step 6: コミット**

```bash
git add scripts/gen-build.mjs scripts/build-index.mjs package.json package-lock.json assets/raw/gen-5/571-zoroark assets/ui/gen-5/571-zoroark.png assets/packs/retro/gen-5/571-zoroark.json assets/packs/index.json
git commit -m "feat: gen-build パイプライン＋571ゾロアークで1体スライス検証 (#14)"
```

---

### Task 4: 日本語名を 494〜1025 に拡張

**Files:**
- Modify: `scripts/fetch-jp-names.cjs:13`（`TOTAL = 493` → `1025`）, `scripts/fetch-jp-names.cjs:131` のメッセージ
- Modify: `assets/packs/jp-names.json`（再生成で 494〜1025 追加）

- [ ] **Step 1: TOTAL を 1025 に変更**

`scripts/fetch-jp-names.cjs` の `const TOTAL = 493;` → `const TOTAL = 1025;`。`All 493 entries...` のログ文言も汎用化。

- [ ] **Step 2: 再生成**

Run: `node scripts/fetch-jp-names.cjs`
Expected: `jp-names.json` が 1〜1025 を網羅。1〜493 は内容不変（`git diff` で既存行の変化が無いことを確認）。

- [ ] **Step 3: コミット**

```bash
git add scripts/fetch-jp-names.cjs assets/packs/jp-names.json
git commit -m "feat: 日本語名を全国図鑑1025まで取得 (#14)"
```

---

### Task 5: 収録可否マニフェストを repo 内で生成

**Files:**
- Create: `scripts/gen-manifest.mjs`（SpriteCollab tracker.json＋contents API で 494〜1025 の収録可否を再判定、`slug` 付与）
- Create: `assets/packs/gen5-9-manifest.json`（生成物）

**Interfaces:**
- Produces: `{ includable:[{dex,gen,slug,name}], missing:[{dex,gen,name}] }`

- [ ] **Step 1: gen-manifest.mjs を実装**

`tracker.json` を取得→ `sprite_complete>=1` を候補にし、各 dex の `contents/sprite/0XXX` を引いて `Walk-Anim.png && AnimData.xml` を満たすものを `includable`。`slug` は英名から `toLowerCase()` のスラッグ（例 `Mr_Rime`→`mr-rime`）。`name`/英名は tracker の `name`。並列は12並列、`gh api` 使用。

- [ ] **Step 2: 生成・件数確認**

Run: `node scripts/gen-manifest.mjs`
Expected: `assets/packs/gen5-9-manifest.json` 作成。`includable` ≈ 463、`missing` ≈ 69（スナップショットにより前後）。

- [ ] **Step 3: コミット**

```bash
git add scripts/gen-manifest.mjs assets/packs/gen5-9-manifest.json
git commit -m "feat: 第5〜9世代の収録可否マニフェスト生成 (#14)"
```

---

### Task 6: 第5世代バッチ（141体）

**Files:**
- Create: `assets/raw/gen-5/**`, `assets/ui/gen-5/**`, `assets/packs/retro/gen-5/**`（生成物）
- Modify: `assets/packs/index.json`, `README.md`（未収録15体の記載）

- [ ] **Step 1: マニフェスト再生成（直前スナップショット）**

Run: `node scripts/gen-manifest.mjs`

- [ ] **Step 2: 第5世代をバッチ生成**

Run: `node scripts/gen-build.mjs --gen 5 --manifest assets/packs/gen5-9-manifest.json`
Expected: gen-5 の収録可（≈141）が生成。スキップ一覧が出れば記録。571 は既存なので冪等に上書き（差分が無いこと）。

- [ ] **Step 3: index 再生成**

Run: `node scripts/build-index.mjs`

- [ ] **Step 4: README に未収録15体を記載**

`README.md` に「## 未収録ポケモン（素材準備中）」セクションを追加し、第5世代の missing 15体を `dex 名前` で列挙（マニフェストの `missing` から `gen===5`）。文面例:
```markdown
## 未収録ポケモン（素材準備中）

スプライト出典（PMD Collab / SpriteCollab）にまだ素材が無いポケモンは未収録です。素材追加され次第対応します。

- 第5世代（15体）: 514 バオッキー / 516 ヒヤッキー / …（manifest の missing 参照）
```

- [ ] **Step 5: 全ゲート検証**

Run: `npm run verify:local`
Expected: 15ゲート＋Vitest 緑（`verify:assets` が gen-5 を含めて整合）。

- [ ] **Step 6: コミット**

```bash
git add assets/raw/gen-5 assets/ui/gen-5 assets/packs/retro/gen-5 assets/packs/index.json README.md
git commit -m "feat: 第5世代 141体を追加 (#14)"
```

---

### Task 7〜10: 第6〜9世代バッチ

各世代について Task 6 と同手順（`--gen 6/7/8/9`、README に該当世代の未収録を追記、`verify:local` 緑、コミット）。世代ごとに独立コミット。

- [ ] **Task 7: 第6世代（70体、未収録2）** — `node scripts/gen-build.mjs --gen 6 --manifest ...` → build-index → README → verify:local → commit
- [ ] **Task 8: 第7世代（81体、未収録7）** — 同上 `--gen 7`
- [ ] **Task 9: 第8世代（82体、未収録14）** — 同上 `--gen 8`
- [ ] **Task 10: 第9世代（89体、未収録31）** — 同上 `--gen 9`

各タスクの受け入れ: 該当世代の収録可が assets/index/jp-names に入り、`verify:local` 緑、README に未収録記載、既存に回帰なし。

---

### Task 11: 仕上げ（index/README/PR）

- [ ] **Step 1: 最終整合**

Run: `npm run verify:local`
Expected: 緑。`index.json` 件数 ≈ 956。

- [ ] **Step 2: STATUS/README のカバレッジ更新**

`docs/STATUS.md` のポケモン数表記（493→956 等）と `README.md` の「ポケモン 493 種」を実数へ更新。

- [ ] **Step 3: コミットして PR**

```bash
git add -A
git commit -m "docs: カバレッジを956体に更新 (#14)"
git push -u origin feature/gen5-9-expansion
gh pr create --base main --title "feat: 第5〜9世代ポケモン463体を追加 (#14)" --body "..."
```
Expected: CI（unit/static/package-smoke）緑。PR で件数・未収録・生成器を説明。

---

### Task 12: 設定UIに世代フィルタを追加

956体を平らに並べると探しにくいため、タイル一覧上部に**世代チップ**（`全 / 第1 … 第9`）を追加し、選択世代で絞り込む。既存の検索（カナ/ローマ字/英名/番号）と AND で併用。

**Files:**
- Modify: `src/settings/settings.html`（世代チップの DOM とID追加）
- Modify: `src/settings/settings.js`（チップ生成・選択状態・絞り込みロジック）
- Modify: `scripts/verify-settings-ui.cjs`（チップの存在と挙動を静的検証に追加）
- Test: 既存の `npm run verify:settings` を拡張

**Interfaces:**
- Consumes: `listPacks()` の各エントリ（`id: "retro/gen-N/..."`, `num`=dex）。世代は dex 帯（1-151,152-251,252-386,387-493,494-649,650-721,722-809,810-905,906-1025）または id の `gen-N` から導出。
- Produces: 選択世代 state `selectedGen`（`'all' | 1..9`）と、検索＋世代の合成フィルタ。

- [ ] **Step 1: 現状の settings UI を読む**

`src/settings/settings.html` と `src/settings/settings.js` を読み、タイル一覧の生成箇所・検索フィルタの実装・`listPacks` の戻り値形を把握する（exact な DOM ID / 関数名をこのタスクのコードに反映）。

- [ ] **Step 2: 世代導出ヘルパのテストを書く（失敗する状態で）**

`src/settings/settings.js` に `genOfDex(num)` を追加する前提で、純関数テストを `tests/settings-gen-filter.test.js` に作成:
```js
import { describe, it, expect } from 'vitest';
import { genOfDex } from '../src/settings/gen-util.js';
describe('genOfDex', () => {
  it.each([[1,1],[151,1],[152,2],[493,4],[494,5],[649,5],[650,6],[1025,9]])('%i -> gen %i', (dex,gen)=>{
    expect(genOfDex(dex)).toBe(gen);
  });
});
```

- [ ] **Step 3: 実行して失敗を確認**

Run: `npx vitest run tests/settings-gen-filter.test.js`
Expected: FAIL（`gen-util.js` 未作成）

- [ ] **Step 4: `gen-util.js` を実装**

`src/settings/gen-util.js`:
```js
const BOUNDS = [151,251,386,493,649,721,809,905,1025];
export function genOfDex(dex){
  for (let i=0;i<BOUNDS.length;i++) if (dex <= BOUNDS[i]) return i+1;
  return BOUNDS.length;
}
```

- [ ] **Step 5: テスト緑を確認**

Run: `npx vitest run tests/settings-gen-filter.test.js`
Expected: PASS

- [ ] **Step 6: UI 実装（チップ＋絞り込み）**

`settings.html` にチップ行（`<div id="genChips">` 等、`全`＋第1〜9）を追加。`settings.js` で `selectedGen`（既定 `'all'`）を持ち、チップ click で更新→再描画。タイル描画フィルタを「検索一致 AND（`selectedGen==='all'` または `genOfDex(num)===selectedGen`）」に変更。スタイルは既存 Tailwind 流儀に合わせる（カスタムCSS禁止）。

- [ ] **Step 7: 静的検証を拡張**

`scripts/verify-settings-ui.cjs` に「`settings.html` に `genChips` がある」「`settings.js` が `genOfDex`/`selectedGen` を使う」チェックを追加。

- [ ] **Step 8: 検証**

Run: `npm run verify:settings` → ok
Run: `npm start` → 設定画面で世代チップを切り替え、第5世代だけ表示・検索併用が効くことを目視。

- [ ] **Step 9: コミット**

```bash
git add src/settings/settings.html src/settings/settings.js src/settings/gen-util.js tests/settings-gen-filter.test.js scripts/verify-settings-ui.cjs
git commit -m "feat: 設定画面に世代フィルタを追加 (#14)"
```

---

## Self-Review メモ

- **spec カバレッジ**: 出典/生成器移植(Task1-3)/タイルpokemondb+PMDフォールバック(Task3)/収録463・欠け69(Task5-10)/README記載(Task6-10)/jp-names拡張(Task4)/検証戦略=較正→1体→世代(Task1,3,6-10)/受け入れ条件(各Task) を網羅。
- **較正リスク**: parse-anim の fps/frames 導出が committed と微差の可能性 → Task1 の `regen-existing` で**構造一致を強制**し、ロックしてから量産。これが最大の安全弁。
- **要実装補完（プレースホルダではなく明示の TODO）**: ① gen-build の PMDタイル crop は AnimData の Idle FrameWidth/Height を読む（parse-anim と同じXML読み）。② build-index の `name` 生成は committed index と差分0になるよう調整。③ manifest に `slug` を付与（gen-build が参照）。これらは該当タスク内で完結させる。
- **依存追加**: `fast-xml-parser`/`image-size`/`sharp` は devDependencies（アプリ非バンドル）。`verify:deps` のロック整合に注意。

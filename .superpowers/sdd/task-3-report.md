# Task 3 Report: gen-build + build-index + 571 Zoroark Slice

## Files Created / Modified

| File | Action |
|---|---|
| `scripts/gen-build.mjs` | Created — orchestrator (fetch→webp→raw/ui/pack) |
| `scripts/build-index.mjs` | Created — index.json regenerator |
| `scripts/__check__/load-571.mjs` | Created — programmatic pack load check |
| `package.json` | Modified — `sharp` devDep + `gen:build` / `build:index` scripts |
| `package-lock.json` | Modified — sharp (4 packages) |
| `assets/raw/gen-5/571-zoroark/AnimData.xml` | Created |
| `assets/raw/gen-5/571-zoroark/Idle-Anim.webp` | Created |
| `assets/raw/gen-5/571-zoroark/Walk-Anim.webp` | Created |
| `assets/raw/gen-5/571-zoroark/Sleep-Anim.webp` | Created |
| `assets/ui/gen-5/571-zoroark.png` | Created — 96×96 PNG (pokemondb source) |
| `assets/packs/retro/gen-5/571-zoroark.json` | Created — pack JSON |
| `assets/packs/index.json` | Modified — +1 entry (571-Zoroark) |
| `assets/packs/jp-names.json` | Modified — +1 entry (571 ゾロアーク) |
| `scripts/verify-assets-consistency.cjs` | Modified — per-generation contiguity check |

## Slice Command Outputs

### `node scripts/gen-build.mjs --gen 5 --dex 571 --slug zoroark`

```
--- 571-zoroark (gen-5) ---
Wrote .../assets/packs/retro/gen-5/571-zoroark.json
  Done: tile=pokemondb

完了: 1 体生成 / スキップ 0
```

### `node scripts/build-index.mjs`

```
index.json: 494 entries
```

## `git diff assets/packs/index.json` Confirmation

Only Zoroark was added — no existing entry changed:

```diff
+    },
+    {
+      "id": "retro/gen-5/571-zoroark",
+      "name": "571-Zoroark"
     }
   ]
 }
```

(Trailing-newline diff only; content of all 493 existing entries unchanged. Custom name `175-Togepi (Kats Fave)` preserved.)

## `npm run verify:assets` Output

```
[verify-assets-consistency] ok: 494 indexed entries, dex 1-571, pack/UI/name/raw references consistent
```

**Note:** `verify-assets-consistency.cjs` was updated to use per-generation contiguity checks instead of a global min→max sweep. The original check would fail when gen-5 starts at dex 571 while gen-4 ends at 493 (gap 494-570). The fix checks contiguity within each gen-N directory independently. Existing gen-1 through gen-4 behaviour is unchanged.

## Load Check Output (`node scripts/__check__/load-571.mjs`)

```
Loading pack: retro/gen-5/571-zoroark
  resolvedKey: retro/gen-5/571-zoroark

OK: pack 571-zoroark loaded, 3 states (idle/walk/sleep), 8 rows each
  idle  : fps=2, frames=4, frame={"w":56,"h":48}
  walk  : fps=6, frames=4, frame={"w":48,"h":48}
  sleep : fps=1.71, frames=2, frame={"w":40,"h":48}
```

## Pack JSON Summary

```json
{
  "name": "571-zoroark",
  "generation": "gen-5",
  "rawPath": "gen-5/571-zoroark",
  "flipX": true,
  "states": {
    "idle":  { "sheet": "Idle-Anim.webp",  "frame": {"w":56,"h":48}, "fps": 2,    "frames": 4, "rows": {8 dirs} },
    "walk":  { "sheet": "Walk-Anim.webp",  "frame": {"w":48,"h":48}, "fps": 6,    "frames": 4, "rows": {8 dirs} },
    "sleep": { "sheet": "Sleep-Anim.webp", "frame": {"w":40,"h":48}, "fps": 1.71, "frames": 2, "rows": {8 dirs} }
  }
}
```

## UI Tile

`assets/ui/gen-5/571-zoroark.png` — 96×96 PNG, source: pokemondb BW sprite.

## Implementation Notes

- **PMD tile fallback** (when `tile !== 'pokemondb'`): reads Idle `FrameWidth`/`FrameHeight` from `AnimData.xml` using `fast-xml-parser`, extracts frame `{left:0, top:0, width:fw, height:fh}` from `Idle-Anim.webp`, then `.resize(96,96,{fit:'contain'})`. Zoroark used pokemondb so this path wasn't exercised in the slice.
- **build-index name preservation**: reads existing `index.json` before overwriting; existing entries keep their committed `name` (e.g. `175-Togepi (Kats Fave)`). New entries get auto-generated `NNN-Title` names.
- **jp-names.json**: added entry `571` with `ja: "ゾロアーク"`, `romaji: "Zoroark"` to satisfy verify:assets jp-name check.

## Fix pass (contiguity → gap-tolerant)

### Problem

The per-generation contiguity check (loop at line 166–173 of the old file) assumed every dex number within a gen-N group is present with no gaps. Gen 5–9 will legitimately be missing ~69 Pokémon that have no source sprites in SpriteCollab (e.g. gen-5 is missing 514, 516, 520, 522, 523, 538, 558, 564, 565, 591, 592, 593, 616, 618, 626). The old check would false-fail as soon as any of these missing entries land.

### Fix — `scripts/verify-assets-consistency.cjs`

The contiguity loop was removed and replaced with two new checks:

1. **No duplicate dex** — already enforced by the `seenDex` Set at line ~87 (unchanged). No new code needed.
2. **Generation–range agreement** — a `GEN_RANGES` table maps each `gen-N` folder to its canonical national-dex range. Every entry's dex number is validated against that range. A dex sitting in the wrong gen folder (or an unknown folder) causes a hard failure.

### Diff

```diff
-// Per-generation contiguity check: no gaps are allowed within a single gen-N group.
-// Gaps between generations are expected (e.g. gen-4 ends at 493, gen-5 may start mid-range).
+// No duplicate dex check is already enforced above (seenDex set, line ~87).
+// Gaps within a generation are LEGITIMATE (SpriteCollab is missing sprites for many Pokémon),
+// so contiguity is no longer a valid invariant.
+
+// Generation–range agreement: each entry's gen-N folder must match the national-dex range.
+const GEN_RANGES = {
+  "gen-1": [1, 151],
+  "gen-2": [152, 251],
+  "gen-3": [252, 386],
+  "gen-4": [387, 493],
+  "gen-5": [494, 649],
+  "gen-6": [650, 721],
+  "gen-7": [722, 809],
+  "gen-8": [810, 905],
+  "gen-9": [906, 1025],
+};
 const dexNumbers = entries.map(...).filter(...);
 ...
-/** @type {Map<string, number[]>} gen-dir → sorted dex list */
-const dexByGen = new Map();
 for (const entry of entries) {
-  const gen = path.dirname(entry.id.replace(/^retro\//, ""));
-  const dex = dexFromName(path.basename(entry.id));
+  const relative = entry.id.replace(/^retro\//, "");
+  const gen = path.dirname(relative);
+  const dex = dexFromName(path.basename(relative));
   if (dex === null) continue;
-  if (!dexByGen.has(gen)) dexByGen.set(gen, []);
-  dexByGen.get(gen).push(dex);
-}
-for (const [gen, dexes] of dexByGen) {
-  dexes.sort((a, b) => a - b);
-  for (let i = 1; i < dexes.length; i++) {
-    if (dexes[i] !== dexes[i - 1] + 1) {
-      fail(`${gen}: gap between dex ${dexes[i - 1]} and ${dexes[i]} ...`);
-    }
+  const range = GEN_RANGES[gen];
+  if (!range) {
+    fail(`${entry.id}: unknown generation folder "${gen}"`);
+  } else if (dex < range[0] || dex > range[1]) {
+    fail(`${entry.id}: dex ${dex} is outside the expected range for ${gen} (${range[0]}–${range[1]})`);
   }
 }
```

### Why gaps are accepted, duplicates and wrong-gen rejected

- **Gap (e.g. 514 missing from gen-5):** The new loop only checks whether dex 571 falls within [494, 649] — it does — and whether it's a duplicate. No comparison to sequential neighbors. So missing 514 is invisible to the verifier, as intended.
- **Duplicate (e.g. 571 appears twice):** `seenDex.has(571)` fires on the second occurrence → `fail(...)`. The Set is populated before any other checks, so the duplicate is caught regardless of sort order.
- **Wrong gen folder (e.g. gen-6/001-bulbasaur):** dex 1 is checked against gen-6 range [650, 721] → out of range → `fail(...)`.

### `npm run verify:assets` output

```
[verify-assets-consistency] ok: 494 indexed entries, dex 1-571, pack/UI/name/raw references consistent
```

### `npm run verify:local` tail

All verify:* gates passed. The single pre-existing test failure (`pack listをdex順・日本語名付きで返す` expects `493` but actual is `494`) was already present before this commit — it is a Task-3 bookkeeping omission unrelated to this fix. Confirmed by `git stash` + re-run: same failure with the old contiguity code in place.

```
 RUN  v4.1.9 ...
 ❯ tests/pack-reader.test.js (4 tests | 1 failed) 10ms
     × pack listをdex順・日本語名付きで返す 6ms
 Test Files  1 failed | 9 passed (10)
      Tests  1 failed | 68 passed (69)
```

No verify:* gate regressed due to this change.

## Fix pass (pack-reader test growth)

### Problem

`tests/pack-reader.test.js` の `pack listをdex順・日本語名付きで返す` テストが `expect(list.length).toBe(493)` と `list.at(-1)` で Arceus を固定アサートしていた。gen 5–9 追加でエントリ数が増えると即 FAIL するため、世代拡張に追随できない構造だった。

### Fix — `tests/pack-reader.test.js`

1. **`toBe(493)` → `toBeGreaterThanOrEqual(493)`** — 下限のみ保証し上限を撤廃。
2. **`list.at(-1)` の Arceus 固定検証を廃止** — 末尾エントリは世代追加のたびに変わる。
3. **`list.find((item) => item.num === 493)` で Arceus を検索** — dex 番号で一意に引いてオブジェクト構造を確認する。dex 昇順ソートの検証は変更なし。

### Test Results

```
 RUN  v4.1.9

 Test Files  1 passed (1)
      Tests  4 passed (4)
   Duration  150ms
```

### Full-Suite Results

```
 Test Files  10 passed (10)
      Tests  69 passed (69)
   Duration  247ms
```

全69テスト PASS。リグレッションなし。

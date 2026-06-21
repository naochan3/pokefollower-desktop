# Task 5 Report: Gen 5–9 Manifest Generation

## Script Summary

**File:** `scripts/gen-manifest.mjs`

The script implements the three-phase algorithm described in the task brief:

1. **Tracker fetch** — Downloads `tracker.json` (~10 MB) from `https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/tracker.json` using Node global `fetch`.
2. **Initial split** — For dex 494–1025, entries with `sprite_complete === 0` or absent from tracker go directly to `missing`. Entries with `sprite_complete >= 1` (463 candidates) proceed to phase 3.
3. **Contents API verification** — For each candidate, calls `gh api repos/PMDCollab/SpriteCollab/contents/sprite/0XXX --jq '[.[].name]'` (12 concurrent workers via hand-rolled `pLimit`). A Pokémon is includable iff the folder contains both `Walk-Anim.png` AND `AnimData.xml`.

**Slug generation** (`toSlug`): lowercase the English name, replace any non-alphanumeric run with a single `-`, trim leading/trailing `-`. Example: `Mr. Rime` → `mr-rime`, `Farfetch'd` → `farfetch-d`, `Zoroark` → `zoroark`.

**Output:** `assets/packs/gen5-9-manifest.json` with shape:
```json
{
  "generatedFrom": "PMDCollab/SpriteCollab tracker.json + contents API",
  "includable": [{ "dex", "gen", "slug", "name" }],
  "missing": [{ "dex", "gen", "name" }]
}
```
Both arrays sorted by `dex` ascending.

---

## Per-Generation Counts

| Gen | Dex Range | Includable | Missing | Total |
|-----|-----------|------------|---------|-------|
| 5   | 494–649   | 141        | 15      | 156   |
| 6   | 650–721   | 70         | 2       | 72    |
| 7   | 722–809   | 81         | 7       | 88    |
| 8   | 810–905   | 82         | 14      | 96    |
| 9   | 906–1025  | 89         | 31      | 120   |
| **Total** | **494–1025** | **463** | **69** | **532** |

Matches the expected snapshot (463 includable / 69 missing).

---

## Spot Checks

| Dex | Name     | Expected         | Result                                                |
|-----|----------|------------------|-------------------------------------------------------|
| 571 | Zoroark  | includable, slug=`zoroark` | `{ dex: 571, gen: 5, slug: "zoroark", name: "Zoroark" }` — PASS |
| 514 | Simisear | missing          | `{ dex: 514, gen: 5, name: "Simisear" }` — PASS      |

---

## Files Changed

- **Created:** `scripts/gen-manifest.mjs`
- **Created:** `assets/packs/gen5-9-manifest.json` (532 entries total: 463 includable + 69 missing)

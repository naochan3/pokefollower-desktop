#!/usr/bin/env node
/**
 * gen-build.mjs
 * Orchestrator: fetch → PNG→webp → raw/ui layout → parse-anim (pack JSON).
 *
 * Single Pokémon:
 *   node scripts/gen-build.mjs --gen 5 --dex 571 --slug zoroark
 *
 * Batch via manifest (JSON array [{dex,gen,slug,name}]):
 *   node scripts/gen-build.mjs --gen 5 --manifest assets/packs/gen5-9-manifest.json
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { XMLParser } from 'fast-xml-parser';
import sharp from 'sharp';
import { fetchPokemon, fetchForm } from './gen-fetch.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function arg(name, def = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : def;
}

/** Convert PNG/any image to lossless webp */
async function toWebp(src, dest) {
  await sharp(src).webp({ lossless: true, quality: 100 }).toFile(dest);
}

/**
 * Read Idle FrameWidth/FrameHeight from AnimData.xml.
 * Returns {w, h} for the Idle (or first) animation, with graceful fallbacks.
 */
function readIdleFrameSize(xmlPath) {
  const xml = fs.readFileSync(xmlPath, 'utf8');
  const parser = new XMLParser({ ignoreAttributes: false });
  const data = parser.parse(xml);

  const animsRaw = (() => {
    try {
      const a = data.AnimData.Anims.Anim;
      if (Array.isArray(a)) return a;
      if (a) return [a];
    } catch (_) {}
    return [];
  })();

  // Follow CopyOf references (same logic as parse-anim.mjs)
  function resolveCopy(anim) {
    let cur = anim;
    const seen = new Set();
    while (cur?.CopyOf) {
      const name = String(cur.CopyOf || '').trim().toLowerCase();
      if (!name || seen.has(name)) break;
      seen.add(name);
      const next = animsRaw.find(a => String(a.Name || '').toLowerCase() === name);
      if (!next) break;
      cur = next;
    }
    return cur || anim;
  }

  // Prefer Idle/Stand/Breath animation; fall back to first entry
  const keywords = ['idle', 'stand', 'breath', 'rotate'];
  let idleAnim = animsRaw.find(a => keywords.some(k => String(a.Name || '').toLowerCase().includes(k)));
  if (!idleAnim) idleAnim = animsRaw[0];

  if (!idleAnim) return { w: 32, h: 32 }; // ultimate fallback

  const resolved = resolveCopy(idleAnim);
  const w = parseInt(resolved.FrameWidth  ?? resolved.FrameW  ?? resolved.Width  ?? 32, 10);
  const h = parseInt(resolved.FrameHeight ?? resolved.FrameH  ?? resolved.Height ?? 32, 10);
  return { w: w || 32, h: h || 32 };
}

/**
 * Build assets for a single Pokémon.
 * @param {number} dex   Pokédex number
 * @param {string} slug  URL-safe slug (e.g. "zoroark")
 * @param {number} gen   Generation number (e.g. 5)
 * @returns {{ mon:string, skipped:boolean, reason?:string, tile?:string }}
 */
async function buildOne(dex, slug, gen) {
  const mon = `${dex}-${slug}`;
  const g   = `gen-${gen}`;

  console.log(`\n--- ${mon} (${g}) ---`);

  // 1. Fetch assets into temp dir
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `pf-${mon}-`));
  let got;
  try {
    got = await fetchPokemon(dex, slug, tmp);
  } catch (err) {
    fs.rmSync(tmp, { recursive: true, force: true });
    return { mon, skipped: true, reason: `fetch error: ${err.message}` };
  }

  if (!got.anim || !got.walk) {
    fs.rmSync(tmp, { recursive: true, force: true });
    return { mon, skipped: true, reason: 'Walk-Anim.png または AnimData.xml が取得できなかった' };
  }

  // 2. Idle/Sleep フォールバック
  if (!got.idle)  fs.copyFileSync(path.join(tmp, 'Walk-Anim.png'),  path.join(tmp, 'Idle-Anim.png'));
  if (!got.sleep) fs.copyFileSync(path.join(tmp, 'Idle-Anim.png'),  path.join(tmp, 'Sleep-Anim.png'));

  // 3. raw 配置 (PNG → lossless webp)
  const rawDir = path.join(root, 'assets', 'raw', g, mon);
  fs.mkdirSync(rawDir, { recursive: true });
  fs.copyFileSync(path.join(tmp, 'AnimData.xml'), path.join(rawDir, 'AnimData.xml'));
  for (const anim of ['Idle', 'Walk', 'Sleep']) {
    await toWebp(
      path.join(tmp, `${anim}-Anim.png`),
      path.join(rawDir, `${anim}-Anim.webp`)
    );
  }

  // 4. UI タイル (96×96 PNG)
  const uiDir = path.join(root, 'assets', 'ui', g);
  fs.mkdirSync(uiDir, { recursive: true });
  const uiOut = path.join(uiDir, `${mon}.png`);

  if (got.tile === 'pokemondb') {
    // pokemondb sprite → resize to 96×96 contain
    await sharp(path.join(tmp, 'tile.png'))
      .resize(96, 96, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(uiOut);
  } else {
    // PMD fallback: extract front frame (row 0, col 0) from Idle-Anim.webp
    const { w: fw, h: fh } = readIdleFrameSize(path.join(rawDir, 'AnimData.xml'));
    console.log(`  PMD tile fallback: extracting ${fw}×${fh} frame from Idle-Anim.webp`);
    await sharp(path.join(rawDir, 'Idle-Anim.webp'))
      .extract({ left: 0, top: 0, width: fw, height: fh })
      .resize(96, 96, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(uiOut);
  }

  // 5. Pack JSON 生成 (parse-anim.mjs)
  const packDir = path.join(root, 'assets', 'packs', 'retro', g);
  fs.mkdirSync(packDir, { recursive: true });
  execFileSync('node', [
    path.join(__dirname, 'parse-anim.mjs'),
    '--xml',        path.join(rawDir, 'AnimData.xml'),
    '--dir',        rawDir,
    '--name',       mon,
    '--generation', g,
    '--out',        path.join(packDir, `${mon}.json`),
    '--idle',       'Idle-Anim.webp',
    '--walk',       'Walk-Anim.webp',
    '--sleep',      'Sleep-Anim.webp',
    '--flipX',      'true',
  ], { stdio: 'inherit' });

  // 6. Cleanup temp dir
  fs.rmSync(tmp, { recursive: true, force: true });

  console.log(`  Done: tile=${got.tile}`);
  return { mon, skipped: false, tile: got.tile };
}

/**
 * Build assets for a single regional form.
 * @param {{ dex:number, subindex:string, baseSlug:string, region:string, slug:string }} entry
 * @returns {{ mon:string, skipped:boolean, reason?:string, tile?:string }}
 */
async function buildForm(entry) {
  const { dex, subindex, baseSlug, region, slug } = entry;
  const mon = slug;
  const regionSlug = region.toLowerCase();

  const VALID_REGIONS = new Set(['alola', 'galar', 'hisui', 'paldea']);
  if (!VALID_REGIONS.has(regionSlug)) throw new Error(`Unknown region: ${regionSlug}`);

  console.log(`\n--- form: ${mon} (${regionSlug}) ---`);

  // 1. Fetch into temp dir
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `pf-form-${mon}-`));
  let got;
  try {
    got = await fetchForm(dex, subindex, baseSlug, regionSlug, tmp);
  } catch (err) {
    fs.rmSync(tmp, { recursive: true, force: true });
    return { mon, skipped: true, reason: `fetch error: ${err.message}` };
  }

  if (!got.anim || got.sheets.length === 0) {
    fs.rmSync(tmp, { recursive: true, force: true });
    return { mon, skipped: true, reason: 'AnimData.xml または -Anim.png シートが取得できなかった' };
  }

  // 2. raw 配置: all PNG sheets → lossless webp
  const rawDir = path.join(root, 'assets', 'raw', 'forms', regionSlug, mon);
  fs.mkdirSync(rawDir, { recursive: true });
  fs.copyFileSync(path.join(tmp, 'AnimData.xml'), path.join(rawDir, 'AnimData.xml'));

  for (const pngName of got.sheets) {
    const webpName = pngName.replace(/\.png$/i, '.webp');
    await toWebp(path.join(tmp, pngName), path.join(rawDir, webpName));
  }

  // 3. Pack JSON (parse-anim.mjs --all)
  const generation = `forms/${regionSlug}`;
  const rawPath = `forms/${regionSlug}/${mon}`;
  const packDir = path.join(root, 'assets', 'packs', 'retro', 'forms', regionSlug);
  fs.mkdirSync(packDir, { recursive: true });
  execFileSync('node', [
    path.join(__dirname, 'parse-anim.mjs'),
    '--xml',        path.join(rawDir, 'AnimData.xml'),
    '--dir',        rawDir,
    '--name',       mon,
    '--generation', generation,
    '--rawPath',    rawPath,
    '--out',        path.join(packDir, `${mon}.json`),
    '--flipX',      'true',
    '--all',
  ], { stdio: 'inherit' });

  // 4. UI tile (96×96 PNG)
  const uiDir = path.join(root, 'assets', 'ui', 'forms', regionSlug);
  fs.mkdirSync(uiDir, { recursive: true });
  const uiOut = path.join(uiDir, `${mon}.png`);

  if (got.tile === 'pokemondb') {
    await sharp(path.join(tmp, 'tile.png'))
      .resize(96, 96, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(uiOut);
  } else {
    // Fallback: extract front frame from Idle-Anim.webp (same as normal Pokémon)
    const idleWebp = path.join(rawDir, 'Idle-Anim.webp');
    const xmlPathForTile = path.join(rawDir, 'AnimData.xml');
    if (fs.existsSync(idleWebp)) {
      const { w: fw, h: fh } = readIdleFrameSize(xmlPathForTile);
      console.log(`  PMD tile fallback: extracting ${fw}×${fh} frame from Idle-Anim.webp`);
      await sharp(idleWebp)
        .extract({ left: 0, top: 0, width: fw, height: fh })
        .resize(96, 96, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toFile(uiOut);
    } else {
      console.warn(`  Tile fallback failed: Idle-Anim.webp not found in ${rawDir}`);
    }
  }

  // 5. Cleanup temp
  fs.rmSync(tmp, { recursive: true, force: true });

  console.log(`  Done: tile=${got.tile}`);
  return { mon, skipped: false, tile: got.tile };
}

// ---- CLI entry point ----

const formsMode = process.argv.includes('--forms');
const genArg  = arg('gen');
const dexArg  = arg('dex');
const slugArg = arg('slug');
const manifest = arg('manifest');
const onlyArg = arg('only');  // --only <slug> to process a single form in --forms mode

if (formsMode) {
  // --forms mode: read forms-manifest.json and build regional forms
  const manifestPath = path.join(root, 'assets', 'packs', 'forms-manifest.json');
  const raw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const list = raw.includable ?? [];

  const toProcess = onlyArg ? list.filter(m => m.slug === onlyArg) : list;
  if (toProcess.length === 0) {
    console.error(onlyArg ? `--only ${onlyArg} not found in forms-manifest.json` : 'No includable forms in manifest');
    process.exit(1);
  }

  const results = [];
  for (const entry of toProcess) {
    results.push(await buildForm(entry));
  }

  const skipped = results.filter(r => r.skipped);
  console.log(`\n完了: ${results.length - skipped.length} フォルム生成 / スキップ ${skipped.length}`);
  if (skipped.length) {
    console.log('スキップ:', skipped.map(s => `${s.mon} (${s.reason})`).join(', '));
  }
} else {
  // Original mode
  if (!genArg) {
    console.error('Usage: --gen N [--dex D --slug S] | [--manifest <path>] | --forms [--only <slug>]');
    process.exit(1);
  }

  const results = [];

  if (dexArg) {
    // Single mode
    if (!slugArg) {
      console.error('Single mode requires --slug');
      process.exit(1);
    }
    results.push(await buildOne(Number(dexArg), slugArg, Number(genArg)));
  } else if (manifest) {
    // Batch mode
    const raw = JSON.parse(fs.readFileSync(path.resolve(manifest), 'utf8'));
    const list = Array.isArray(raw) ? raw : (raw.includable ?? raw);
    const filtered = list.filter(m => String(m.gen) === String(genArg));
    for (const m of filtered) {
      results.push(await buildOne(m.dex, m.slug, m.gen));
    }
  } else {
    console.error('Specify either --dex/--slug (single) or --manifest (batch)');
    process.exit(1);
  }

  const skipped = results.filter(r => r.skipped);
  console.log(`\n完了: ${results.length - skipped.length} 体生成 / スキップ ${skipped.length}`);
  if (skipped.length) {
    console.log('スキップ:', skipped.map(s => `${s.mon} (${s.reason})`).join(', '));
  }
}

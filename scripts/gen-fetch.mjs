import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const SC = 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/sprite';

async function dl(url, dest) {
  const res = await fetch(url);
  if (!res.ok) return false;
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return true;
}

export function pokedbSlug(slug) {
  return slug.toLowerCase()
    .replace(/['’]/g, '')       // apostrophe removal (U+0027, U+2019)
    .replace(/[ _.]/g, '-')          // space/underscore/dot -> hyphen
    .replace(/-{2,}/g, '-')          // collapse repeated hyphens
    .replace(/^-|-$/g, '');          // strip leading/trailing hyphens
}

/** Returns the sprite subdirectory path for a regional form, e.g. "0026/0001" */
export function formSpriteDir(dex, subindex) {
  return `${String(dex).padStart(4, '0')}/${subindex}`;
}

/**
 * Enumerate all *-Anim.png filenames in sprite/<dir>/ via the GitHub Contents API.
 * Falls back to an empty list if gh is unavailable or the directory doesn't exist.
 */
async function listAnimSheets(dir) {
  try {
    const out = execFileSync(
      'gh',
      ['api', `repos/PMDCollab/SpriteCollab/contents/sprite/${dir}`, '--jq', '.[].name'],
      { encoding: 'utf8' }
    );
    return out.split('\n').map(s => s.trim()).filter(n => n.endsWith('-Anim.png'));
  } catch (err) {
    console.warn(`listAnimSheets(${dir}): gh api failed — ${err.message}`);
    return [];
  }
}

/**
 * Fetch all assets for a regional form.
 * @param {number} dex       Pokédex number
 * @param {string} subindex  Subindex string (e.g. "0001")
 * @param {string} baseSlug  Base Pokémon slug (e.g. "raichu")
 * @param {string} region    Region slug (alola|galar|hisui|paldea)
 * @param {string} destDir   Destination directory (created if absent)
 * @returns {{ anim:boolean, sheets:string[], tile:string }}
 */
export async function fetchForm(dex, subindex, baseSlug, region, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const dir = formSpriteDir(dex, subindex);
  const got = { anim: false, sheets: [], tile: 'none' };

  got.anim = await dl(`${SC}/${dir}/AnimData.xml`, path.join(destDir, 'AnimData.xml'));

  const names = await listAnimSheets(dir);
  for (const n of names) {
    if (await dl(`${SC}/${dir}/${n}`, path.join(destDir, n))) got.sheets.push(n);
  }

  const pdb = `https://img.pokemondb.net/sprites/black-white/normal/${pokedbSlug(baseSlug)}-${region}.png`;
  got.tile = (await dl(pdb, path.join(destDir, 'tile.png'))) ? 'pokemondb' : 'none';

  return got;
}

export async function fetchPokemon(dex, slug, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const d4 = String(dex).padStart(4, '0');
  const got = { anim: false, walk: false, idle: false, sleep: false, tile: 'none' };

  got.anim  = await dl(`${SC}/${d4}/AnimData.xml`,    path.join(destDir, 'AnimData.xml'));
  got.walk  = await dl(`${SC}/${d4}/Walk-Anim.png`,   path.join(destDir, 'Walk-Anim.png'));
  got.idle  = await dl(`${SC}/${d4}/Idle-Anim.png`,   path.join(destDir, 'Idle-Anim.png'));
  got.sleep = await dl(`${SC}/${d4}/Sleep-Anim.png`,  path.join(destDir, 'Sleep-Anim.png'));

  // tile: pokemondb BW sprite preferred ('pokemondb'); 404 -> 'none', and gen-build
  // generates a fallback tile from the PMD Idle frame. So tile is 'pokemondb' | 'none'.
  const pdb = `https://img.pokemondb.net/sprites/black-white/normal/${pokedbSlug(slug)}.png`;
  got.tile = (await dl(pdb, path.join(destDir, 'tile.png'))) ? 'pokemondb' : 'none';

  return got;
}

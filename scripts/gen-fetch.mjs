import fs from 'node:fs';
import path from 'node:path';

const SC = 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/sprite';

async function dl(url, dest) {
  const res = await fetch(url);
  if (!res.ok) return false;
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return true;
}

function pokedbSlug(slug) {
  return slug.toLowerCase().replace(/[ _.']/g, '-').replace(/--+/g, '-');
}

export async function fetchPokemon(dex, slug, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  const d4 = String(dex).padStart(4, '0');
  const got = { anim: false, walk: false, idle: false, sleep: false, tile: 'none' };

  got.anim  = await dl(`${SC}/${d4}/AnimData.xml`,    path.join(destDir, 'AnimData.xml'));
  got.walk  = await dl(`${SC}/${d4}/Walk-Anim.png`,   path.join(destDir, 'Walk-Anim.png'));
  got.idle  = await dl(`${SC}/${d4}/Idle-Anim.png`,   path.join(destDir, 'Idle-Anim.png'));
  got.sleep = await dl(`${SC}/${d4}/Sleep-Anim.png`,  path.join(destDir, 'Sleep-Anim.png'));

  // タイル: pokemondb BWスプライト優先、404なら後段タスクで PMD Idle から生成
  const pdb = `https://img.pokemondb.net/sprites/black-white/normal/${pokedbSlug(slug)}.png`;
  got.tile = (await dl(pdb, path.join(destDir, 'tile.png'))) ? 'pokemondb' : 'none';

  return got;
}

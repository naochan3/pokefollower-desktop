import { fetchPokemon } from '../gen-fetch.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-fetch-'));
const r = await fetchPokemon(571, 'zoroark', d);
// tile.png は pokemondb が 404 の場合は存在しないため assertion から除外
const need = ['AnimData.xml','Walk-Anim.png','Idle-Anim.png','Sleep-Anim.png'];
const missing = need.filter(f => !fs.existsSync(path.join(d, f)));
if (missing.length) { console.error('欠落:', missing, r); process.exit(1); }
console.log('fetch OK', r);
console.log('tile:', r.tile, '(tile.png は任意)');

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
    const types = await fetchTypesFor(pokeapiSlug(e));
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

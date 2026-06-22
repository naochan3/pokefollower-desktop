import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

// pack id -> PokéAPI slug の例外マップ。
// PokéAPI は既定フォームに接尾辞が要る種（deoxys-normal 等）や、命名差（farfetchd-galar）があるため、
// 規則導出で 404 になる pack id だけをここで吸収する（実測で判明した分のみ）。
const SLUG_FIXUP = {
  "retro/gen-3/386-deoxys": "deoxys-normal",
  "retro/gen-4/413-wormadam": "wormadam-plant",
  "retro/gen-4/487-giratina": "giratina-altered",
  "retro/gen-4/492-shaymin": "shaymin-land",
  "retro/gen-5/550-basculin": "basculin-red-striped",
  "retro/gen-5/555-darmanitan": "darmanitan-standard",
  "retro/forms/galar/555-darmanitan": "darmanitan-galar-standard",
  "retro/gen-5/641-tornadus": "tornadus-incarnate",
  "retro/gen-5/642-thundurus": "thundurus-incarnate",
  "retro/gen-5/645-landorus": "landorus-incarnate",
  "retro/gen-5/647-keldeo": "keldeo-ordinary",
  "retro/gen-5/648-meloetta": "meloetta-aria",
  "retro/gen-6/678-meowstic": "meowstic-male",
  "retro/gen-6/681-aegislash": "aegislash-shield",
  "retro/gen-6/710-pumpkaboo": "pumpkaboo-average",
  "retro/gen-6/711-gourgeist": "gourgeist-average",
  "retro/gen-6/718-zygarde": "zygarde-50",
  "retro/gen-7/745-lycanroc": "lycanroc-midday",
  "retro/gen-7/746-wishiwashi": "wishiwashi-solo",
  "retro/gen-7/774-minior": "minior-red-meteor",
  "retro/gen-7/778-mimikyu": "mimikyu-disguised",
  "retro/gen-8/849-toxtricity": "toxtricity-amped",
  "retro/gen-8/875-eiscue": "eiscue-ice",
  "retro/gen-8/876-indeedee": "indeedee-male",
  "retro/gen-8/877-morpeko": "morpeko-full-belly",
  "retro/gen-8/892-urshifu": "urshifu-single-strike",
  "retro/gen-8/902-basculegion": "basculegion-male",
  "retro/gen-8/905-enamorus": "enamorus-incarnate",
  "retro/gen-9/916-oinkologne": "oinkologne-male",
  "retro/gen-9/925-maushold": "maushold-family-of-four",
  "retro/gen-9/964-palafin": "palafin-zero",
  "retro/gen-9/978-tatsugiri": "tatsugiri-curly",
  "retro/gen-9/982-dudunsparce": "dudunsparce-two-segment",
  "retro/forms/galar/083-farfetch-d": "farfetchd-galar",
  "retro/forms/paldea/128-tauros": "tauros-paldea-combat-breed",
};

// pack id（例 retro/gen-1/025-pikachu / retro/forms/alola/026-raichu）→ PokéAPI slug
export function pokeapiSlug(entry) {
  if (SLUG_FIXUP[entry.id]) return SLUG_FIXUP[entry.id];
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

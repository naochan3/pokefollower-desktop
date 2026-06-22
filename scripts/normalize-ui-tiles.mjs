// UIタイル(96x96 PNG)の中身の位置・大きさを揃える正規化スクリプト。
// 透明余白をトリム → 96x96 に「中央フィット(最近傍)」で再配置。
// これで個体ごとにバラバラだったキャラの位置・サイズが中央・均一になる。
// 使い方: node scripts/normalize-ui-tiles.mjs [対象ディレクトリ(既定: assets/ui/forms)]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(ROOT, process.argv[2] || "assets/ui/forms");
const SIZE = 96;

function listPngs(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listPngs(p));
    else if (e.name.endsWith(".png")) out.push(p);
  }
  return out;
}

const files = listPngs(target);
let ok = 0, skip = 0;
for (const f of files) {
  try {
    const src = fs.readFileSync(f);
    const out = await sharp(src)
      .ensureAlpha()
      .trim() // 透明な余白を除去（中身の bbox にそろえる）
      .resize(SIZE, SIZE, {
        fit: "contain",
        kernel: "nearest", // ドット絵をくっきり保つ
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
    fs.writeFileSync(f, out);
    ok++;
  } catch (err) {
    console.error(`[normalize-ui-tiles] skip ${path.relative(ROOT, f)}: ${err.message}`);
    skip++;
  }
}
console.log(`[normalize-ui-tiles] normalized ${ok} tiles (skipped ${skip}) under ${path.relative(ROOT, target)}`);

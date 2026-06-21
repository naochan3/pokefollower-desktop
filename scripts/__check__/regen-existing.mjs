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
  // 構造比較: states キー・各 frame/frames/rows/fps
  for (const st of Object.keys(committed.states)) {
    const c = committed.states[st], r = regen.states[st];
    const eq = r && JSON.stringify(c.frame)===JSON.stringify(r.frame)
      && c.frames===r.frames && JSON.stringify(c.rows)===JSON.stringify(r.rows)
      && c.fps===r.fps;
    if (!eq) { console.error(`MISMATCH ${name}.${st}`, {c, r}); bad++; }
  }
}
if (bad) { console.error(`\n較正失敗: ${bad} 件の不一致`); process.exit(1); }
console.log('較正OK: 既存packを構造一致で再生成できる');

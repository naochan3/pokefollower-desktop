import { test, expect } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// フィクスチャ: blastoise は Idle/Walk/Sleep/Rotate の 4 WebP シートを持つ。
// --all モードでは XML の全 Anim を走査し、シートが存在する分だけ state に出すため
// rotate state も含めた 4 state 以上が出るはず。
// --all 未実装時は idle/walk/sleep の 3 state のみとなりテストが失敗する。
test("--all emits idle/walk/sleep plus extra anims when sheets exist", () => {
  const out = path.join(os.tmpdir(), `pa-${process.pid}.json`);
  execFileSync("node", [
    "scripts/parse-anim.mjs",
    "--xml", "assets/raw/gen-1/009-blastoise/Blastoise_AnimData.xml",
    "--dir", "assets/raw/gen-1/009-blastoise",
    "--name", "009-blastoise", "--generation", "gen-1",
    "--out", out, "--all",
  ]);
  const pack = JSON.parse(fs.readFileSync(out, "utf8"));
  expect(pack.states.idle).toBeTruthy();
  expect(pack.states.walk).toBeTruthy();
  // Rotate-Anim.webp が存在するので --all モードでは rotate state も出る
  expect(pack.states.rotate).toBeTruthy();
  expect(Object.keys(pack.states).length).toBeGreaterThanOrEqual(4);
  fs.rmSync(out, { force: true });
});

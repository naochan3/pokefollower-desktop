import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makePackReader } from "../src/main/pack-reader.js";

describe("pack-reader", () => {
  const root = resolve(".");
  const reader = makePackReader(root);

  it("世代なしpack keyから推定世代のmetadataを解決する", () => {
    const { resolvedKey, meta } = reader.readPackMeta("retro/025-pikachu");

    expect(resolvedKey).toBe("retro/gen-1/025-pikachu");
    expect(meta.states.idle).toBeTruthy();
    expect(meta.states.walk).toBeTruthy();
  });

  it("pack listをdex順・日本語名付きで返す", () => {
    const list = reader.readPackList();

    // データセットは世代追加で増える。固定数ではなく下限＋構造で検証する。
    expect(list.length).toBeGreaterThanOrEqual(493);
    expect(list[0]).toMatchObject({
      id: "retro/gen-1/001-bulbasaur",
      num: 1,
      ja: "フシギダネ",
      en: "Bulbasaur",
    });
    // 既知エントリの結合（日本語名）が正しいこと
    expect(list.find((item) => item.num === 493)).toMatchObject({
      id: "retro/gen-4/493-arceus",
      ja: "アルセウス",
      en: "Arceus",
    });
    // dex 昇順
    expect(list.map((item) => item.num)).toEqual([...list].map((item) => item.num).sort((a, b) => a - b));
  });

  it("存在しないpack keyは明示的に失敗する", () => {
    expect(() => reader.readPackMeta("retro/gen-9/999-missingno")).toThrow(/pack not found/);
  });

  it("不正なpack keyではroot外候補を探索しない", () => {
    expect(() => reader.readPackMeta("retro/../../secret")).toThrow(/pack not found/);
  });
});

describe("pack-reader: region / form ja (temp fixtures)", () => {
  let tmpRoot;

  function setupTempRoot(indexRetro, jpNames) {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokefollower-test-"));
    const packsDir = path.join(tmpRoot, "assets", "packs");
    fs.mkdirSync(packsDir, { recursive: true });
    fs.writeFileSync(path.join(packsDir, "index.json"), JSON.stringify({ retro: indexRetro }));
    fs.writeFileSync(path.join(packsDir, "jp-names.json"), JSON.stringify(jpNames));
  }

  it("readPackList が region とフォルムja を返す", () => {
    setupTempRoot(
      [
        { id: "retro/gen-1/025-pikachu", name: "025-Pikachu" },
        { id: "retro/forms/alola/026-raichu", name: "026-Raichu-Alola", region: "alola", ja: "アローラライチュウ" },
      ],
      {
        "25": { ja: "ピカチュウ", romaji: "Pikachu" },
        "26": { ja: "ライチュウ", romaji: "Raichu" },
      }
    );

    const list = makePackReader(tmpRoot).readPackList();

    const normal = list.find((p) => p.id === "retro/gen-1/025-pikachu");
    expect(normal.region).toBeNull();
    expect(normal.ja).toBe("ピカチュウ");

    const form = list.find((p) => p.id === "retro/forms/alola/026-raichu");
    expect(form.region).toBe("alola");
    expect(form.ja).toBe("アローラライチュウ");
  });
});

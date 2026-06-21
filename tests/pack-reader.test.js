import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
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

    expect(list.length).toBe(493);
    expect(list[0]).toMatchObject({
      id: "retro/gen-1/001-bulbasaur",
      num: 1,
      ja: "フシギダネ",
      en: "Bulbasaur",
    });
    expect(list.at(-1)).toMatchObject({
      id: "retro/gen-4/493-arceus",
      num: 493,
      ja: "アルセウス",
      en: "Arceus",
    });
    expect(list.map((item) => item.num)).toEqual([...list].map((item) => item.num).sort((a, b) => a - b));
  });

  it("存在しないpack keyは明示的に失敗する", () => {
    expect(() => reader.readPackMeta("retro/gen-9/999-missingno")).toThrow(/pack not found/);
  });

  it("不正なpack keyではroot外候補を探索しない", () => {
    expect(() => reader.readPackMeta("retro/../../secret")).toThrow(/pack not found/);
  });

  it("同じpack listとmetadataはプロセス内キャッシュから返す", () => {
    const reads = [];
    const fileSystem = {
      readFileSync(file) {
        reads.push(file);
        if (file.endsWith("index.json")) {
          return JSON.stringify({ retro: [{ id: "retro/gen-1/001-bulbasaur", name: "001-Bulbasaur" }] });
        }
        if (file.endsWith("jp-names.json")) {
          return JSON.stringify({ 1: { ja: "フシギダネ", romaji: "fushigidane" } });
        }
        if (file.endsWith("001-bulbasaur.json")) {
          return JSON.stringify({ states: { idle: {}, walk: {} } });
        }
        throw new Error(`unexpected read: ${file}`);
      },
    };
    const cachedReader = makePackReader("/app", fileSystem);

    expect(cachedReader.readPackList()).toHaveLength(1);
    expect(cachedReader.readPackList()).toHaveLength(1);
    expect(cachedReader.readPackMeta("retro/gen-1/001-bulbasaur").resolvedKey).toBe("retro/gen-1/001-bulbasaur");
    expect(cachedReader.readPackMeta("retro/gen-1/001-bulbasaur").resolvedKey).toBe("retro/gen-1/001-bulbasaur");

    expect(reads.filter((file) => file.endsWith("index.json"))).toHaveLength(1);
    expect(reads.filter((file) => file.endsWith("jp-names.json"))).toHaveLength(1);
    expect(reads.filter((file) => file.endsWith("001-bulbasaur.json"))).toHaveLength(1);
  });
});

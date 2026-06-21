import { describe, it, expect } from "vitest";
import {
  CODEX_COLUMNS,
  CODEX_FRAME_HEIGHT,
  CODEX_FRAME_WIDTH,
  CODEX_ROWS,
  CODEX_SHEET_HEIGHT,
  CODEX_SHEET_WIDTH,
  buildFramePlan,
  buildPetManifest,
  displayNameForPack,
  getCodexHome,
  petSlugForPackKey,
} from "../src/main/codex-pet-export.js";

describe("codex-pet-export", () => {
  const meta = {
    rawPath: "gen-1/025-pikachu",
    states: {
      idle: {
        sheet: "Idle-Anim.webp",
        frame: { w: 40, h: 56 },
        frames: 6,
        rows: {
          front: 0,
          frontRight: 1,
          right: 2,
          back: 4,
          left: 6,
        },
      },
      walk: {
        sheet: "Walk-Anim.webp",
        frame: { w: 32, h: 40 },
        frames: 4,
        rows: {
          front: 0,
          right: 2,
          back: 4,
          left: 6,
        },
      },
    },
  };

  it("Codexのcustom petが読む固定spritesheet寸法でframe planを作る", () => {
    const frames = buildFramePlan(meta);

    expect(CODEX_SHEET_WIDTH).toBe(1536);
    expect(CODEX_SHEET_HEIGHT).toBe(1872);
    expect(CODEX_FRAME_WIDTH).toBe(192);
    expect(CODEX_FRAME_HEIGHT).toBe(208);
    expect(frames).toHaveLength(CODEX_COLUMNS * CODEX_ROWS);
    expect(frames[0]).toMatchObject({
      sourceState: "idle",
      sourceColumn: 0,
      sourceRow: 0,
      targetX: 0,
      targetY: 0,
    });
    expect(frames[CODEX_COLUMNS]).toMatchObject({
      sourceState: "walk",
      sourceRow: 2,
      targetX: 0,
      targetY: CODEX_FRAME_HEIGHT,
    });
    expect(frames[CODEX_COLUMNS + 7].sourceColumn).toBe(3);
  });

  it("manifestとslugはCodexのcustom avatar loaderに合う形にする", () => {
    expect(petSlugForPackKey("retro/gen-1/025-pikachu")).toBe("pokefollower-025-pikachu");
    expect(buildPetManifest({ displayName: "PokéFollower ピカチュウ", description: "generated" })).toEqual({
      displayName: "PokéFollower ピカチュウ",
      description: "generated",
      spritesheetPath: "spritesheet.png",
    });
  });

  it("表示名はpack listの日本語名を優先する", () => {
    expect(displayNameForPack("retro/gen-1/025-pikachu", [{ id: "retro/gen-1/025-pikachu", ja: "ピカチュウ", en: "Pikachu" }])).toBe("PokéFollower ピカチュウ");
    expect(displayNameForPack("retro/gen-1/025-pikachu", [])).toBe("PokéFollower 025-pikachu");
  });

  it("CODEX_HOMEがあればcustom petsの出力先rootに使う", () => {
    expect(getCodexHome({ CODEX_HOME: "/tmp/codex-home" })).toBe("/tmp/codex-home");
  });
});

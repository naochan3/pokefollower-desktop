const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const CODEX_SHEET_WIDTH = 1536;
const CODEX_SHEET_HEIGHT = 1872;
const CODEX_FRAME_WIDTH = 192;
const CODEX_FRAME_HEIGHT = 208;
const CODEX_COLUMNS = 8;
const CODEX_ROWS = 9;

const ROW_SPECS = [
  { state: "idle", direction: "front", frames: 6 },
  { state: "walk", direction: "right", frames: 8 },
  { state: "walk", direction: "left", frames: 8 },
  { state: "idle", direction: "frontRight", frames: 4 },
  { state: "walk", direction: "back", frames: 5 },
  { state: "idle", direction: "front", frames: 8 },
  { state: "idle", direction: "front", frames: 6 },
  { state: "walk", direction: "front", frames: 6 },
  { state: "walk", direction: "back", frames: 6 },
];

function getCodexHome(env = process.env) {
  return env.CODEX_HOME || path.join(os.homedir(), ".codex");
}

function slugForPackKey(packKey) {
  return String(packKey || "").split("/").pop() || "pokemon";
}

function petSlugForPackKey(packKey) {
  return `pokefollower-${slugForPackKey(packKey)}`;
}

function displayNameForPack(packKey, packList) {
  const found = (packList || []).find((item) => item.id === packKey);
  const name = found?.ja || found?.en || slugForPackKey(packKey);
  return `PokéFollower ${name}`;
}

function buildPetManifest({ displayName, description, spritesheetPath = "spritesheet.png" }) {
  return {
    displayName,
    description,
    spritesheetPath,
  };
}

function sourceRowFor(stateMeta, direction) {
  return stateMeta.rows?.[direction] ?? stateMeta.rows?.front ?? 0;
}

function buildFramePlan(meta) {
  const frames = [];
  ROW_SPECS.forEach((rowSpec, rowIndex) => {
    const stateMeta = meta.states[rowSpec.state] || meta.states.idle || meta.states.walk;
    const sourceFrames = Math.max(1, stateMeta.frames || 1);
    const sourceRow = sourceRowFor(stateMeta, rowSpec.direction);
    for (let columnIndex = 0; columnIndex < CODEX_COLUMNS; columnIndex += 1) {
      const active = columnIndex < rowSpec.frames;
      const sourceColumn = active ? columnIndex % sourceFrames : Math.max(0, rowSpec.frames - 1) % sourceFrames;
      frames.push({
        sourceState: rowSpec.state,
        sourceColumn,
        sourceRow,
        sourceWidth: stateMeta.frame.w,
        sourceHeight: stateMeta.frame.h,
        targetX: columnIndex * CODEX_FRAME_WIDTH,
        targetY: rowIndex * CODEX_FRAME_HEIGHT,
        targetWidth: CODEX_FRAME_WIDTH,
        targetHeight: CODEX_FRAME_HEIGHT,
      });
    }
  });
  return frames;
}

function readSheetDataUrls(root, meta) {
  const out = {};
  for (const [state, stateMeta] of Object.entries(meta.states)) {
    const filePath = path.join(root, "assets", "raw", meta.rawPath, stateMeta.sheet);
    const ext = path.extname(stateMeta.sheet).toLowerCase();
    const mime = ext === ".png" ? "image/png" : "image/webp";
    out[state] = `data:${mime};base64,${fs.readFileSync(filePath).toString("base64")}`;
  }
  return out;
}

async function renderSpritesheetPng({ BrowserWindow, root, meta }) {
  const win = new BrowserWindow({
    show: false,
    width: 1,
    height: 1,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  try {
    await win.loadURL("data:text/html;charset=utf-8,<canvas></canvas>");
    const payload = {
      width: CODEX_SHEET_WIDTH,
      height: CODEX_SHEET_HEIGHT,
      frameWidth: CODEX_FRAME_WIDTH,
      frameHeight: CODEX_FRAME_HEIGHT,
      sheets: readSheetDataUrls(root, meta),
      frames: buildFramePlan(meta),
    };
    const base64 = await win.webContents.executeJavaScript(`
      (async (payload) => {
        const canvas = document.querySelector("canvas");
        canvas.width = payload.width;
        canvas.height = payload.height;
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        const cache = new Map();
        const loadImage = (src) => new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("failed to load spritesheet"));
          img.src = src;
        });
        for (const frame of payload.frames) {
          const src = payload.sheets[frame.sourceState];
          if (!cache.has(src)) cache.set(src, await loadImage(src));
          const img = cache.get(src);
          const scale = Math.min(frame.targetWidth / frame.sourceWidth, frame.targetHeight / frame.sourceHeight);
          const drawWidth = Math.max(1, Math.round(frame.sourceWidth * scale));
          const drawHeight = Math.max(1, Math.round(frame.sourceHeight * scale));
          const drawX = frame.targetX + Math.floor((frame.targetWidth - drawWidth) / 2);
          const drawY = frame.targetY + Math.floor((frame.targetHeight - drawHeight) / 2);
          ctx.drawImage(
            img,
            frame.sourceColumn * frame.sourceWidth,
            frame.sourceRow * frame.sourceHeight,
            frame.sourceWidth,
            frame.sourceHeight,
            drawX,
            drawY,
            drawWidth,
            drawHeight
          );
        }
        return canvas.toDataURL("image/png").split(",")[1];
      })(${JSON.stringify(payload)})
    `);
    return Buffer.from(base64, "base64");
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

async function exportCodexPet({ BrowserWindow, root, packReader, packKey, codexHome = getCodexHome() }) {
  const { resolvedKey, meta } = packReader.readPackMeta(packKey);
  const slug = petSlugForPackKey(resolvedKey);
  const targetDir = path.join(codexHome, "pets", slug);
  const spritesheetPath = path.join(targetDir, "spritesheet.png");
  const manifestPath = path.join(targetDir, "pet.json");
  const displayName = displayNameForPack(resolvedKey, packReader.readPackList());
  const description = `Generated from PokeFollower pack ${resolvedKey}.`;
  const manifest = buildPetManifest({ displayName, description });
  const spritesheet = await renderSpritesheetPng({ BrowserWindow, root, meta });

  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(spritesheetPath, spritesheet);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  return {
    id: `custom:${slug}`,
    directory: targetDir,
    manifestPath,
    spritesheetPath,
    displayName,
  };
}

module.exports = {
  CODEX_COLUMNS,
  CODEX_FRAME_HEIGHT,
  CODEX_FRAME_WIDTH,
  CODEX_ROWS,
  CODEX_SHEET_HEIGHT,
  CODEX_SHEET_WIDTH,
  buildFramePlan,
  buildPetManifest,
  displayNameForPack,
  exportCodexPet,
  getCodexHome,
  petSlugForPackKey,
};

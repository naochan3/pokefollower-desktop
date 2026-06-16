# PokéFollower Desktop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ブラウザ拡張のカーソル追従ポケモンを、Windows常駐のデスクトップマスコット（Electron）に移植し、`.exe`で配布できる状態にする。

**Architecture:** Electronのメインプロセスが「カーソル座標の取得・設定の永続化・IPC・トレイ・窓管理」を担う司令塔。透明・全画面・最前面・クリック透過の「オーバーレイ窓」が既存の描画/追従ロジックでポケモンを描く。トレイから開く「設定窓」は既存のポップアップUIを移植。クリック透過窓は`mousemove`を受け取れないため、mainが`screen.getCursorScreenPoint()`を約60fpsでポーリングしIPCでオーバーレイへ送る。アセット参照はカスタム`app://`プロトコルで解決し、既存の`fetch`／`background-image`ロジックをほぼ無改変で再利用する。

**Tech Stack:** Electron, electron-builder (NSIS), Vitest（純粋ロジックの単体テスト）, Node.js fs（設定の永続化）

**移植元:** `C:\Users\nekop\Desktop\Development\_inspect_pokefollower\src\`（クローン済みの拡張機能本体）。本計画の相対パスは断りがなければプロジェクトルート `repos/_active/pokefollower-desktop/` 基準。

---

## File Structure

```
pokefollower-desktop/
  package.json                 # 依存・scripts・electron-builder設定
  src/
    main/
      main.js                  # エントリ。プロトコル登録・窓生成・トレイ・IPC配線・enable状態
      settings-store.js        # 設定JSONの読み書き（純粋寄り・テスト対象）
      asset-path.js            # パック候補解決・slug/dex/generation（純粋・テスト対象。content.jsから抽出）
      cursor-mapping.js        # screen座標→オーバーレイローカル座標（純粋・テスト対象）
      cursor-tracker.js        # getCursorScreenPointを60fpsポーリングしコールバック
      pack-reader.js           # パックJSON/indexをfsで読む（mainからのみ）
    overlay/
      overlay.html             # 透明背景の空ページ＋overlay.js読み込み
      overlay.js               # content.jsを移植（入力をIPC化・extUrlをapp://化）
      overlay-preload.js       # contextBridgeでcursor/config/enabled受信・loadPack invoke
    settings/
      settings.html            # popup/index.htmlを移植
      settings.js              # popup.jsを移植（chrome.* → settingsApi）
      settings-preload.js      # contextBridgeでget/set設定・listPacks
  assets/                      # 拡張機能からコピー: icons/ packs/ raw/ ui/
  tests/
    settings-store.test.js
    asset-path.test.js
    cursor-mapping.test.js
  vitest.config.js
```

---

## Task 1: プロジェクト雛形と起動確認

**Files:**
- Create: `package.json`
- Create: `src/main/main.js`
- Create: `vitest.config.js`

- [ ] **Step 1: `package.json` を作成**

```json
{
  "name": "pokefollower-desktop",
  "version": "1.0.0",
  "description": "カーソルを追うポケモンのデスクトップ常駐マスコット (Electron)",
  "main": "src/main/main.js",
  "type": "commonjs",
  "scripts": {
    "start": "electron .",
    "test": "vitest run",
    "dist": "electron-builder --win"
  },
  "devDependencies": {
    "electron": "^31.0.0",
    "electron-builder": "^24.13.3",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: 依存をインストール**

Run: `npm install`
Expected: `node_modules/` が作られ、`electron` `electron-builder` `vitest` が入る（エラーなし）。

- [ ] **Step 3: 最小の `src/main/main.js` を作成**

```js
const { app, BrowserWindow } = require("electron");

app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 400, height: 300 });
  win.loadURL("data:text/html,<h1>PokeFollower Desktop OK</h1>");
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
```

- [ ] **Step 4: `vitest.config.js` を作成**

```js
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.js"],
  },
});
```

- [ ] **Step 5: 起動確認**

Run: `npm start`
Expected: 「PokeFollower Desktop OK」と表示されたウィンドウが開く。閉じるとプロセス終了。

- [ ] **Step 6: コミット**

```bash
git add package.json package-lock.json src/main/main.js vitest.config.js
git commit -m "chore: Electronプロジェクトの雛形を追加"
```

---

## Task 2: アセットの取り込み

**Files:**
- Create: `assets/` （`_inspect_pokefollower/src/assets/` からコピー）

- [ ] **Step 1: アセットをコピー**

Run（PowerShell。プロジェクトルートで実行）:
```powershell
Copy-Item -Recurse "C:\Users\nekop\Desktop\Development\_inspect_pokefollower\src\assets" ".\assets"
```
Expected: `assets/icons` `assets/packs` `assets/raw` `assets/ui` が作られる。

- [ ] **Step 2: 取り込み確認**

Run: `node -e "const fs=require('fs'); console.log(fs.existsSync('assets/packs/index.json'), fs.existsSync('assets/raw/gen-1/025-pikachu/Idle-Anim.webp'), fs.existsSync('assets/icons/pokeball-32.png'))"`
Expected: `true true true`

- [ ] **Step 3: コミット**

```bash
git add assets
git commit -m "assets: スプライト・アイコン・UI素材を取り込み"
```

---

## Task 3: 設定ストア（settings-store.js）

設定の読み書き。保存先パスを引数で注入できるようにして、テストでは一時ファイルを使う。
保存項目とデフォルトは移植元 `popup.js` の `DEFAULTS` と `content.js` の `CONFIG` に一致させる。

**Files:**
- Create: `src/main/settings-store.js`
- Test: `tests/settings-store.test.js`

- [ ] **Step 1: 失敗するテストを書く**

```js
import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSettingsStore, DEFAULTS } from "../src/main/settings-store.js";

describe("settings-store", () => {
  let dir, file;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "pf-"));
    file = join(dir, "settings.json");
  });

  it("ファイルが無ければデフォルトを返す", () => {
    const store = createSettingsStore(file);
    expect(store.getAll()).toEqual(DEFAULTS);
  });

  it("set した値が get で返り、再読込でも保持される", () => {
    const store = createSettingsStore(file);
    store.set({ pack: "retro/gen-1/025-pikachu", scale: 2 });
    expect(store.get("pack")).toBe("retro/gen-1/025-pikachu");
    const reopened = createSettingsStore(file);
    expect(reopened.get("scale")).toBe(2);
    expect(reopened.get("pack")).toBe("retro/gen-1/025-pikachu");
  });

  it("不正な数値は無視してデフォルトを保つ", () => {
    const store = createSettingsStore(file);
    store.set({ scale: "abc", offset: NaN });
    expect(store.get("scale")).toBe(DEFAULTS.scale);
    expect(store.get("offset")).toBe(DEFAULTS.offset);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test -- tests/settings-store.test.js`
Expected: FAIL（`createSettingsStore` 未定義）。

- [ ] **Step 3: 実装する**

```js
const fs = require("node:fs");

const DEFAULTS = {
  enabled: false,
  pack: "retro/gen-1/009-blastoise",
  scale: 1.25,
  offset: 30,
  lerp: 0.20,
};

const NUMERIC_KEYS = ["scale", "offset", "lerp"];

function sanitize(patch) {
  const out = {};
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in DEFAULTS)) continue;
    if (k === "enabled") { out.enabled = !!v; continue; }
    if (k === "pack") { if (typeof v === "string" && v.trim()) out.pack = v; continue; }
    if (NUMERIC_KEYS.includes(k)) {
      const n = Number(v);
      if (Number.isFinite(n)) out[k] = n;
    }
  }
  return out;
}

function createSettingsStore(filePath) {
  let state = { ...DEFAULTS };
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
    state = { ...DEFAULTS, ...sanitize(raw) };
  } catch (_) {
    state = { ...DEFAULTS };
  }
  function persist() {
    fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf8");
  }
  return {
    getAll: () => ({ ...state }),
    get: (key) => state[key],
    set: (patch) => {
      state = { ...state, ...sanitize(patch) };
      persist();
      return { ...state };
    },
  };
}

module.exports = { createSettingsStore, DEFAULTS };
```

注: テストは ESM import、実装は CommonJS。Vitest は CJS を default import 互換で読めるが、確実にするため import は名前付きで受ける。失敗する場合は `vitest.config.js` の `test.deps.interopDefault: true` を追加。

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test -- tests/settings-store.test.js`
Expected: PASS（3件）。

- [ ] **Step 5: コミット**

```bash
git add src/main/settings-store.js tests/settings-store.test.js
git commit -m "feat: 設定ストア(JSON永続化)を追加"
```

---

## Task 4: アセットパス解決（asset-path.js）

`content.js` のパック候補解決ロジックを純粋関数として抽出する（拡張機能版は保存パックに世代が欠けた場合に補完していた。同じ挙動を保つ）。

**Files:**
- Create: `src/main/asset-path.js`
- Test: `tests/asset-path.test.js`

- [ ] **Step 1: 失敗するテストを書く**

```js
import { describe, it, expect } from "vitest";
import { dexFromSlug, generationForDex, packSlug, buildPackCandidates } from "../src/main/asset-path.js";

describe("asset-path", () => {
  it("slugからdex番号を取り出す", () => {
    expect(dexFromSlug("009-blastoise")).toBe(9);
    expect(dexFromSlug("025-pikachu")).toBe(25);
    expect(dexFromSlug("bad")).toBe(null);
  });

  it("dexから世代を判定する", () => {
    expect(generationForDex(9)).toBe("gen-1");
    expect(generationForDex(152)).toBe("gen-2");
    expect(generationForDex(400)).toBe("gen-4");
  });

  it("packKeyからslugを取り出す", () => {
    expect(packSlug("retro/gen-1/009-blastoise")).toBe("009-blastoise");
  });

  it("世代付きキーはそのまま候補先頭になる", () => {
    expect(buildPackCandidates("retro/gen-1/009-blastoise")[0]).toBe("retro/gen-1/009-blastoise");
  });

  it("世代が無いキーは推定世代を補完する", () => {
    const cands = buildPackCandidates("retro/025-pikachu");
    expect(cands).toContain("retro/gen-1/025-pikachu");
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test -- tests/asset-path.test.js`
Expected: FAIL（モジュール未定義）。

- [ ] **Step 3: 実装する（`content.js` 2〜3, 204〜246行から移植）**

```js
const DEFAULT_PACK = "retro/gen-1/009-blastoise";
const GENERATION_DIRS = ["gen-1","gen-2","gen-3","gen-4","gen-5","gen-6","gen-7","gen-8","gen-9"];

function packSlug(packKey) {
  const parts = String(packKey || "").split("/");
  return parts[parts.length - 1];
}

function dexFromSlug(slug) {
  const dex = parseInt((slug || "").split("-")[0], 10);
  return Number.isFinite(dex) ? dex : null;
}

function generationForDex(dex) {
  if (!Number.isFinite(dex)) return null;
  if (dex >= 1 && dex <= 151) return "gen-1";
  if (dex <= 251) return "gen-2";
  if (dex <= 386) return "gen-3";
  if (dex <= 493) return "gen-4";
  if (dex <= 649) return "gen-5";
  if (dex <= 721) return "gen-6";
  if (dex <= 809) return "gen-7";
  if (dex <= 905) return "gen-8";
  return "gen-9";
}

function buildPackCandidates(packKey) {
  const clean = typeof packKey === "string" ? packKey.trim().replace(/^\/+|\/+$/g, "") : "";
  if (!clean) return [DEFAULT_PACK];
  const candidates = [clean];
  if (!clean.includes("/gen-")) {
    const parts = clean.split("/");
    const slug = parts.pop();
    const prefix = parts.join("/");
    const dex = dexFromSlug(slug);
    const inferred = generationForDex(dex);
    const pushCandidate = (gen) => {
      const candidate = `${prefix}/${gen}/${slug}`;
      if (!candidates.includes(candidate)) candidates.push(candidate);
    };
    if (inferred) pushCandidate(inferred);
    GENERATION_DIRS.forEach(pushCandidate);
  }
  return candidates;
}

module.exports = { DEFAULT_PACK, GENERATION_DIRS, packSlug, dexFromSlug, generationForDex, buildPackCandidates };
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test -- tests/asset-path.test.js`
Expected: PASS（5件）。

- [ ] **Step 5: コミット**

```bash
git add src/main/asset-path.js tests/asset-path.test.js
git commit -m "feat: パックパス解決ロジックを純粋関数として抽出"
```

---

## Task 5: カーソル座標マッピング（cursor-mapping.js）

screen座標（`getCursorScreenPoint`）を、オーバーレイ窓のローカル座標へ変換する純粋関数。
オーバーレイはプライマリ作業領域を覆うので、窓の原点（bounds.x/y）を引くだけ。

**Files:**
- Create: `src/main/cursor-mapping.js`
- Test: `tests/cursor-mapping.test.js`

- [ ] **Step 1: 失敗するテストを書く**

```js
import { describe, it, expect } from "vitest";
import { screenPointToOverlay } from "../src/main/cursor-mapping.js";

describe("cursor-mapping", () => {
  it("原点0,0のディスプレイではそのまま", () => {
    expect(screenPointToOverlay({ x: 100, y: 200 }, { x: 0, y: 0 })).toEqual({ x: 100, y: 200 });
  });

  it("オフセットのあるディスプレイでは原点を引く", () => {
    expect(screenPointToOverlay({ x: 1920, y: 50 }, { x: 1920, y: 0 })).toEqual({ x: 0, y: 50 });
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test -- tests/cursor-mapping.test.js`
Expected: FAIL（未定義）。

- [ ] **Step 3: 実装する**

```js
function screenPointToOverlay(point, bounds) {
  return { x: point.x - bounds.x, y: point.y - bounds.y };
}

module.exports = { screenPointToOverlay };
```

- [ ] **Step 4: テストが通ることを確認**

Run: `npm test -- tests/cursor-mapping.test.js`
Expected: PASS（2件）。

- [ ] **Step 5: コミット**

```bash
git add src/main/cursor-mapping.js tests/cursor-mapping.test.js
git commit -m "feat: カーソル座標マッピングを追加"
```

---

## Task 6: app://プロトコル登録 + オーバーレイ窓表示

透明・枠なし・全画面・最前面・クリック透過のオーバーレイ窓を出す。アセットは`app://`で解決。
この段階では「透明窓が出てクリック透過する」ことだけ確認する（描画は次タスク）。

**Files:**
- Modify: `src/main/main.js`（全面置換）
- Create: `src/main/pack-reader.js`
- Create: `src/overlay/overlay.html`
- Create: `src/overlay/overlay-preload.js`

- [ ] **Step 1: `src/main/pack-reader.js` を作成**

```js
const fs = require("node:fs");
const path = require("node:path");
const { buildPackCandidates } = require("./asset-path.js");

// ROOT = プロジェクトルート（assets/ の親）
function makePackReader(root) {
  function readPackMeta(packKey) {
    const candidates = buildPackCandidates(packKey);
    for (const cand of candidates) {
      const file = path.join(root, "assets", "packs", `${cand}.json`);
      try {
        const meta = JSON.parse(fs.readFileSync(file, "utf8"));
        if (meta && meta.states && meta.states.idle && meta.states.walk) {
          return { resolvedKey: cand, meta };
        }
      } catch (_) { /* 次の候補へ */ }
    }
    throw new Error(`pack not found for key: ${packKey}`);
  }
  function readIndex() {
    const file = path.join(root, "assets", "packs", "index.json");
    return JSON.parse(fs.readFileSync(file, "utf8"));
  }
  return { readPackMeta, readIndex };
}

module.exports = { makePackReader };
```

- [ ] **Step 2: `src/overlay/overlay.html` を作成**

```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: transparent; }
  </style>
</head>
<body>
  <script src="overlay.js"></script>
</body>
</html>
```

- [ ] **Step 3: `src/overlay/overlay-preload.js` を作成**

```js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pokeapi", {
  onCursor: (cb) => ipcRenderer.on("cursor", (_e, p) => cb(p)),
  onConfig: (cb) => ipcRenderer.on("config", (_e, patch) => cb(patch)),
  onPack: (cb) => ipcRenderer.on("pack", (_e, key) => cb(key)),
  onEnabled: (cb) => ipcRenderer.on("enabled", (_e, on) => cb(on)),
  loadPack: (key) => ipcRenderer.invoke("overlay:loadPack", key),
});
```

- [ ] **Step 4: `src/main/main.js` を全面置換**

```js
const { app, BrowserWindow, protocol, net, screen, ipcMain } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { makePackReader } = require("./pack-reader.js");

const ROOT = path.join(__dirname, "..", ".."); // assets/ の親（プロジェクトルート）
const packReader = makePackReader(ROOT);

let overlayWin = null;

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

function registerAppProtocol() {
  protocol.handle("app", (request) => {
    const url = new URL(request.url);             // app://bundle/assets/...
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const filePath = path.join(ROOT, rel);
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function createOverlay() {
  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.workArea;
  overlayWin = new BrowserWindow({
    x, y, width, height,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, "..", "overlay", "overlay-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  overlayWin.setIgnoreMouseEvents(true, { forward: true });
  overlayWin.setAlwaysOnTop(true, "screen-saver");
  overlayWin.loadFile(path.join(__dirname, "..", "overlay", "overlay.html"));
  return overlayWin;
}

ipcMain.handle("overlay:loadPack", (_e, key) => packReader.readPackMeta(key));

app.whenReady().then(() => {
  registerAppProtocol();
  createOverlay();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
```

- [ ] **Step 5: 透明窓とクリック透過を手動確認**

まず確認用に、`src/overlay/overlay.html` の `<body>` を一時的に
`<body><div style="position:fixed;top:40px;left:40px;width:80px;height:80px;background:red"></div><script src="overlay.js"></script></body>`
に変更してから:

Run: `npm start`
Expected:
- 画面左上付近に赤い四角だけが浮かび、周囲は完全に透明（デスクトップが見える）。
- 赤い四角や周囲をクリックしても、**下のアプリ（デスクトップ/他ウィンドウ）が反応する**＝クリック透過OK。
確認できたら `<body>` を Step 2 の状態（赤い四角なし）に戻す。

- [ ] **Step 6: コミット**

```bash
git add src/main/main.js src/main/pack-reader.js src/overlay/overlay.html src/overlay/overlay-preload.js
git commit -m "feat: app://プロトコルと透明クリック透過オーバーレイ窓を追加"
```

---

## Task 7: カーソルポーリング（cursor-tracker.js）→ IPC配線

mainで60fpsポーリングし、`cursor-mapping` で変換してオーバーレイへ送る。

**Files:**
- Create: `src/main/cursor-tracker.js`
- Modify: `src/main/main.js`

- [ ] **Step 1: `src/main/cursor-tracker.js` を作成**

```js
const { screen } = require("electron");
const { screenPointToOverlay } = require("./cursor-mapping.js");

// onPoint(localPoint) を約60fpsで呼ぶ。停止関数を返す。
function startCursorTracker(getOverlayBounds, onPoint) {
  const timer = setInterval(() => {
    const bounds = getOverlayBounds();
    if (!bounds) return;
    const screenPt = screen.getCursorScreenPoint();
    onPoint(screenPointToOverlay(screenPt, bounds));
  }, 16);
  return () => clearInterval(timer);
}

module.exports = { startCursorTracker };
```

- [ ] **Step 2: `main.js` でトラッカーを起動（`app.whenReady` 内、`createOverlay()` の後に追加）**

```js
const { startCursorTracker } = require("./cursor-tracker.js");
// ...
app.whenReady().then(() => {
  registerAppProtocol();
  createOverlay();

  startCursorTracker(
    () => (overlayWin ? overlayWin.getBounds() : null),
    (localPoint) => {
      if (overlayWin && !overlayWin.isDestroyed()) {
        overlayWin.webContents.send("cursor", localPoint);
      }
    }
  );
});
```

- [ ] **Step 3: 配線を手動確認**

`src/overlay/overlay.js` をまだ作っていないので、一時的に次の内容で作成:
```js
window.pokeapi.onCursor((p) => { document.title = `${Math.round(p.x)},${Math.round(p.y)}`; });
```
Run: `npm start`、その後 DevTools を使わずに確認するため、上記を
`document.body.innerHTML = '<div style="position:fixed;color:red;font:20px monospace">'+Math.round(p.x)+','+Math.round(p.y)+'</div>'`
に変えて再実行。
Expected: マウスを動かすと画面左上付近に座標が出て、カーソル移動に追随して数値が変わる。確認後この一時 `overlay.js` は次タスクで上書きする。

- [ ] **Step 4: コミット**

```bash
git add src/main/cursor-tracker.js src/main/main.js src/overlay/overlay.js
git commit -m "feat: カーソル60fpsポーリングとIPC配線を追加"
```

---

## Task 8: 追従ポケモンの描画（overlay.js 移植）

`content.js` の描画・アニメ・追従ロジックを移植する。差し替えは3点のみ:
(A) `extUrl` を `app://` 化、(B) 入力を `mousemove` から IPC の `onCursor` へ、(C) `chrome.storage`/`chrome.runtime` 依存を IPC（`loadPack`/`onConfig`/`onPack`/`onEnabled`）へ。

**Files:**
- Create/Overwrite: `src/overlay/overlay.js`

- [ ] **Step 1: `_inspect_pokefollower/src/content.js` を `src/overlay/overlay.js` へコピー**

Run（PowerShell）:
```powershell
Copy-Item "C:\Users\nekop\Desktop\Development\_inspect_pokefollower\src\content.js" ".\src\overlay\overlay.js" -Force
```

- [ ] **Step 2: (A) アセット参照を `app://` 化**

`overlay.js` の `extUrl`（元175行）を置換:
```js
// 置換前: function extUrl(rel) { return chrome.runtime.getURL(rel); }
function extUrl(rel) { return "app://bundle/" + String(rel).replace(/^\/+/, ""); }
```

- [ ] **Step 3: (B) カーソル入力を IPC 化**

`onMouseMove(e)`（元418〜436行）を、座標を引数で受ける `updateCursor(x, y)` に置換する:
```js
function updateCursor(x, y) {
  const now = performance.now();
  const dt = Math.max(1, now - (RUNTIME.lastMouse.t || now)); // ms
  const vx = (x - RUNTIME.lastMouse.x) * (1000 / dt);
  const vy = (y - RUNTIME.lastMouse.y) * (1000 / dt);
  const SMOOTH = 0.2;
  RUNTIME.velAvg.x = RUNTIME.velAvg.x * (1 - SMOOTH) + vx * SMOOTH;
  RUNTIME.velAvg.y = RUNTIME.velAvg.y * (1 - SMOOTH) + vy * SMOOTH;
  RUNTIME.speedAvg = Math.hypot(RUNTIME.velAvg.x, RUNTIME.velAvg.y);
  RUNTIME.lastMouse.x = x;
  RUNTIME.lastMouse.y = y;
  RUNTIME.lastMouse.t = now;
  RUNTIME.lastMoveTs = now;
}
```
`start()`（元449行）と `stop()`（元456行）の `window.addEventListener/removeEventListener("mousemove", onMouseMove, ...)` を削除する。`teardownInvalidatedContext`（元396行）の `mousemove` 除去行も削除。代わりにファイル末尾（後述 Step 6）で `pokeapi.onCursor` を購読する。

- [ ] **Step 4: (C) パック読込を IPC 化**

`fetchPackMeta`（元248〜261行）と `loadPack` 内の候補ループ（元460〜495行）を、main の `loadPack` invoke に置換:
```js
async function loadPack(packKey) {
  let result;
  try {
    result = await window.pokeapi.loadPack(packKey); // { resolvedKey, meta }
  } catch (err) {
    throw err;
  }
  STATE.pack = result.resolvedKey;
  RUNTIME.meta = result.meta;
  resetAnimationForNewPack();
  await ensureImagesLoaded(RUNTIME.meta);
  if (followerEl) removeFollower();
  if (running) { createFollower(); loop(); }
}
```
`buildPackCandidates` / `dexFromSlug` / `generationForDex` / `fetchPackMeta` / `GENERATION_DIRS` は overlay 側では不要になるので削除（解決は main が担う）。`packSlug` は `sheetUrlFor` がフォールバックで使うので残す。

- [ ] **Step 5: (C) 拡張機能ブート/リスナを IPC 化**

ファイル末尾の `chrome.storage.sync.get(...)` ブート（元502〜517行）、`chrome.storage.onChanged`（元520〜549行）、`chrome.runtime.onMessage`（元552〜571行）、`isExtensionContextValid`/`teardownInvalidatedContext` の chrome 依存（元167〜173, 405〜408行）をすべて削除する。`loop()` 内の `isExtensionContextValid()` チェック（元405〜408行）も削除し、`step` は常に継続する。

- [ ] **Step 6: ブート処理を IPC 版で追記（ファイル末尾）**

```js
// --- デスクトップ版ブート ---
window.pokeapi.onCursor(({ x, y }) => updateCursor(x, y));
window.pokeapi.onConfig((patch) => {
  applyConfigPatch(patch);
  if (followerEl && RUNTIME.meta) applyFrame();
});
window.pokeapi.onPack(async (key) => {
  const prev = STATE.pack;
  try { await loadPack(key); if (followerEl) applyFrame(); }
  catch (_) { STATE.pack = prev; }
});
window.pokeapi.onEnabled((on) => {
  STATE.enabled = !!on;
  applyState();
});
```

注: `STATE.enabled` の初期値・初期パック・初期 CONFIG は Task 11 で main から起動直後に push する。この段階のスモーク確認用に、暫定で末尾に次を足してよい（Task 11 で削除）:
```js
(async () => { STATE.enabled = true; await loadPack(STATE.pack); applyState(); })();
```

- [ ] **Step 7: 追従描画を手動確認**

Run: `npm start`
Expected: デフォルトのポケモン（ブラストイズ）が出て、**カーソルを動かすと追従**し、止まると待機アニメ、移動中は歩きアニメ、進行方向に応じて向きが変わる。クリックは下に透過する。

- [ ] **Step 8: コミット**

```bash
git add src/overlay/overlay.js
git commit -m "feat: 追従ポケモンの描画ロジックをデスクトップ版へ移植"
```

---

## Task 9: 設定窓（settings.html / settings.js 移植）

`popup` を別ウィンドウとして移植。`chrome.*` を `settingsApi`（IPC）に差し替える。

**Files:**
- Create: `src/settings/settings.html`（`popup/index.html` から移植）
- Create: `src/settings/settings.js`（`popup.js` から移植）
- Create: `src/settings/settings-preload.js`
- Modify: `src/main/main.js`

- [ ] **Step 1: HTML/JS をコピー**

Run（PowerShell）:
```powershell
Copy-Item "C:\Users\nekop\Desktop\Development\_inspect_pokefollower\src\popup\index.html" ".\src\settings\settings.html" -Force
Copy-Item "C:\Users\nekop\Desktop\Development\_inspect_pokefollower\src\popup\popup.js" ".\src\settings\settings.js" -Force
```

- [ ] **Step 2: `settings.html` のアセットパスとscript参照を修正**

- `<img id="previewSprite" src="../assets/ui/gen-1/009-blastoise.png" ...>` → `src="app://bundle/assets/ui/gen-1/009-blastoise.png"`
- `<img src="../assets/ui/buttons/magnifying-glass.png" ...>` → `src="app://bundle/assets/ui/buttons/magnifying-glass.png"`
- `<img class="shuffleIcon" src="../assets/ui/buttons/shuffle-icon.png" ...>` → `src="app://bundle/assets/ui/buttons/shuffle-icon.png"`
- `<script src="popup.js"></script>` → `<script src="settings.js"></script>`

- [ ] **Step 3: `src/settings/settings-preload.js` を作成**

```js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("settingsApi", {
  getSettings: () => ipcRenderer.invoke("settings:get"),
  setSettings: (patch) => ipcRenderer.send("settings:set", patch),
  listPacks: () => ipcRenderer.invoke("packs:list"),
});
```

- [ ] **Step 4: `settings.js` の chrome 依存を差し替え**

`popup.js` は `chrome.storage.sync.get/set`・`chrome.storage.local.set`・`chrome.runtime.sendMessage`・`chrome.runtime.getURL` を使う。次のとおり置換する:

(a) 設定の初期読込（元144〜177行 `chrome.storage.sync.get([...], (res) => {...})`）を、先頭を await 化:
```js
// document.addEventListener("DOMContentLoaded", () => { ... }) を async に
document.addEventListener("DOMContentLoaded", async () => {
  // ...DOM取得は既存のまま...
  const res = await window.settingsApi.getSettings();
  // 以降、コールバック内の本体（enabledEl.checked = ... 〜 setPreviewForPack まで）をそのまま実行
```
`res` のキーは `vcp1_*` ではなく `enabled/pack/scale/offset/lerp`。読み出しを次の対応で書き換える:
- `res.vcp1_enabled` → `res.enabled`
- `res.vcp1_pack` → `res.pack`
- `res.vcp1_scale` → `res.scale`、`res.vcp1_offset` → `res.offset`、`res.vcp1_lerp` → `res.lerp`

(b) 保存系を置換:
```js
// const save = (obj) => chrome.storage.sync.set(obj);
const save = (obj) => window.settingsApi.setSettings(mapKeys(obj));
// const setLocal = (patch) => chrome.storage.local.set(patch);
const setLocal = (patch) => window.settingsApi.setSettings(mapKeys(patch));
```
キー名変換ヘルパを `settings.js` 冒頭に追加:
```js
function mapKeys(obj) {
  const m = { vcp1_enabled: "enabled", vcp1_pack: "pack", vcp1_scale: "scale", vcp1_offset: "offset", vcp1_lerp: "lerp" };
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[m[k] || k] = v;
  return out;
}
```

(c) `pushConfig`（元118〜139行）のライブ反映と保存を一本化:
```js
function pushConfig(patch, { flush = false } = {}) {
  window.settingsApi.setSettings(mapKeys(patch)); // main が永続化＋オーバーレイへ即時反映
}
```
（拡張機能版の sync レート制限対策のデバウンスは不要。`pending/saveTimer` 関連は削除可。）

(d) `enabledEl` のトグル（元183〜186行）の `window.close()` は残してよい（設定窓を閉じる）。`save({ vcp1_enabled: enabledEl.checked })` はそのまま（`save` 内で変換される）。

(e) パック一覧の取得（元57〜86行 `populatePacksFromIndex`）の `fetch(chrome.runtime.getURL('assets/packs/index.json'))` を置換:
```js
const data = await window.settingsApi.listPacks();
```
（残りの `data.retro` を回す処理は既存のまま。）

(f) プレビュー画像URL（元262〜317行 `setPreviewForPack`）の `chrome.runtime.getURL(...)` を `"app://bundle/" + ...` に置換（3箇所の `chrome.runtime.getURL(`...`)` を文字列連結に）。

- [ ] **Step 5: main に設定窓・IPC・トレイ無し版の配線を追加**

`src/main/main.js` に追記:
```js
const { createSettingsStore } = require("./settings-store.js");

let settingsStore = null;
let settingsWin = null;

function getSettingsWin() {
  if (settingsWin && !settingsWin.isDestroyed()) { settingsWin.focus(); return settingsWin; }
  settingsWin = new BrowserWindow({
    width: 400, height: 560, resizable: false, title: "PokéFollower 設定",
    webPreferences: {
      preload: path.join(__dirname, "..", "settings", "settings-preload.js"),
      contextIsolation: true, nodeIntegration: false,
    },
  });
  settingsWin.setMenuBarVisibility(false);
  settingsWin.loadFile(path.join(__dirname, "..", "settings", "settings.html"));
  return settingsWin;
}

// app.whenReady 内、createOverlay の前で初期化:
//   settingsStore = createSettingsStore(path.join(app.getPath("userData"), "settings.json"));

ipcMain.handle("settings:get", () => settingsStore.getAll());
ipcMain.handle("packs:list", () => packReader.readIndex());
ipcMain.on("settings:set", (_e, patch) => {
  const next = settingsStore.set(patch);
  if (overlayWin && !overlayWin.isDestroyed()) {
    if ("scale" in patch || "offset" in patch || "lerp" in patch) {
      overlayWin.webContents.send("config", {
        vcp1_scale: next.scale, vcp1_offset: next.offset, vcp1_lerp: next.lerp,
      });
    }
    if ("pack" in patch) overlayWin.webContents.send("pack", next.pack);
    if ("enabled" in patch) overlayWin.webContents.send("enabled", next.enabled);
  }
});
```
注: `overlay.js` の `applyConfigPatch` は `vcp1_scale/vcp1_offset/vcp1_lerp` キーを期待する（元46〜50行）。そのため `config` 送信時はこのキー名にマッピングする（上記のとおり）。

`app.whenReady` の冒頭で `settingsStore` を初期化する1行を追加すること。

- [ ] **Step 6: 動作確認（設定窓を一時的に起動時に開く）**

`app.whenReady` 内に一時的に `getSettingsWin();` を追加して:
Run: `npm start`
Expected: 設定窓が開き、ポケモン一覧が出る。別のポケモンを選ぶ／SCALE・DISTANCE・SPEEDを変えると、**オーバーレイのポケモンが即座に切替・変化**する。確認後この一時行は削除（トレイから開くため）。

- [ ] **Step 7: コミット**

```bash
git add src/settings src/main/main.js
git commit -m "feat: 設定窓を移植しIPCで配線"
```

---

## Task 10: トレイ常駐

トレイアイコン（モンスターボール）＋メニュー（設定／有効・無効／終了）。

**Files:**
- Modify: `src/main/main.js`

- [ ] **Step 1: トレイ生成を main に追加**

```js
const { Tray, Menu, nativeImage } = require("electron");
let tray = null;

function buildTray() {
  const icon = nativeImage.createFromPath(path.join(ROOT, "assets", "icons", "pokeball-32.png"));
  tray = new Tray(icon);
  tray.setToolTip("PokéFollower");
  refreshTrayMenu();
  tray.on("double-click", () => getSettingsWin());
}

function refreshTrayMenu() {
  const enabled = settingsStore.get("enabled");
  const menu = Menu.buildFromTemplate([
    { label: "設定を開く", click: () => getSettingsWin() },
    { type: "separator" },
    {
      label: "有効", type: "checkbox", checked: enabled,
      click: (item) => {
        const next = settingsStore.set({ enabled: item.checked });
        if (overlayWin && !overlayWin.isDestroyed()) overlayWin.webContents.send("enabled", next.enabled);
        refreshTrayMenu();
      },
    },
    { type: "separator" },
    { label: "終了", click: () => { app.isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
}
```

- [ ] **Step 2: `app.whenReady` 内で `buildTray()` を呼ぶ（settingsStore 初期化後）**

- [ ] **Step 3: ウィンドウ全閉でも終了しないようにする（トレイ常駐）**

`window-all-closed` ハンドラを置換:
```js
app.on("window-all-closed", (e) => {
  // トレイ常駐のため終了しない（明示的な「終了」メニューでのみ quit）
});
```
注: オーバーレイは常時開いているため通常 all-closed は起きないが、設定窓を閉じた際に誤終了しないための保険。

- [ ] **Step 4: 手動確認**

Run: `npm start`
Expected: タスクトレイにモンスターボールが出る。右クリックメニューで「設定を開く」→設定窓が開く。「有効」チェックを外すとポケモンが消え、付けると出る。「終了」でアプリが完全終了。

- [ ] **Step 5: コミット**

```bash
git add src/main/main.js
git commit -m "feat: トレイ常駐(設定/有効無効/終了)を追加"
```

---

## Task 11: 起動時の初期状態反映（end-to-end配線）

起動直後にオーバーレイへ現在の設定（enabled/pack/config）を流し込み、保存値どおりに復元する。

**Files:**
- Modify: `src/main/main.js`
- Modify: `src/overlay/overlay.js`

- [ ] **Step 1: overlay 側の暫定ブートを削除**

Task 8 Step 6 で足した暫定行 `(async () => { STATE.enabled = true; ... })();` を削除する。代わりに、main からの初期 push（`init` イベント）を受ける処理を `overlay-preload.js` と `overlay.js` に追加。

`overlay-preload.js` に追加:
```js
  onInit: (cb) => ipcRenderer.on("init", (_e, s) => cb(s)),
```
`overlay.js` 末尾に追加:
```js
window.pokeapi.onInit(async (s) => {
  STATE.enabled = !!s.enabled;
  applyConfigPatch({ vcp1_scale: s.scale, vcp1_offset: s.offset, vcp1_lerp: s.lerp });
  try { await loadPack(s.pack); } catch (_) { await loadPack("retro/gen-1/009-blastoise"); }
  applyState();
});
```

- [ ] **Step 2: main からオーバーレイ ready 後に初期状態を送る**

`createOverlay()` 内の `loadFile` の後に:
```js
  overlayWin.webContents.on("did-finish-load", () => {
    overlayWin.webContents.send("init", settingsStore.getAll());
  });
```

- [ ] **Step 3: end-to-end 手動確認**

Run: `npm start`
- ポケモンを変更・SCALE等を変更・有効をオフ → アプリを「終了」
Run: `npm start`（再起動）
Expected: 前回の選択ポケモン・スケール・有効状態が**そのまま復元**される。

- [ ] **Step 4: コミット**

```bash
git add src/main/main.js src/overlay/overlay.js src/overlay/overlay-preload.js
git commit -m "feat: 起動時に保存設定を復元(end-to-end配線)"
```

---

## Task 12: Windowsインストーラのパッケージング

`electron-builder` で NSIS インストーラ（`.exe`）を生成する。

**Files:**
- Modify: `package.json`（build設定追加）

- [ ] **Step 1: `package.json` に `build` セクションを追加**

```json
  "build": {
    "appId": "com.naochan3.pokefollower",
    "productName": "PokeFollower",
    "directories": { "output": "release" },
    "files": ["src/**/*", "assets/**/*", "package.json"],
    "win": {
      "target": ["nsis"],
      "icon": "assets/icons/pokeball-128.png"
    },
    "nsis": {
      "oneClick": false,
      "perMachine": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true
    }
  }
```
注: `pokeball-128.png` がアイコン要件（256x256推奨）を満たさずビルドが警告/失敗する場合は、`assets/icons/` に 256x256 の `.ico` を用意し `win.icon` をそれに向ける。

- [ ] **Step 2: インストーラをビルド**

Run: `npm run dist`
Expected: `release/` に `PokeFollower Setup 1.0.0.exe` が生成される（エラーなし）。

- [ ] **Step 3: インストールと常駐を手動確認**

`release/PokeFollower Setup 1.0.0.exe` を実行 → インストール → 起動。
Expected: トレイ常駐し、カーソル追従が動く。設定変更・再起動後の復元・終了が、開発時(`npm start`)と同じく動作する（= `app://` とアセット同梱が packaged でも機能している）。

- [ ] **Step 4: コミット**

```bash
git add package.json
git commit -m "build: WindowsインストーラのNSIS設定を追加"
```

---

## Self-Review メモ

- **Spec §4 構成**: Task 6（オーバーレイ）/9（設定窓）/10（トレイ）/main全般でカバー。
- **Spec §5 再利用マップ**: Task 8（描画移植・extUrl/入力/storage差替）、Task 4（パス解決抽出）でカバー。
- **Spec §6 カーソル方式**: Task 5（マッピング）+ Task 7（ポーリング/IPC）でカバー。
- **Spec §7 永続化**: Task 3（ストア）+ Task 9/11（配線・復元）でカバー。
- **Spec §8 スコープ**: 1体・設定窓・トレイ・exe を Task で網羅。複数体/自動起動/マルチモニタは含めない（仕様どおり）。
- **Spec §9 制限**: プライマリ画面のみ（Task 6 で workArea 固定）、全画面で出ない（alwaysOnTop "screen-saver" は排他フルスクリーン上には乗らない＝仕様どおり許容）、DPIは screen座標とCSS pxがともにDIPで整合。
- **Spec §10 配布**: Task 12 でカバー。
- **型/名称整合**: `config` IPC は overlay の `applyConfigPatch` が要求する `vcp1_*` キーで送る点を Task 9 Step 5 と Task 11 で統一。設定ストアのキーは `enabled/pack/scale/offset/lerp` で全タスク一貫。

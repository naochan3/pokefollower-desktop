// 設定ウィンドウ（src/settings/*）を実 Electron の BrowserWindow で描画し、
// 「実際の操作」を網羅して検証する。
//
// verify-settings-ui.cjs は HTML/JS のソース文字列契約（ID の存在など）を見るだけで、
// ハンドラの結線ミス・状態遷移・数値換算の誤りは検出できない。ここはその穴を埋める。
//
// 構成は verify-notification-overlay-render.cjs と同じ self-re-exec パターン。
// 依存追加なし（同梱の electron をそのまま使う）。
//
// PF_UI_SHOTS_DIR を指定すると、各タブの PNG も書き出す（高解像度は PF_UI_SHOT_SCALE）。
// 高解像度化は「contentSize を N 倍 ＋ ロード後に setZoomFactor(N)」で行う。
// CSS px のビューポートは 420x760 のまま（＝実物と同じレイアウト）で devicePixelRatio だけ
// N 倍になる。--force-device-scale-factor は macOS では無視される（実測）ため使わない。

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const shotsDir = process.env.PF_UI_SHOTS_DIR || "";
const shotScale = Math.max(1, Number(process.env.PF_UI_SHOT_SCALE || "1") || 1);
const WINDOW_WIDTH = 420;
const WINDOW_HEIGHT = 760;

const HERO_PACK = "retro/gen-1/009-blastoise";
const PIKACHU = "retro/gen-1/025-pikachu";

function fail(message) {
  throw new Error(message);
}

function expectEqual(actual, expected, label) {
  if (actual !== expected) fail(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function expectDeepEqual(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) fail(`${label}: expected ${e}, got ${a}`);
}

function expectTrue(condition, label) {
  if (!condition) fail(label);
}

async function runElectronMain() {
  const { app, BrowserWindow, ipcMain, protocol, net } = require("electron");
  const { pathToFileURL } = require("node:url");
  const { resolveAppProtocolPath } = require("../src/main/app-protocol-path.js");
  const { makePackReader } = require("../src/main/pack-reader.js");

  // zoom レベルは userData に origin 単位で永続化される。既定の共有 userData を使うと
  // ここで設定した拡大率が他の Electron 実行（verify:notification や dev 起動）へ漏れる。
  // 実行ごとに捨てる userData を与えて隔離する。
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pf-settings-ui-render-"));
  app.setPath("userData", userDataDir);
  // ESC 検証でウィンドウを閉じるため、既定の「全窓が閉じたら quit」を止める。
  // これが無いと summary を出す前にプロセスが exit 0 で消える。
  app.on("window-all-closed", () => { /* 検証終了は app.quit() で明示する */ });
  app.on("will-quit", () => {
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); }
    catch (_) { /* 終了時のクリーンアップ失敗は無視 */ }
  });

  const packReader = makePackReader(root);
  const packs = packReader.readPackList();
  const packById = new Map(packs.map((p) => [p.id, p]));
  const formCount = packs.filter((p) => p.region).length;
  const normalCount = packs.length - formCount;
  const gen1FirePacks = packs.filter((p) => !p.region && p.num <= 151 && (p.types || []).includes("fire"));

  function baseSettings(overrides = {}) {
    return {
      enabled: true,
      pack: HERO_PACK,
      favoritePacks: [HERO_PACK],
      rotationEnabled: false,
      rotationIntervalMinutes: 15,
      scale: 1.25,
      offset: 70,
      lerp: 0.2,
      edgeRest: false,
      avoidCursor: true,
      avoidCursorStrength: "normal",
      personality: "standard",
      mode: "follow",
      appReactionsEnabled: false,
      notificationCompanionEnabled: false,
      workWatchEnabled: false,
      workWatchPreset: "25/5",
      nicknames: {},
      ...overrides,
    };
  }

  // ─── main プロセス側スタブ ───────────────────────────────────
  let settings = baseSettings();
  const patches = [];   // renderer が送った settings:set patch（契約の検証対象）
  const calls = [];     // invoke されたチャンネル名（ボタンの結線検証用）

  const record = (channel) => calls.push(channel);

  ipcMain.handle("settings:get", () => { record("settings:get"); return settings; });
  ipcMain.on("settings:set", (_event, patch) => {
    patches.push(patch);
    settings = { ...settings, ...patch };
  });
  ipcMain.handle("packs:list", () => packs);
  ipcMain.handle("packs:search-metadata", () => packReader.readSearchMetadata());
  ipcMain.handle("packs:meta", (_event, packKey) => {
    try { return packReader.readPackMeta(packKey); }
    catch (_) { return null; }
  });
  ipcMain.handle("nickname:set", (_event, payload) => {
    record("nickname:set");
    const nicknames = { ...settings.nicknames };
    if (payload && typeof payload.name === "string" && payload.name.trim()) nicknames[payload.packKey] = payload.name.trim();
    else if (payload) delete nicknames[payload.packKey];
    settings = { ...settings, nicknames };
    return settings;
  });
  ipcMain.handle("party:set-lead", (_event, packKey) => {
    record("party:set-lead");
    const rest = (settings.favoritePacks || []).filter((id) => id !== packKey);
    settings = { ...settings, pack: packKey, favoritePacks: [packKey, ...rest] };
    return settings;
  });
  ipcMain.handle("update:get-version", () => { record("update:get-version"); return "1.4.1"; });
  ipcMain.handle("update:check", () => { record("update:check"); return { status: "up-to-date" }; });
  ipcMain.handle("companion:test-notification", () => { record("companion:test-notification"); return true; });
  ipcMain.handle("codex-pet:export-current", async (_event, packKey) => {
    record("codex-pet:export-current");
    await new Promise((resolve) => setTimeout(resolve, 30));
    return { displayName: packById.get(packKey)?.ja || packKey };
  });
  for (const channel of [
    "work-watch:start", "work-watch:stop", "work-watch:reset",
    "favorites:next", "favorites:add", "favorites:remove",
  ]) {
    ipcMain.handle(channel, () => { record(channel); return null; });
  }

  await app.whenReady();

  // タイル画像・スプライトは app://bundle/assets/... 経由。実 main.js と同じ解決器を使う。
  protocol.handle("app", (request) => {
    const filePath = resolveAppProtocolPath(root, request.url);
    if (!filePath) return new Response(null, { status: 403 });
    if (!fs.existsSync(filePath)) return new Response(null, { status: 404 });
    return net.fetch(pathToFileURL(filePath).toString());
  });

  const win = new BrowserWindow({
    width: WINDOW_WIDTH * shotScale,
    height: WINDOW_HEIGHT * shotScale,
    useContentSize: true,
    show: false,
    resizable: false,
    webPreferences: {
      preload: path.join(root, "src", "settings", "settings-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const consoleErrors = [];
  win.webContents.on("console-message", (event) => {
    if (event.level !== "error") return;
    const text = String(event.message || "");
    // タイル画像の候補フォールバック（img.onerror）は仕様上の 404 なので除外する。
    if (/ERR_FILE_NOT_FOUND|Failed to load resource/.test(text)) return;
    consoleErrors.push(text);
  });

  let windowClosed = false;
  win.on("closed", () => { windowClosed = true; });

  const evalPage = (js) => win.webContents.executeJavaScript(js, true);

  async function waitFor(js, label, timeoutMs = 20000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (await evalPage(js)) return;
      if (Date.now() > deadline) fail(`timeout waiting for ${label}`);
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  }

  async function settle(ms = 90) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  // シナリオごとに settings を差し替えて再読み込みする（40件の操作を1連鎖にしない）。
  async function load(overrides = {}) {
    settings = baseSettings(overrides);
    patches.length = 0;
    calls.length = 0;
    if (win.webContents.getURL()) win.reload();
    else await win.loadFile(path.join(root, "src", "settings", "settings.html"));
    if (shotScale !== 1) win.webContents.setZoomFactor(shotScale);
    await waitFor(`document.querySelectorAll("#grid .tile").length > 0`, "grid to build");
    await waitFor(`!!document.getElementById("heroName").textContent.trim()`, "hero to render");
    await settle();
  }

  const visibleIds = () => evalPage(`[...document.querySelectorAll("#grid .tile:not(.hidden)")].map((t) => t.dataset.id)`);
  const visibleCount = () => evalPage(`document.querySelectorAll("#grid .tile:not(.hidden)").length`);
  const partyIds = () => evalPage(`[...document.querySelectorAll("#partyRowAibou .party-slot:not(.empty)")].map((s) => s.dataset.id)`);

  async function setSearch(value) {
    await evalPage(`(() => {
      const el = document.getElementById("search");
      el.value = ${JSON.stringify(value)};
      el.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()`);
    await settle(60);
  }
  async function click(selector) {
    await evalPage(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) throw new Error("no element for " + ${JSON.stringify(selector)});
      el.click();
      return true;
    })()`);
    await settle();
  }
  async function selectValue(id, value) {
    await evalPage(`(() => {
      const el = document.getElementById(${JSON.stringify(id)});
      el.value = ${JSON.stringify(value)};
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()`);
    await settle();
  }
  async function commitNumber(id, value) {
    const before = patches.length;
    await evalPage(`(() => {
      const el = document.getElementById(${JSON.stringify(id)});
      el.value = ${JSON.stringify(String(value))};
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()`);
    for (let i = 0; i < 40 && patches.length === before; i += 1) await settle(25);
    if (patches.length === before) fail(`${id}: change did not emit a settings:set patch`);
    return patches[patches.length - 1];
  }

  const checks = [];
  const pass = (name) => { checks.push(name); console.log(`  ok  ${name}`); };
  const shot = async (name) => {
    if (!shotsDir) return;
    fs.mkdirSync(shotsDir, { recursive: true });
    fs.writeFileSync(path.join(shotsDir, `${name}.png`), (await win.capturePage()).toPNG());
  };

  // ══════════════ A. 初期表示 / タブ ══════════════
  await load();
  {
    const state = await evalPage(`(() => ({
      aibouHidden: document.getElementById("panel-aibou").hidden,
      boxHidden: document.getElementById("panel-box").hidden,
      settingsHidden: document.getElementById("panel-settings").hidden,
      selected: [...document.querySelectorAll("#tabs .tab")].filter((b) => b.getAttribute("aria-selected") === "true").map((b) => b.dataset.tab),
      tablist: document.getElementById("tabs").getAttribute("role"),
      grid: document.getElementById("grid").getAttribute("role"),
    }))()`);
    expectEqual(state.aibouHidden, false, "A1 初期表示: あいぼうパネルが可視");
    expectEqual(state.boxHidden, true, "A1 初期表示: ボックスパネルが非表示");
    expectEqual(state.settingsHidden, true, "A1 初期表示: せっていパネルが非表示");
    expectEqual(state.selected.join(","), "aibou", "A1 初期表示: aria-selected はあいぼうのみ");
    expectEqual(state.tablist, "tablist", "A1 a11y: タブ群が role=tablist");
    expectEqual(state.grid, "listbox", "A1 a11y: グリッドが role=listbox");
    pass("A1 初期タブ状態 + a11y role");
  }
  await shot("01-aibou");

  for (const [tab, panel] of [["box", "panel-box"], ["settings", "panel-settings"], ["aibou", "panel-aibou"]]) {
    await click(`#tabs .tab[data-tab="${tab}"]`);
    const state = await evalPage(`(() => ({
      visible: [...document.querySelectorAll("#panel-aibou,#panel-box,#panel-settings")].filter((p) => !p.hidden).map((p) => p.id),
      selected: [...document.querySelectorAll("#tabs .tab[aria-selected=true]")].map((b) => b.dataset.tab),
      active: [...document.querySelectorAll("#tabs .tab.active")].map((b) => b.dataset.tab),
    }))()`);
    expectDeepEqual(state.visible, [panel], `A2 タブ切替 ${tab}: 該当パネルだけ可視`);
    expectDeepEqual(state.selected, [tab], `A2 タブ切替 ${tab}: aria-selected が移動`);
    expectDeepEqual(state.active, [tab], `A2 タブ切替 ${tab}: active クラスが移動`);
  }
  pass("A2 タブ切替 3方向（可視パネル/aria/active の一致）");

  // ══════════════ B. ボックス: グリッドと検索 ══════════════
  await click(`#tabs .tab[data-tab="box"]`);
  {
    const grid = await evalPage(`(() => {
      const tiles = [...document.querySelectorAll("#grid .tile")];
      return {
        total: tiles.length,
        withSearch: tiles.filter((t) => (t.dataset.search || "").length > 0).length,
        withGen: tiles.filter((t) => t.dataset.gen && t.dataset.gen !== "0").length,
        withTypes: tiles.filter((t) => (t.dataset.types || "").length > 0).length,
        forms: tiles.filter((t) => t.dataset.region).length,
        lazyImgs: tiles.filter((t) => t.querySelector("img")?.loading === "lazy").length,
      };
    })()`);
    expectEqual(grid.total, packs.length, "B1 グリッド: 全パック分のタイルが生成される");
    expectEqual(grid.forms, formCount, "B1 グリッド: 地方フォルムのタイル数");
    expectEqual(grid.withSearch, packs.length, "B1 グリッド: 全タイルに検索テキストが載る");
    expectEqual(grid.lazyImgs, packs.length, "B1 グリッド: 画像が lazy loading（1010枚を即時読みしない）");
    expectTrue(grid.withGen >= normalCount, "B1 グリッド: 通常パックに世代が載る");
    expectTrue(grid.withTypes > normalCount * 0.9, "B1 グリッド: ほぼ全タイルにタイプが載る");
    // 初期描画でも applyFilter() が走ること。ここが抜けると kind="通常" のまま
    // 地方フォルムが出たままになり、検索欄に触れた瞬間に 54 件消える（回帰防止）。
    expectEqual(await visibleCount(), normalCount, "B2 初期フィルタ: kind=normal では通常パックのみ可視");
    pass(`B1/B2 グリッド ${grid.total}件（初期可視 ${normalCount} / フォルム ${formCount}）+ lazy img`);
  }

  {
    const queries = [
      ["ピカチュウ", "カナ", true],
      ["ぴかちゅう", "ひらがな", true],
      ["025", "図鑑番号", true],
      ["#025", "図鑑番号(#付き)", true],
      ["pikachu", "ローマ字", true],
      ["Pikachu", "英名(大文字混在)", true],
    ];
    for (const [q, label, mustIncludePikachu] of queries) {
      await setSearch(q);
      const ids = await visibleIds();
      expectTrue(ids.length > 0, `B3 検索[${label}] "${q}": 結果が0件でない`);
      if (mustIncludePikachu) {
        expectTrue(
          ids.some((id) => id === PIKACHU),
          `B3 検索[${label}] "${q}": ピカチュウが出る (got ${JSON.stringify(ids.slice(0, 6))})`,
        );
      }
    }
    // タイプ名検索（メタデータ facet 経由）
    await setSearch("でんき");
    const electric = await visibleIds();
    expectTrue(electric.length > 0, "B4 検索: タイプ名「でんき」で結果が出る");
    const nonElectric = electric.filter((id) => !(packById.get(id)?.types || []).includes("electric"));
    expectEqual(nonElectric.length, 0, `B4 検索: 「でんき」結果に非でんきが混ざらない (${JSON.stringify(nonElectric.slice(0, 5))})`);

    await setSearch("ぜったいにいないなまえ");
    expectEqual(await visibleCount(), 0, "B5 検索: ヒットしないクエリで 0 件");

    await setSearch("");
    expectEqual(await visibleCount(), normalCount, "B6 検索: 空文字で全件に戻る");
    pass(`B3-B6 検索 カナ/ひらがな/番号/#番号/ローマ字/英名/タイプ名(${electric.length}件)/0件/クリア`);
  }
  await shot("02-box");

  // ══════════════ C. フィルタ ══════════════
  {
    await click(`#genChips .gen-chip[data-gen="2"]`);
    const gen2 = await evalPage(`(() => {
      const visible = [...document.querySelectorAll("#grid .tile:not(.hidden)")];
      return {
        count: visible.length,
        offGen: visible.filter((t) => t.dataset.gen !== "2").map((t) => t.dataset.id),
        activeChips: [...document.querySelectorAll("#genChips .gen-chip.active")].map((c) => c.dataset.gen),
      };
    })()`);
    expectTrue(gen2.count > 0, "C1 世代フィルタ: 第2世代で結果が出る");
    expectEqual(gen2.offGen.length, 0, `C1 世代フィルタ: 第2世代以外が混ざらない (${JSON.stringify(gen2.offGen.slice(0, 5))})`);
    expectDeepEqual(gen2.activeChips, ["2"], "C1 世代フィルタ: active チップが1つだけ");
    await click(`#genChips .gen-chip[data-gen="all"]`);
    expectEqual(await visibleCount(), normalCount, "C2 世代フィルタ: 「全」で戻る");

    await click(`#typeChips .type-chip-filter[data-type="fire"]`);
    const fire = await evalPage(`(() => {
      const visible = [...document.querySelectorAll("#grid .tile:not(.hidden)")];
      const chip = document.querySelector('#typeChips .type-chip-filter[data-type="fire"]');
      return {
        count: visible.length,
        offType: visible.filter((t) => !(t.dataset.types || "").split(",").includes("fire")).map((t) => t.dataset.id),
        chipActive: chip.classList.contains("active"),
        chipBg: chip.style.backgroundColor,
      };
    })()`);
    expectTrue(fire.count > 0, "C3 タイプフィルタ: ほのおで結果が出る");
    expectEqual(fire.offType.length, 0, `C3 タイプフィルタ: ほのお以外が混ざらない (${JSON.stringify(fire.offType.slice(0, 5))})`);
    expectTrue(fire.chipActive, "C3 タイプフィルタ: チップが active になる");
    expectTrue(!!fire.chipBg, "C3 タイプフィルタ: active チップに背景色が付く");

    // 複合: 世代1 × ほのお（タイプ選択は維持されたまま世代を足す）
    await click(`#genChips .gen-chip[data-gen="1"]`);
    const combined = await visibleIds();
    expectDeepEqual(
      combined.slice().sort(),
      gen1FirePacks.map((p) => p.id).sort(),
      "C4 複合フィルタ: 世代1 × ほのお が pack-list 由来の期待集合と一致",
    );
    // さらに検索を重ねる
    await setSearch("リザードン");
    const triple = await visibleIds();
    expectEqual(triple.length, 1, `C5 複合フィルタ: 世代1 × ほのお × 検索 で1件 (${JSON.stringify(triple)})`);
    expectTrue(/006-charizard/.test(triple[0]), `C5 複合フィルタ: リザードンが残る (${triple[0]})`);
    await setSearch("");
    await click(`#typeChips .type-chip-filter[data-type="all"]`);
    await click(`#genChips .gen-chip[data-gen="all"]`);
    expectEqual(await visibleCount(), normalCount, "C6 複合フィルタ解除で全件に戻る");
    pass(`C1-C6 世代/タイプ/複合(世代1×ほのお=${gen1FirePacks.length}件)/三重/解除`);
  }

  {
    await selectValue("kind", "forms");
    const forms = await evalPage(`(() => {
      const visible = [...document.querySelectorAll("#grid .tile:not(.hidden)")];
      return {
        count: visible.length,
        nonForm: visible.filter((t) => !t.dataset.region).length,
        chipsLabel: document.getElementById("genChips").getAttribute("aria-label"),
        regionChips: [...document.querySelectorAll("#genChips .gen-chip")].map((c) => c.dataset.region).filter(Boolean),
      };
    })()`);
    expectEqual(forms.count, formCount, "C7 フォルム切替: 地方フォルムのみ可視");
    expectEqual(forms.nonForm, 0, "C7 フォルム切替: 通常パックが混ざらない");
    expectEqual(forms.chipsLabel, "地方フィルタ", "C7 フォルム切替: チップ群が地方フィルタへ入れ替わる");
    expectTrue(forms.regionChips.includes("all"), "C7 フォルム切替: 地方チップに「全」がある");
    expectTrue(forms.regionChips.length > 2, "C7 フォルム切替: 地方チップが生成される");

    // 地方チップが実際に絞り込むこと
    const region = forms.regionChips.find((r) => r !== "all");
    await click(`#genChips .gen-chip[data-region="${region}"]`);
    const regionIds = await visibleIds();
    const expectedRegion = packs.filter((p) => p.region === region).map((p) => p.id).sort();
    expectTrue(regionIds.length > 0, `C8 地方フィルタ: ${region} で結果が出る`);
    expectDeepEqual(regionIds.slice().sort(), expectedRegion, `C8 地方フィルタ: ${region} が pack-list と一致`);

    await selectValue("kind", "normal");
    const afterBack = await evalPage(`(() => ({
      count: document.querySelectorAll("#grid .tile:not(.hidden)").length,
      chipsLabel: document.getElementById("genChips").getAttribute("aria-label"),
      activeGen: [...document.querySelectorAll("#genChips .gen-chip.active")].map((c) => c.dataset.gen),
    }))()`);
    expectEqual(afterBack.count, normalCount, "C9 フォルム切替: 通常へ戻ると全通常パックが可視");
    expectEqual(afterBack.chipsLabel, "世代フィルタ", "C9 フォルム切替: チップ群が世代フィルタへ戻る");
    expectDeepEqual(afterBack.activeGen, ["all"], "C9 フォルム切替: 世代選択がリセットされる");
    pass(`C7-C9 通常⇄地方フォルム切替 + 地方フィルタ(${region})の実絞り込み + 選択リセット`);
  }

  // ══════════════ D. あいぼう: ヒーロー / あだ名 / スライダー ══════════════
  await load();
  {
    const hero = await evalPage(`(() => ({
      name: document.getElementById("heroName").textContent.trim(),
      num: document.getElementById("heroNum").textContent.trim(),
      typeChips: [...document.getElementById("heroTypes").children].map((c) => ({ text: c.textContent, bg: getComputedStyle(c).backgroundColor })),
      spriteImage: getComputedStyle(document.getElementById("heroSprite")).backgroundImage,
    }))()`);
    const heroPack = packById.get(HERO_PACK);
    expectEqual(hero.name, heroPack.ja, "D1 ヒーロー: 日本語名が出る");
    expectEqual(hero.num, "#009", "D1 ヒーロー: 図鑑番号が3桁ゼロ埋め");
    expectTrue(hero.typeChips.length > 0, "D1 ヒーロー: タイプチップが1つ以上");
    expectTrue(
      hero.typeChips.every((c) => c.bg && c.bg !== "rgba(0, 0, 0, 0)"),
      `D1 ヒーロー: タイプチップに色が付く (${JSON.stringify(hero.typeChips)})`,
    );
    expectTrue(
      /app:\/\/bundle\/assets\/raw\//.test(hero.spriteImage),
      `D1 ヒーロー: スプライトが app:// から読み込まれる (${hero.spriteImage})`,
    );
    pass(`D1 ヒーロー表示 ${hero.name} ${hero.num} / タイプ${hero.typeChips.length}件 / スプライト`);
  }

  {
    // あだ名: Enter で確定
    await click("#nicknameEdit");
    await evalPage(`(() => {
      const input = document.querySelector("#heroName input.nickname-input");
      if (!input) throw new Error("nickname input が出ない");
      input.value = "ボスガメ";
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      return true;
    })()`);
    await waitFor(`document.getElementById("heroName").textContent.trim() === "ボスガメ"`, "nickname commit");
    expectEqual(settings.nicknames[HERO_PACK], "ボスガメ", "D2 あだ名: Enter で main 側へ保存される");
    expectEqual(await evalPage(`!!document.querySelector("#heroName input")`), false, "D2 あだ名: 確定後は入力欄が閉じる");

    // あだ名: Escape で取消（値は変わらない）
    await click("#nicknameEdit");
    await evalPage(`(() => {
      const input = document.querySelector("#heroName input.nickname-input");
      input.value = "キャンセルされる名前";
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      return true;
    })()`);
    await settle(120);
    expectEqual(settings.nicknames[HERO_PACK], "ボスガメ", "D3 あだ名: Escape では保存されない");
    expectEqual(await evalPage(`document.getElementById("heroName").textContent.trim()`), "ボスガメ", "D3 あだ名: Escape で元の表示に戻る");

    // あだ名: blur で確定
    await click("#nicknameEdit");
    await evalPage(`(() => {
      const input = document.querySelector("#heroName input.nickname-input");
      input.value = "ブラーで確定";
      input.dispatchEvent(new Event("blur", { bubbles: false }));
      return true;
    })()`);
    await waitFor(`document.getElementById("heroName").textContent.trim() === "ブラーで確定"`, "nickname blur commit");
    expectEqual(settings.nicknames[HERO_PACK], "ブラーで確定", "D4 あだ名: blur で保存される");

    // あだ名: 空文字で解除
    await click("#nicknameEdit");
    await evalPage(`(() => {
      const input = document.querySelector("#heroName input.nickname-input");
      input.value = "   ";
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      return true;
    })()`);
    await waitFor(`document.getElementById("heroName").textContent.trim() === ${JSON.stringify(packById.get(HERO_PACK).ja)}`, "nickname clear");
    expectEqual(HERO_PACK in settings.nicknames, false, "D5 あだ名: 空文字で解除される");

    // maxlength
    expectEqual(
      await evalPage(`(() => { document.getElementById("nicknameEdit").click(); const i = document.querySelector("#heroName input.nickname-input"); const m = i.maxLength; i.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); return m; })()`),
      24,
      "D6 あだ名: maxlength=24",
    );
    pass("D2-D6 あだ名インライン編集 Enter/Escape/blur/空解除/maxlength");
  }

  {
    const lerpMax = await commitNumber("lerp", "10.0");
    expectEqual(lerpMax.lerp, 1, "D7 速さ: UI 10.0 → 内部 lerp 1.0");
    const lerpMin = await commitNumber("lerp", "0.5");
    expectEqual(lerpMin.lerp, 0.05, "D7 速さ: UI 0.5 → 内部 lerp 0.05");
    const lerpOver = await commitNumber("lerp", "99");
    expectEqual(lerpOver.lerp, 1, "D7 速さ: 上限超過は max(10.0) にクランプしてから換算");
    const lerpUnder = await commitNumber("lerp", "-3");
    expectEqual(lerpUnder.lerp, 0.05, "D7 速さ: 下限未満は min(0.5) にクランプしてから換算");
    const lerpReadout = await evalPage(`({ value: document.getElementById("lerp").value, readout: document.getElementById("lerpVal").textContent })`);
    expectEqual(lerpReadout.value, "0.5", "D7 速さ: クランプ後の入力値が正規化表示になる");
    expectEqual(lerpReadout.readout, "0.5", "D7 速さ: 読み上げ表示が正規化される");

    const scale = await commitNumber("scale", "2.5");
    expectEqual(scale.scale, 2.5, "D8 大きさ: 入力値がそのまま patch に載る");
    expectEqual((await commitNumber("scale", "999")).scale, 10, "D8 大きさ: 上限 10.0 にクランプ");
    expectEqual((await commitNumber("scale", "0")).scale, 0.5, "D8 大きさ: 下限 0.5 にクランプ");
    expectEqual((await commitNumber("scale", "1.234")).scale, 1.23, "D8 大きさ: 小数2桁へ丸め");

    expectEqual((await commitNumber("offset", "120")).offset, 120, "D9 距離: 入力値がそのまま patch に載る");
    expectEqual((await commitNumber("offset", "-5")).offset, 0, "D9 距離: 下限 0 にクランプ");
    expectEqual((await commitNumber("offset", "9999")).offset, 250, "D9 距離: 上限 250 にクランプ");
    expectEqual((await commitNumber("offset", "70.6")).offset, 71, "D9 距離: 小数は整数へ丸め");
    pass("D7-D9 スライダー換算とクランプ lerp/scale/offset");
  }
  await shot("03-aibou-slider");

  // ══════════════ E. 手持ち（party）操作 ══════════════
  {
    // 空の手持ちでボックスのタイルをタップ → 追加され相棒になる
    await load({ favoritePacks: [], pack: "" });
    await click(`#tabs .tab[data-tab="box"]`);
    await click(`#grid .tile[data-id="${PIKACHU}"]`);
    await settle(150);
    expectDeepEqual(settings.favoritePacks, [PIKACHU], "E1 追加: 空の手持ちにタイルが入る");
    expectEqual(settings.pack, PIKACHU, "E1 追加: 空だった場合は追加分が相棒になる");
    expectDeepEqual(await partyIds(), [PIKACHU], "E1 追加: 手持ち列に反映される");
    const marks = await evalPage(`(() => { const t = document.querySelector('#grid .tile[data-id="${PIKACHU}"]'); return { favorite: t.classList.contains("favorite"), selected: t.classList.contains("selected"), dataFavorite: t.dataset.favorite }; })()`);
    expectTrue(marks.favorite && marks.selected, `E1 追加: タイルに favorite/selected マークが付く (${JSON.stringify(marks)})`);
    expectEqual(marks.dataFavorite, "true", "E1 追加: data-favorite が true");
    pass("E1 空の手持ちへタイル追加 → 相棒化 + タイルマーカー");
  }

  {
    // 既に手持ちにいるタイルをタップ → 相棒（先頭）になる
    const second = packs.find((p) => !p.region && p.id !== HERO_PACK && p.id !== PIKACHU).id;
    await load({ favoritePacks: [HERO_PACK, second], pack: HERO_PACK });
    await click(`#tabs .tab[data-tab="box"]`);
    await click(`#grid .tile[data-id="${second}"]`);
    await settle(150);
    expectDeepEqual(settings.favoritePacks, [second, HERO_PACK], "E2 相棒化: タップしたパックが先頭へ来る");
    expectEqual(settings.pack, second, "E2 相棒化: pack も更新される");
    expectTrue(calls.includes("party:set-lead"), "E2 相棒化: party:set-lead が呼ばれる");
    pass("E2 手持ち内タイルのタップで相棒化（setLead IPC）");
  }

  {
    // × で外す（非先頭 / 先頭）
    const [a, b, c] = packs.filter((p) => !p.region).slice(0, 3).map((p) => p.id);
    await load({ favoritePacks: [a, b, c], pack: a });
    await click(`#partyRowAibou .party-slot[data-id="${b}"] .party-remove`);
    await settle(150);
    expectDeepEqual(settings.favoritePacks, [a, c], "E3 除去: 非先頭を × で外せる");
    expectEqual(settings.pack, a, "E3 除去: 非先頭を外しても相棒は変わらない");

    await click(`#partyRowAibou .party-slot[data-id="${a}"] .party-remove`);
    await settle(150);
    expectDeepEqual(settings.favoritePacks, [c], "E4 除去: 先頭を × で外せる");
    expectEqual(settings.pack, c, "E4 除去: 先頭を外すと次が相棒になる");
    pass("E3/E4 × による除去（非先頭 / 先頭→次が相棒）");
  }

  {
    // 満員(6) → 置き換えモード
    const six = packs.filter((p) => !p.region).slice(0, 6).map((p) => p.id);
    const extra = packs.filter((p) => !p.region && !six.includes(p.id))[0].id;
    await load({ favoritePacks: six, pack: six[0] });
    const filled = await evalPage(`document.querySelectorAll("#partyRowAibou .party-slot:not(.empty)").length`);
    expectEqual(filled, 6, "E5 満員: 手持ちスロットが6枠埋まる");
    expectEqual(await evalPage(`document.querySelectorAll("#partyRowAibou .party-slot.empty").length`), 0, "E5 満員: 空きスロットが無い");

    await click(`#tabs .tab[data-tab="box"]`);
    await click(`#grid .tile[data-id="${extra}"]`);
    await settle(150);
    const replaceState = await evalPage(`(() => ({
      replacing: document.getElementById("partyRowBox").classList.contains("replacing"),
      hint: document.querySelector(".replace-hint")?.textContent || "",
      hintHidden: document.querySelector(".replace-hint")?.hidden,
    }))()`);
    expectTrue(replaceState.replacing, "E6 置き換え: 満員でタイルをタップすると replacing になる");
    expectTrue(replaceState.hint.includes("入れ替える"), `E6 置き換え: ヒントが出る (${replaceState.hint})`);
    expectEqual(replaceState.hintHidden, false, "E6 置き換え: ヒントが可視");
    expectDeepEqual(settings.favoritePacks, six, "E6 置き換え: この時点では手持ちは変わらない");

    // 置換先の手持ちスロットをタップ
    await click(`#partyRowBox .party-slot[data-id="${six[2]}"]`);
    await settle(200);
    const expected = six.slice();
    expected[2] = extra;
    expectDeepEqual(settings.favoritePacks, expected, "E7 置き換え: 選んだスロットが差し替わる");
    expectEqual(settings.favoritePacks.length, 6, "E7 置き換え: PARTY_MAX=6 を超えない");
    expectEqual(
      await evalPage(`document.getElementById("partyRowBox").classList.contains("replacing")`),
      false,
      "E7 置き換え: 確定で replacing が解除される",
    );
    pass("E5-E7 満員→置き換えモード→スロット置換（PARTY_MAX=6 維持）");
  }

  {
    // 置き換えモードの外側クリックで解除
    const six = packs.filter((p) => !p.region).slice(0, 6).map((p) => p.id);
    const extra = packs.filter((p) => !p.region && !six.includes(p.id))[0].id;
    await load({ favoritePacks: six, pack: six[0] });
    await click(`#tabs .tab[data-tab="box"]`);
    await click(`#grid .tile[data-id="${extra}"]`);
    await settle(120);
    expectTrue(await evalPage(`document.getElementById("partyRowBox").classList.contains("replacing")`), "E8 前提: replacing に入っている");
    await click(`#search`);
    await settle(120);
    expectEqual(
      await evalPage(`document.getElementById("partyRowBox").classList.contains("replacing")`),
      false,
      "E8 置き換え: 手持ち列/グリッド外のクリックで解除される",
    );
    expectDeepEqual(settings.favoritePacks, six, "E8 置き換え: 解除しても手持ちは変わらない");
    pass("E8 置き換えモードの外側クリック解除");
  }

  {
    // 空きスロット → ボックスタブへ
    await load({ favoritePacks: [HERO_PACK], pack: HERO_PACK });
    await click(`#partyRowAibou .party-slot.empty`);
    expectEqual(await evalPage(`document.getElementById("panel-box").hidden`), false, "E9 空きスロット: タップでボックスタブへ遷移する");
    pass("E9 空きスロット→ボックス遷移");
  }

  // ══════════════ F. せってい ══════════════
  await load();
  await click(`#tabs .tab[data-tab="settings"]`);
  {
    const initial = await evalPage(`(() => ({
      enabled: document.getElementById("enabled").checked,
      avoidCursor: document.getElementById("avoidCursor").checked,
      strength: document.getElementById("avoidCursorStrength").value,
      appReactions: document.getElementById("appReactions").checked,
      companion: document.getElementById("notificationCompanion").checked,
    }))()`);
    expectEqual(initial.enabled, true, "F1 初期値: 有効トグルが settings を反映");
    expectEqual(initial.avoidCursor, true, "F1 初期値: よけるトグルが settings を反映");
    expectEqual(initial.strength, "normal", "F1 初期値: よけ方セレクトが settings を反映");
    expectEqual(initial.appReactions, false, "F1 初期値: アプリ反応トグルが settings を反映");
    expectEqual(initial.companion, false, "F1 初期値: 通知コンパニオンが settings を反映");

    const before = patches.length;
    await click(`#enabled`);
    await click(`#avoidCursor`);
    await click(`#appReactions`);
    await click(`#notificationCompanion`);
    const emitted = patches.slice(before);
    const keys = emitted.flatMap((p) => Object.keys(p));
    expectEqual(emitted.length, 4, `F2 トグル: 4件で patch 4件 (${JSON.stringify(emitted)})`);
    for (const key of ["enabled", "avoidCursor", "appReactionsEnabled", "notificationCompanionEnabled"]) {
      expectTrue(keys.includes(key), `F2 トグル: patch がストア形キー ${key} に正規化される (got ${JSON.stringify(keys)})`);
    }
    expectTrue(!keys.some((k) => k.startsWith("vcp1_")), `F2 トグル: vcp1_ 接頭辞が main へ漏れない (got ${JSON.stringify(keys)})`);
    expectEqual(emitted.find((p) => "enabled" in p).enabled, false, "F2 トグル: 有効OFFが反映される");

    const strengthPatch = (await (async () => {
      const n = patches.length;
      await selectValue("avoidCursorStrength", "strong");
      for (let i = 0; i < 20 && patches.length === n; i += 1) await settle(25);
      return patches[patches.length - 1];
    })());
    expectEqual(strengthPatch.avoidCursorStrength, "strong", "F3 よけ方: セレクト変更が avoidCursorStrength として送られる");
    pass("F1-F3 せってい初期値反映 / トグル4件のキー正規化 / よけ方セレクト");
  }

  {
    await waitFor(`document.getElementById("appVersion").textContent.trim() === "v1.4.1"`, "app version to render");
    expectTrue(calls.includes("update:get-version"), "F4 バージョン: update:get-version が呼ばれる");

    const beforeCheck = calls.length;
    await click(`#checkUpdate`);
    expectTrue(calls.slice(beforeCheck).includes("update:check"), "F5 アップデート確認: update:check が呼ばれる");

    const beforeTest = calls.length;
    await click(`#testCompanion`);
    expectTrue(calls.slice(beforeTest).includes("companion:test-notification"), "F6 TEST: companion:test-notification が呼ばれる");
    pass("F4-F6 バージョン表示 / アップデート確認 / 通知TEST の IPC 結線");
  }

  {
    // EXPORT ボタンの状態機械: 押下→disabled+"..."→"DONE"→1200ms 後に復帰
    const beforeExport = calls.length;
    await evalPage(`document.getElementById("exportCodexPet").click()`);
    await waitFor(`document.getElementById("exportCodexPet").textContent === "DONE"`, "export DONE");
    expectTrue(calls.slice(beforeExport).includes("codex-pet:export-current"), "F7 EXPORT: codex-pet:export-current が呼ばれる");
    expectEqual(await evalPage(`document.getElementById("exportCodexPet").disabled`), true, "F7 EXPORT: 完了直後はまだ disabled");
    await waitFor(`document.getElementById("exportCodexPet").textContent === "EXPORT" && !document.getElementById("exportCodexPet").disabled`, "export restore", 4000);
    pass("F7 EXPORT ボタンの状態機械（disabled→DONE→復帰）");
  }
  await shot("04-settings");

  // ══════════════ G. 健全性 ══════════════
  expectEqual(consoleErrors.length, 0, `G1 renderer console error: ${JSON.stringify(consoleErrors.slice(0, 3))}`);
  pass("G1 renderer コンソールエラー 0件");

  // ESC で閉じる（ウィンドウを壊すので最後）
  await evalPage(`document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))`);
  for (let i = 0; i < 60 && !windowClosed; i += 1) await settle(50);
  expectTrue(windowClosed, "G2 ESC: 設定ウィンドウが閉じる");
  pass("G2 ESC でウィンドウが閉じる");

  console.log(`[verify-settings-ui-render] ok: ${checks.length} groups`);
  for (const name of checks) console.log(`  - ${name}`);
  if (shotsDir) console.log(`[verify-settings-ui-render] screenshots=${shotsDir} (scale=${shotScale})`);
  app.quit();
}

if (process.versions.electron && process.type === "browser") {
  const { app } = require("electron");
  runElectronMain().catch((error) => {
    console.error(`[verify-settings-ui-render] ${error.stack || error.message}`);
    // app.quit() は Windows で process.exitCode を無視し exit 0 になる（実測）。
    app.exit(1);
  });
} else {
  const electron = require("electron");
  const result = spawnSync(electron, [__filename, ...(process.platform === "linux" ? ["--no-sandbox", "--disable-gpu"] : [])], {
    cwd: root,
    env: { ...process.env },
    stdio: "inherit",
  });
  process.exit(result.status ?? 1);
}

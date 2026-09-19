// オーバーレイ（src/overlay/*）のスプライト描画経路を実 Electron の透過ウィンドウで検証する。
//
// verify-overlay-cache.cjs はソース文字列で「キャッシュ変数がある」ことしか見ておらず、
// verify-notification-overlay-render.cjs は通知バブルだけを見ている。
// 実際にポケモンを描く onFrame 経路（シート URL 解決・コマ切り出し・transform・
// 非表示ガード）はどちらにも入っていないため、ここで実描画を突く。
//
// 依存追加なし。PF_OVERLAY_SHOTS_DIR を指定すると透過 PNG も書き出す
// （紹介動画・README 用の素材。高解像度は PF_OVERLAY_SHOT_SCALE）。

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const shotsDir = process.env.PF_OVERLAY_SHOTS_DIR || "";
// 高解像度化は contentSize × N ＋ ロード後 setZoomFactor(N)。
// --force-device-scale-factor は macOS で無視されるため使わない（実測）。
const shotScale = Math.max(1, Number(process.env.PF_OVERLAY_SHOT_SCALE || "1") || 1);
const PACK_KEY = process.env.PF_OVERLAY_PACK || "retro/gen-1/025-pikachu";

function fail(message) {
  throw new Error(message);
}

function expectEqual(actual, expected, label) {
  if (actual !== expected) fail(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function expectTrue(condition, label) {
  if (!condition) fail(label);
}

async function runElectronMain() {
  const { app, BrowserWindow, protocol, net } = require("electron");
  const { pathToFileURL } = require("node:url");
  const { resolveAppProtocolPath } = require("../src/main/app-protocol-path.js");
  const { makePackReader } = require("../src/main/pack-reader.js");

  // zoom レベルは userData に origin 単位で永続化される。既定の共有 userData を使うと
  // ここで設定した拡大率が他の Electron 実行（verify:notification や dev 起動）へ漏れる。
  // 実行ごとに捨てる userData を与えて隔離する。
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pf-overlay-sprite-render-"));
  app.setPath("userData", userDataDir);
  app.on("will-quit", () => {
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); }
    catch (_) { /* 終了時のクリーンアップ失敗は無視 */ }
  });

  const packReader = makePackReader(root);
  const { meta } = packReader.readPackMeta(PACK_KEY);
  const idle = meta.states.idle;
  const walk = meta.states.walk;
  const idleRowCount = Object.keys(idle.rows || {}).length;

  await app.whenReady();

  protocol.handle("app", (request) => {
    const filePath = resolveAppProtocolPath(root, request.url);
    if (!filePath) return new Response(null, { status: 403 });
    if (!fs.existsSync(filePath)) return new Response(null, { status: 404 });
    return net.fetch(pathToFileURL(filePath).toString());
  });

  const WIDTH = 480;
  const HEIGHT = 360;
  const win = new BrowserWindow({
    width: WIDTH * shotScale,
    height: HEIGHT * shotScale,
    useContentSize: true,
    show: false,
    transparent: true,
    frame: false,
    hasShadow: false,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(root, "src", "overlay", "overlay-preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const consoleErrors = [];
  win.webContents.on("console-message", (event) => {
    if (event.level === "error") consoleErrors.push(String(event.message || ""));
  });

  await win.loadFile(path.join(root, "src", "overlay", "overlay.html"));
  // setZoomFactor はナビゲーション後に当てる（load 前だと遷移でリセットされる）。
  if (shotScale !== 1) win.webContents.setZoomFactor(shotScale);

  const evalPage = (js) => win.webContents.executeJavaScript(js, true);
  const sendMeta = (m) => win.webContents.send("meta", m);
  const sendFrame = async (frame) => {
    win.webContents.send("frame", frame);
    await new Promise((resolve) => setTimeout(resolve, 80));
  };
  const readFollower = () => evalPage(`(() => {
    const el = document.getElementById("__pf_follower");
    if (!el) return { exists: false };
    const s = el.style;
    const cs = getComputedStyle(el);
    return {
      exists: true,
      display: s.display,
      width: s.width,
      height: s.height,
      backgroundImage: s.backgroundImage,
      backgroundSize: s.backgroundSize,
      backgroundPosition: s.backgroundPosition,
      transform: s.transform,
      imageRendering: cs.imageRendering,
      pointerEvents: cs.pointerEvents,
      zIndex: cs.zIndex,
    };
  })()`);

  async function waitFor(js, label, timeoutMs = 10000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (await evalPage(js)) return;
      if (Date.now() > deadline) fail(`timeout waiting for ${label}`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  const checks = [];
  const record = (name) => { checks.push(name); console.log(`  ok  ${name}`); };

  // ── 1. meta 受信でシート URL が app:// 経由で解決される ─────
  sendMeta(meta);
  await waitFor(`!!document.getElementById("__pf_follower")`, "follower element");
  {
    const expectedIdleUrl = `app://bundle/assets/raw/${meta.rawPath}/${idle.sheet}`;
    const loaded = await evalPage(`(() => {
      // preloadImages が張った Image の src と実サイズを見る
      const img = new Image();
      img.src = ${JSON.stringify(expectedIdleUrl)};
      return new Promise((resolve) => {
        img.onload = () => resolve({ ok: true, w: img.naturalWidth, h: img.naturalHeight, src: img.src });
        img.onerror = () => resolve({ ok: false, w: 0, h: 0, src: img.src });
      });
    })()`);
    expectTrue(loaded.ok, `シート読込: ${expectedIdleUrl} が app:// 経由でデコードできる`);
    expectEqual(loaded.w, idle.frames * idle.frame.w, "シート寸法: 幅 = frames × frame.w（meta とシートが一致）");
    expectEqual(loaded.h, idleRowCount * idle.frame.h, "シート寸法: 高さ = 向き行数 × frame.h");
    record(`シート読込 ${idle.sheet} ${loaded.w}x${loaded.h}`);
  }

  // ── 2. 可視フレームでコマが正しく切り出される ───────────────
  {
    const frameIndex = 3;
    const row = 2; // right
    await sendFrame({ visible: true, state: "idle", frame: frameIndex, row, x: 240, y: 180, scale: 1 });
    const el = await readFollower();
    expectEqual(el.display, "block", "描画: 可視フレームで display=block");
    expectEqual(el.width, `${idle.frame.w}px`, "描画: 幅が frame.w");
    expectEqual(el.height, `${idle.frame.h}px`, "描画: 高さが frame.h");
    expectTrue(el.backgroundImage.includes(idle.sheet), `描画: idle シートが背景に入る (${el.backgroundImage})`);
    expectEqual(
      el.backgroundPosition,
      `${-(frameIndex * idle.frame.w)}px ${-(row * idle.frame.h)}px`,
      "描画: background-position が -(frame×w) -(row×h)",
    );
    expectEqual(
      el.backgroundSize,
      `${idle.frames * idle.frame.w}px ${idleRowCount * idle.frame.h}px`,
      "描画: background-size が実シートの自然サイズ（画像が本当にロードされている証跡）",
    );
    // style へ書いた値は Chromium が正規化して返す（240.00px → 240px, 0 → 0px）。
    expectEqual(
      el.transform,
      "translate3d(240px, 180px, 0px) translate(-50%, -50%) scale(1)",
      "描画: transform が座標＋中心合わせ＋倍率",
    );
    expectEqual(el.imageRendering, "pixelated", "描画: ドット絵補間が pixelated");
    expectEqual(el.pointerEvents, "none", "描画: クリックを奪わない (pointer-events:none)");

    // 小数座標が toFixed(2) で丸められること（サブピクセル補間の契約）
    await sendFrame({ visible: true, state: "idle", frame: frameIndex, row, x: 240.567, y: 180.123, scale: 1 });
    const sub = await readFollower();
    expectEqual(
      sub.transform,
      "translate3d(240.57px, 180.12px, 0px) translate(-50%, -50%) scale(1)",
      "描画: 小数座標は 2 桁へ丸めて渡る",
    );
    record(`コマ切り出し frame=${frameIndex} row=${row} → ${el.backgroundPosition}`);
  }

  if (shotsDir) {
    fs.mkdirSync(shotsDir, { recursive: true });
    fs.writeFileSync(path.join(shotsDir, "overlay-idle.png"), (await win.capturePage()).toPNG());
  }

  // ── 3. state 切替でシートと寸法が入れ替わる ─────────────────
  {
    await sendFrame({ visible: true, state: "walk", frame: 1, row: 6, x: 100, y: 90, scale: 2 });
    const el = await readFollower();
    expectTrue(el.backgroundImage.includes(walk.sheet), `state切替: walk シートへ差し替わる (${el.backgroundImage})`);
    expectEqual(el.width, `${walk.frame.w}px`, "state切替: 幅が walk の frame.w へ");
    expectEqual(el.height, `${walk.frame.h}px`, "state切替: 高さが walk の frame.h へ");
    expectEqual(
      el.backgroundPosition,
      `${-(1 * walk.frame.w)}px ${-(6 * walk.frame.h)}px`,
      "state切替: walk のコマ位置",
    );
    expectTrue(el.transform.includes("scale(2)"), `state切替: 倍率が反映される (${el.transform})`);
    record(`state切替 idle→walk ${walk.frame.w}x${walk.frame.h}`);
  }

  if (shotsDir) {
    fs.writeFileSync(path.join(shotsDir, "overlay-walk.png"), (await win.capturePage()).toPNG());
  }

  // ── 4. 非表示ガード ─────────────────────────────────────────
  {
    await sendFrame(null);
    expectEqual((await readFollower()).display, "none", "非表示: frame=null で隠れる");

    await sendFrame({ visible: true, state: "walk", frame: 0, row: 0, x: 10, y: 10, scale: 1 });
    expectEqual((await readFollower()).display, "block", "非表示: 復帰できる");

    await sendFrame({ visible: false, state: "walk", frame: 0, row: 0, x: 10, y: 10, scale: 1 });
    expectEqual((await readFollower()).display, "none", "非表示: visible=false で隠れる");

    await sendFrame({ visible: true, state: "nonexistent-state", frame: 0, row: 0, x: 10, y: 10, scale: 1 });
    expectEqual((await readFollower()).display, "none", "非表示: 未知の state では描かない（クラッシュしない）");
    record("非表示ガード null / visible=false / 未知state");
  }

  // ── 5. 透過ウィンドウであること ─────────────────────────────
  {
    const bg = await evalPage(`getComputedStyle(document.body).backgroundColor`);
    expectTrue(
      bg === "rgba(0, 0, 0, 0)" || bg === "transparent",
      `透過: body 背景が透明 (${bg})`,
    );
    expectTrue(win.isTransparent?.() !== false, "透過: ウィンドウが transparent で作られている");
    record("透過ウィンドウ");
  }

  // ── 6. 同一フレーム再送でスタイルを書き直さない（キャッシュ） ──
  {
    const frame = { visible: true, state: "idle", frame: 2, row: 1, x: 200, y: 150, scale: 1 };
    await sendFrame(frame);
    // style 属性の変更回数を数える
    await evalPage(`(() => {
      window.__pfStyleWrites = 0;
      const el = document.getElementById("__pf_follower");
      window.__pfObserver = new MutationObserver((records) => { window.__pfStyleWrites += records.length; });
      window.__pfObserver.observe(el, { attributes: true, attributeFilter: ["style"] });
      return true;
    })()`);
    for (let i = 0; i < 5; i += 1) await sendFrame(frame);
    const sameFrameWrites = await evalPage(`window.__pfStyleWrites`);
    expectEqual(sameFrameWrites, 0, `キャッシュ: 同一フレーム5回再送で style 書き込みが発生しない (got ${sameFrameWrites})`);

    await sendFrame({ ...frame, frame: 3 });
    const changedWrites = await evalPage(`window.__pfStyleWrites`);
    expectTrue(changedWrites > 0, "キャッシュ: コマが変わったら style は書き込まれる");
    await evalPage(`(() => { window.__pfObserver.disconnect(); return true; })()`);
    record(`スタイル書き込みキャッシュ（同一5回=0書込 / 変化時=${changedWrites}書込）`);
  }

  // ── 7. meta 差し替えでシートとキャッシュが入れ替わる ──────────
  {
    const otherKey = process.env.PF_OVERLAY_PACK_ALT || "retro/gen-1/009-blastoise";
    const { meta: otherMeta } = packReader.readPackMeta(otherKey);
    expectTrue(otherMeta.rawPath !== meta.rawPath, "meta差替: 別パックの rawPath が違うこと（前提）");
    sendMeta(otherMeta);
    await new Promise((resolve) => setTimeout(resolve, 400));
    await sendFrame({ visible: true, state: "idle", frame: 0, row: 0, x: 240, y: 180, scale: 1 });
    const el = await readFollower();
    expectTrue(
      el.backgroundImage.includes(otherMeta.rawPath),
      `meta差替: 新しいパックのシートを指す (${el.backgroundImage})`,
    );
    expectTrue(
      !el.backgroundImage.includes(meta.rawPath),
      `meta差替: 旧パックのシートURLが残らない (${el.backgroundImage})`,
    );
    expectEqual(el.width, `${otherMeta.states.idle.frame.w}px`, "meta差替: 新しいパックの frame.w が反映される");
    expectEqual(
      el.backgroundSize,
      `${otherMeta.states.idle.frames * otherMeta.states.idle.frame.w}px ${Object.keys(otherMeta.states.idle.rows).length * otherMeta.states.idle.frame.h}px`,
      "meta差替: background-size が新シートの自然サイズへ更新される（キャッシュが残っていない）",
    );
    record(`meta差替 ${PACK_KEY} → ${otherKey}`);
    // 以降の通知検証のため元のパックへ戻す
    sendMeta(meta);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  // ── 8. 通知バリアント（title/body 欠落・TTL・再発行） ─────────
  {
    const readNotification = () => evalPage(`(() => {
      const el = document.getElementById("__pf_notification");
      if (!el) return { exists: false };
      const [source, title, body] = el.children;
      return {
        exists: true,
        display: el.style.display,
        sourceText: source.textContent,
        titleText: title.textContent,
        bodyText: body.textContent,
        titleDisplay: title.style.display,
        bodyDisplay: body.style.display,
      };
    })()`);

    win.webContents.send("companion-notification", { source: "Codex", title: "タイトルのみ", ttlMs: 60000 });
    await new Promise((resolve) => setTimeout(resolve, 150));
    const titleOnly = await readNotification();
    expectEqual(titleOnly.display, "block", "通知: タイトルのみで表示される");
    expectEqual(titleOnly.titleDisplay, "block", "通知: タイトルが可視");
    expectEqual(titleOnly.bodyDisplay, "none", "通知: 本文が無いときは本文行を隠す");

    win.webContents.send("companion-notification", { source: "Codex", body: "本文のみ", ttlMs: 60000 });
    await new Promise((resolve) => setTimeout(resolve, 150));
    const bodyOnly = await readNotification();
    expectEqual(bodyOnly.titleDisplay, "none", "通知: タイトルが無いときはタイトル行を隠す");
    expectEqual(bodyOnly.bodyDisplay, "block", "通知: 本文が可視");
    expectEqual(bodyOnly.bodyText, "本文のみ", "通知: 再発行で内容が差し替わる");

    win.webContents.send("companion-notification", { source: "既定", title: "既定ソース", ttlMs: 60000 });
    await new Promise((resolve) => setTimeout(resolve, 150));
    win.webContents.send("companion-notification", { title: "ソース無し", ttlMs: 60000 });
    await new Promise((resolve) => setTimeout(resolve, 150));
    expectEqual((await readNotification()).sourceText, "通知", "通知: source 未指定なら「通知」にフォールバック");

    // TTL で自動的に隠れる
    win.webContents.send("companion-notification", { source: "Codex", title: "短命", ttlMs: 300 });
    await new Promise((resolve) => setTimeout(resolve, 150));
    expectEqual((await readNotification()).display, "block", "通知TTL: 期限内は表示");
    await new Promise((resolve) => setTimeout(resolve, 500));
    expectEqual((await readNotification()).display, "none", "通知TTL: 期限切れで自動的に隠れる");

    // 再発行で TTL タイマーがリセットされる（前回の短い TTL に引きずられない）
    win.webContents.send("companion-notification", { source: "Codex", title: "TTL短い", ttlMs: 400 });
    await new Promise((resolve) => setTimeout(resolve, 200));
    win.webContents.send("companion-notification", { source: "Codex", title: "TTL長い", ttlMs: 60000 });
    await new Promise((resolve) => setTimeout(resolve, 400));
    const afterReissue = await readNotification();
    expectEqual(afterReissue.display, "block", "通知TTL: 再発行でタイマーがリセットされ消えない");
    expectEqual(afterReissue.titleText, "TTL長い", "通知TTL: 再発行後の内容が出ている");
    record("通知バリアント title/body欠落・source既定・TTL自動非表示・再発行リセット");
  }

  expectEqual(consoleErrors.length, 0, `renderer console error: ${JSON.stringify(consoleErrors.slice(0, 3))}`);
  record("renderer コンソールエラー 0件");

  console.log(`[verify-overlay-sprite-render] ok: ${checks.length} checks (pack=${PACK_KEY})`);
  for (const name of checks) console.log(`  - ${name}`);
  if (shotsDir) console.log(`[verify-overlay-sprite-render] screenshots=${shotsDir} (scale=${shotScale})`);
  app.quit();
}

if (process.versions.electron && process.type === "browser") {
  const { app } = require("electron");
  runElectronMain().catch((error) => {
    console.error(`[verify-overlay-sprite-render] ${error.stack || error.message}`);
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

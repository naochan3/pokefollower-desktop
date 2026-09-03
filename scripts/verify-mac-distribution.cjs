// macOS 配布物（release/*.dmg / *-mac.zip / mac-*/PokeFollower.app）が
// 「ダウンロードした人が実際にインストールして起動できる形」になっているかを検証する。
//
// verify-package-smoke.cjs は app.asar の中身（payload）だけを見ており、
// verify-signing-status.cjs は設定ファイルの文字列だけを見ている。
// 「署名が本当に付いているか」「zip 往復で壊れないか」「検疫フラグ付きで
// AMFI に殺されないか」「Gatekeeper がどう判定するか」は誰も見ていなかった。
// v1.4.0 は identity: null のため Apple Silicon で起動不能だった（#124）ので、
// ここは回帰させてはいけない境界。
//
// 前提: npm run dist:mac -- --arm64 --publish never を実行済み。
// 環境変数:
//   PF_MAC_DIST_SKIP_LAUNCH=1  検疫付き起動プローブを飛ばす（GUI が無い CI 用）
//   PF_MAC_DIST_LAUNCH_MS      起動プローブの生存確認時間（既定 6000）

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync, spawn, spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const releaseDir = path.join(root, "release");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const unsignedConfig = require(path.join(root, "electron-builder.unsigned.cjs"));
const version = pkg.version;
const appId = pkg.build.appId;
const productName = pkg.build.productName;
const skipLaunch = process.env.PF_MAC_DIST_SKIP_LAUNCH === "1";
const launchMs = Number(process.env.PF_MAC_DIST_LAUNCH_MS || 6000);

const checks = [];
const notes = [];
function pass(name) {
  checks.push(name);
  console.log(`  ok  ${name}`);
}
function fail(message) {
  throw new Error(message);
}
function expectEqual(actual, expected, label) {
  if (actual !== expected) fail(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function expectTrue(condition, label) {
  if (!condition) fail(label);
}

function sh(command, args, options = {}) {
  return execFileSync(command, args, { encoding: "utf8", ...options }).trim();
}
// codesign / spctl は情報を stderr に出し、非0終了でも中身が要る。
// stdout と stderr を両方まとめて返す。
function shSoft(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  const out = `${result.stdout || ""}${result.stderr || ""}`.trim();
  return { status: result.status ?? 1, out };
}
function plist(file, key) {
  const result = shSoft("/usr/libexec/PlistBuddy", ["-c", `Print :${key}`, file]);
  return result.status === 0 ? result.out : null;
}

function main() {
  if (process.platform !== "darwin") {
    console.log("[verify-mac-distribution] skip: macOS 以外では検証できない（配布物の署名判定に codesign/spctl が必要）");
    return;
  }

  // ── 1. 成果物の存在とバージョン整合 ───────────────────────────
  const dmg = path.join(releaseDir, `${productName}-${version}-arm64.dmg`);
  const zip = path.join(releaseDir, `${productName}-${version}-arm64-mac.zip`);
  const appDir = path.join(releaseDir, "mac-arm64", `${productName}.app`);
  for (const [label, file] of [["dmg", dmg], ["zip", zip], [".app", appDir]]) {
    expectTrue(
      fs.existsSync(file),
      `1 成果物: ${label} が無い (${path.relative(root, file)})。先に npm run dist:mac -- --arm64 --publish never を実行する`,
    );
  }
  expectTrue(fs.statSync(dmg).size > 50 * 1024 * 1024, "1 成果物: dmg が小さすぎる（中身が入っていない疑い）");
  expectTrue(fs.statSync(zip).size > 50 * 1024 * 1024, "1 成果物: zip が小さすぎる（中身が入っていない疑い）");
  pass(`1 成果物 dmg/zip/.app が v${version} 名で存在（dmg ${Math.round(fs.statSync(dmg).size / 1048576)}MB）`);

  // ── 2. Info.plist ────────────────────────────────────────────
  const infoPlist = path.join(appDir, "Contents", "Info.plist");
  expectTrue(fs.existsSync(infoPlist), "2 Info.plist が無い");
  expectEqual(plist(infoPlist, "CFBundleIdentifier"), appId, "2 Info.plist: CFBundleIdentifier が appId と一致");
  expectEqual(plist(infoPlist, "CFBundleShortVersionString"), version, "2 Info.plist: 表示バージョンが package.json と一致");
  expectEqual(plist(infoPlist, "CFBundleVersion"), version, "2 Info.plist: ビルドバージョンが package.json と一致");
  expectEqual(plist(infoPlist, "CFBundleExecutable"), productName, "2 Info.plist: 実行ファイル名が productName と一致");
  const minOs = plist(infoPlist, "LSMinimumSystemVersion");
  expectTrue(!!minOs, "2 Info.plist: LSMinimumSystemVersion が無い（対応OSが宣言されていない）");
  expectEqual(plist(infoPlist, "LSApplicationCategoryType"), pkg.build.mac.category, "2 Info.plist: カテゴリが設定と一致");
  pass(`2 Info.plist bundleId=${appId} version=${version} minOS=${minOs}`);

  // ── 3. アーキテクチャ ────────────────────────────────────────
  const exe = path.join(appDir, "Contents", "MacOS", productName);
  const archs = sh("lipo", ["-archs", exe]).split(/\s+/).filter(Boolean);
  expectTrue(archs.includes("arm64"), `3 アーキテクチャ: arm64 が入っていない (${archs.join(",")})`);
  if (!archs.includes("x86_64")) {
    notes.push("Intel Mac (x86_64) 向けバイナリは含まれない。arm64 専用配布。");
  }
  pass(`3 アーキテクチャ ${archs.join("+")}${archs.includes("x86_64") ? "" : "（Intel 非対応）"}`);

  // ── 4. 署名（v1.4.0 の起動不能はここが原因） ──────────────────
  const codeResources = path.join(appDir, "Contents", "_CodeSignature", "CodeResources");
  expectTrue(fs.existsSync(codeResources), "4 署名: _CodeSignature/CodeResources が無い（署名工程がスキップされている）");
  const sig = shSoft("codesign", ["-dv", "--verbose=4", appDir]).out;
  const identifier = (sig.match(/^Identifier=(.*)$/m) || [])[1];
  const signature = (sig.match(/^Signature=(.*)$/m) || [])[1];
  const sealed = (sig.match(/^Sealed Resources.*$/m) || [])[0];
  expectEqual(identifier, appId, `4 署名: Identifier が appId でない（"Electron" のままだと Apple Silicon で起動不能）`);
  expectTrue(!!sealed, "4 署名: Sealed Resources が無い");
  const wantsAdhoc = unsignedConfig.mac && unsignedConfig.mac.identity === "-";
  if (wantsAdhoc) {
    expectEqual(signature, "adhoc", "4 署名: unsigned 設定は identity:\"-\" なので adhoc 署名であるべき");
  } else {
    expectTrue(!!signature && signature !== "none", `4 署名: 有効な署名が無い (Signature=${signature})`);
  }
  const verify = shSoft("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appDir]).out;
  expectTrue(/valid on disk/.test(verify), `4 署名: --verify --deep --strict が通らない\n${verify}`);
  expectTrue(/satisfies its Designated Requirement/.test(verify), "4 署名: Designated Requirement を満たさない");
  pass(`4 署名 Identifier=${identifier} Signature=${signature} / deep-strict valid`);

  // ── 5. zip 往復で署名が壊れないか ────────────────────────────
  const zipWork = fs.mkdtempSync(path.join(os.tmpdir(), "pf-mac-dist-zip-"));
  try {
    sh("ditto", ["-x", "-k", zip, zipWork]);
    const extracted = path.join(zipWork, `${productName}.app`);
    expectTrue(fs.existsSync(extracted), "5 zip: 展開後に .app が無い");
    const zipSig = shSoft("codesign", ["-dv", "--verbose=2", extracted]).out;
    expectEqual((zipSig.match(/^Identifier=(.*)$/m) || [])[1], appId, "5 zip: 展開後の Identifier が appId と一致");
    const zipVerify = shSoft("codesign", ["--verify", "--deep", "--strict", extracted]);
    expectEqual(zipVerify.status, 0, `5 zip: 展開後に署名検証が失敗する（配布経路で壊れている）\n${zipVerify.out}`);
    pass("5 zip 往復後も署名が valid（v1.4.0 の起動不能回帰を防ぐ境界）");

    // ── 6. 検疫フラグ付きで AMFI に殺されないか ────────────────
    if (skipLaunch) {
      notes.push("検疫付き起動プローブは PF_MAC_DIST_SKIP_LAUNCH=1 で省略した。");
      pass("6 検疫付き起動プローブ: skip（環境変数指定）");
    } else {
      sh("xattr", ["-w", "com.apple.quarantine", "0083;00000000;Safari;", extracted]);
      const quarantine = shSoft("xattr", ["-p", "com.apple.quarantine", extracted]).out;
      expectTrue(!!quarantine, "6 検疫: quarantine 属性を付けられなかった");

      const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pf-mac-dist-ud-"));
      fs.writeFileSync(path.join(userDataDir, "settings.json"), JSON.stringify({ enabled: false }), "utf8");
      const child = spawn(path.join(extracted, "Contents", "MacOS", productName), [], {
        stdio: "ignore",
        detached: false,
        env: {
          ...process.env,
          POKEFOLLOWER_ALLOW_TEST_USER_DATA: "1",
          POKEFOLLOWER_TEST_USER_DATA_DIR: userDataDir,
        },
      });
      let exited = null;
      child.on("exit", (code, signal) => { exited = { code, signal }; });
      const deadline = Date.now() + launchMs;
      while (Date.now() < deadline && exited === null) {
        execFileSync("sleep", ["0.2"]);
      }
      const alive = exited === null;
      try { child.kill("SIGTERM"); } catch (_) { /* 既に終了 */ }
      try { execFileSync("pkill", ["-f", extracted], { stdio: "ignore" }); } catch (_) { /* 残骸なし */ }
      fs.rmSync(userDataDir, { recursive: true, force: true });
      expectTrue(
        alive,
        `6 検疫付き起動: ${Math.round(launchMs / 1000)}秒で終了した (${JSON.stringify(exited)})。`
        + " 署名が無効で AMFI に SIGKILL されている可能性が高い（v1.4.0 の症状）",
      );
      pass(`6 検疫フラグ付きコピーが ${Math.round(launchMs / 1000)}秒生存（AMFI の署名強制を通る）`);
    }

    // ── 7. Gatekeeper 判定と公証方針の整合 ─────────────────────
    const assess = shSoft("spctl", ["-a", "-t", "exec", "-vvv", extracted]);
    const notarizeConfigured = !!(unsignedConfig.mac && unsignedConfig.mac.notarize);
    const accepted = assess.status === 0 && /accepted/.test(assess.out);
    if (notarizeConfigured) {
      expectTrue(accepted, `7 Gatekeeper: 公証する設定なのに rejected\n${assess.out}`);
      pass("7 Gatekeeper accepted（公証済み配布）");
    } else {
      expectTrue(
        !accepted,
        "7 Gatekeeper: notarize:false なのに accepted になった。設定とドキュメントの前提がずれている",
      );
      notes.push(
        "Gatekeeper は rejected（未公証）。ダブルクリックでは開けず、初回は右クリック→開く"
        + " または mac-fix.command が必要。クリーンなインストール体験には Developer ID 署名＋公証が必要。",
      );
      pass(`7 Gatekeeper rejected を確認（未公証方針と整合）: ${assess.out.split("\n")[0]}`);
    }
  } finally {
    fs.rmSync(zipWork, { recursive: true, force: true });
  }

  // ── 8. dmg がインストーラとして成立しているか ────────────────
  const mount = sh("hdiutil", ["attach", dmg, "-nobrowse", "-readonly", "-mountrandom", os.tmpdir()])
    .split("\n").pop().split("\t").pop().trim();
  try {
    expectTrue(!!mount && fs.existsSync(mount), `8 dmg: マウントできない (${mount})`);
    const mountedApp = path.join(mount, `${productName}.app`);
    expectTrue(fs.existsSync(mountedApp), "8 dmg: 中に .app が無い");
    const appsLink = path.join(mount, "Applications");
    expectTrue(fs.existsSync(appsLink), "8 dmg: /Applications へのシンボリックリンクが無い（ドラッグ&ドロップ導線が壊れる）");
    expectEqual(fs.readlinkSync(appsLink), "/Applications", "8 dmg: Applications リンクの向き先");
    const dmgSig = shSoft("codesign", ["-dv", "--verbose=2", mountedApp]).out;
    expectEqual((dmgSig.match(/^Identifier=(.*)$/m) || [])[1], appId, "8 dmg: 中の .app の Identifier が appId と一致");
    pass("8 dmg マウント / .app 同梱 / Applications リンク / 署名維持");
  } finally {
    try { sh("hdiutil", ["detach", mount, "-quiet"]); } catch (_) { /* 既に外れている */ }
  }

  // ── 9. 起動しない人向けフォールバックが配布物に載るか ─────────
  const macFix = path.join(root, "mac-fix.command");
  expectTrue(fs.existsSync(macFix), "9 フォールバック: mac-fix.command がリポジトリに無い");
  expectTrue(!!(fs.statSync(macFix).mode & 0o111), "9 フォールバック: mac-fix.command に実行権限が無い");
  const releaseWorkflow = fs.readFileSync(path.join(root, ".github", "workflows", "release-macos.yml"), "utf8");
  expectTrue(releaseWorkflow.includes("mac-fix.command"), "9 フォールバック: release workflow が mac-fix.command をアップロードしない");
  expectTrue(releaseWorkflow.includes("--publish never") || releaseWorkflow.includes("--publish=never"),
    "9 リリース安全弁: release workflow の dist:mac が --publish never を渡していない");
  pass("9 mac-fix.command が同梱され release workflow が --publish never を渡す");

  // ── 10. ローカル実行時の publish 事故を防ぐ ───────────────────
  for (const script of ["dist", "dist:win", "dist:mac", "dist:linux"]) {
    const command = pkg.scripts[script] || "";
    expectTrue(
      /--publish[ =]never/.test(command),
      `10 リリース安全弁: package.json の ${script} に --publish never が無い`
      + "（GH_TOKEN がある環境で誤って公開されうる。AGENTS.md の Release Safety 違反）",
    );
  }
  pass("10 未署名 dist スクリプトが全て --publish never を持つ");

  console.log(`[verify-mac-distribution] ok: ${checks.length} checks`);
  for (const note of notes) console.log(`  note: ${note}`);
}

try {
  main();
} catch (error) {
  console.error(`[verify-mac-distribution] ${error.message}`);
  process.exit(1);
}

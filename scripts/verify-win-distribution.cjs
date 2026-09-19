// Windows 配布物（release/*.exe / *-win.zip / win-unpacked）が
// 「ダウンロードした人が実際にインストールして起動できる形」かを検証する。
// verify-mac-distribution.cjs の Windows 対応版。
//
// verify-package-smoke.cjs は app.asar の payload、verify-installer-ux.cjs は
// 設定と README の文字列しか見ていない。実際に出来た exe/zip のバージョン情報・
// 署名状態・安定名・zip 往復の健全性は誰も見ていなかった。
//
// 前提: npm run dist:win を実行済み（--publish never はスクリプトに入っている）。
// 環境変数:
//   PF_WIN_DIST_ALLOW_INSTALL=1  サイレントインストール＋アンインストールまで実行する
//                                （HKCU Run とインストール先に実際に書き込む。既定 off）

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.join(__dirname, "..");
const releaseDir = path.join(root, "release");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const unsignedConfig = require(path.join(root, "electron-builder.unsigned.cjs"));
const updaterSource = fs.readFileSync(path.join(root, "src", "main", "updater.js"), "utf8");
const releasing = fs.readFileSync(path.join(root, "RELEASING.md"), "utf8");
const version = pkg.version;
const productName = pkg.build.productName;
const expectedInstallerName = (updaterSource.match(/WINDOWS_INSTALLER_NAME\s*=\s*"([^"]+)"/) || [])[1];
const allowInstall = process.env.PF_WIN_DIST_ALLOW_INSTALL === "1";

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

// PowerShell を1回で回して JSON を受け取る（呼び出しコストが高いのでまとめる）
function ps(script) {
  const result = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8" });
  const out = `${result.stdout || ""}`.trim();
  if (result.status !== 0) {
    fail(`powershell failed (${result.status}): ${`${result.stderr || ""}`.trim() || out}`);
  }
  return out;
}
function psJson(script) {
  const text = ps(`${script} | ConvertTo-Json -Depth 4 -Compress`);
  if (!text) return null;
  return JSON.parse(text);
}

function main() {
  if (process.platform !== "win32") {
    console.log("[verify-win-distribution] skip: Windows 以外では検証できない（exe の署名/バージョン情報取得に PowerShell が必要）");
    return;
  }
  expectTrue(!!expectedInstallerName, "updater.js の WINDOWS_INSTALLER_NAME が読めない");

  // ── 1. 成果物の存在 ──────────────────────────────────────────
  expectTrue(fs.existsSync(releaseDir), `1 成果物: release/ が無い。先に npm run dist:win を実行する`);
  const entries = fs.readdirSync(releaseDir);
  const exeFiles = entries.filter((name) => name.toLowerCase().endsWith(".exe"));
  const zipFiles = entries.filter((name) => name.toLowerCase().endsWith(".zip"));
  expectTrue(exeFiles.length === 1, `1 成果物: NSIS exe がちょうど1本であるべき (${JSON.stringify(exeFiles)})`);
  expectTrue(zipFiles.length === 1, `1 成果物: win zip がちょうど1本であるべき (${JSON.stringify(zipFiles)})`);
  const exeName = exeFiles[0];
  const exePath = path.join(releaseDir, exeName);
  const zipPath = path.join(releaseDir, zipFiles[0]);
  expectTrue(fs.statSync(exePath).size > 50 * 1024 * 1024, "1 成果物: exe が小さすぎる（中身が入っていない疑い）");
  expectTrue(fs.statSync(zipPath).size > 50 * 1024 * 1024, "1 成果物: zip が小さすぎる（中身が入っていない疑い）");
  const unpacked = path.join(releaseDir, "win-unpacked");
  expectTrue(fs.existsSync(unpacked), "1 成果物: win-unpacked が無い");
  pass(`1 成果物 ${exeName} (${Math.round(fs.statSync(exePath).size / 1048576)}MB) / ${zipFiles[0]} / win-unpacked`);

  // ── 2. 安定名の契約（アプリ内アップデートと README の DL リンク） ──
  {
    const artifactName = pkg.build.nsis && pkg.build.nsis.artifactName;
    if (artifactName) {
      expectEqual(exeName, expectedInstallerName, `2 安定名: artifactName 固定なのに出力名が期待名と違う`);
      pass(`2 安定名 ビルド出力が updater.js の期待名 ${expectedInstallerName} と一致（手作業リネーム不要）`);
    } else {
      // 既定名 "${productName} Setup ${version}.exe" が出る想定。updater.js は
      // 別名を要求するので、リリース時の手作業リネームが唯一の接続点になる。
      expectTrue(
        exeName !== expectedInstallerName,
        `2 安定名: artifactName 未設定なのに期待名で出力された。前提が変わっている (${exeName})`,
      );
      expectTrue(
        releasing.includes(expectedInstallerName),
        `2 安定名: RELEASING.md に ${expectedInstallerName} へのリネーム手順が無い`,
      );
      notes.push(
        `ビルド出力は "${exeName}" だが updater.js と README は "${expectedInstallerName}" を要求する。`
        + " リリース時の手作業リネームが唯一の接続点で、忘れると README の DL リンクと"
        + " アプリ内アップデートが同時に壊れる。nsis.artifactName の固定を推奨。",
      );
      pass(`2 安定名 出力=${exeName} / 期待=${expectedInstallerName}（手作業リネームが必要な状態を検出）`);
    }
  }

  // ── 3. exe のバージョン情報 ──────────────────────────────────
  {
    const info = psJson(`(Get-Item ${JSON.stringify(exePath)}).VersionInfo | Select-Object ProductName,ProductVersion,FileVersion,CompanyName`);
    expectTrue(!!info, "3 バージョン情報: VersionInfo が読めない");
    expectTrue(
      String(info.ProductVersion || "").startsWith(version),
      `3 バージョン情報: ProductVersion が package.json と一致しない (${info.ProductVersion} vs ${version})`,
    );
    expectTrue(
      String(info.FileVersion || "").startsWith(version),
      `3 バージョン情報: FileVersion が package.json と一致しない (${info.FileVersion} vs ${version})`,
    );
    pass(`3 バージョン情報 ProductName=${info.ProductName} ProductVersion=${info.ProductVersion}`);
  }

  // ── 4. 署名状態と設定の整合 ──────────────────────────────────
  {
    const sig = psJson(`Get-AuthenticodeSignature ${JSON.stringify(exePath)} | Select-Object Status,SignerCertificate`);
    const status = String(sig && sig.Status !== undefined ? sig.Status : "");
    // Status は enum。文字列化されるか数値のことがあるので両方見る（0=Valid, 2=NotSigned）
    const notSigned = status === "NotSigned" || status === "2";
    const signExecutableDisabled = unsignedConfig.win && unsignedConfig.win.signExecutable === false;
    if (signExecutableDisabled) {
      expectTrue(
        notSigned,
        `4 署名: unsigned 設定（signExecutable:false）なのに署名されている (Status=${status})`,
      );
      notes.push(
        "exe は未署名。SmartScreen が「WindowsによってPCが保護されました」を出すため、"
        + "初回は「詳細情報」→「実行」が必要。クリーンな導入体験には EV/OV コード署名が必要。",
      );
      pass(`4 署名 未署名を確認（設定と整合。Status=${status}）`);
    } else {
      expectTrue(status === "Valid" || status === "0", `4 署名: 署名する設定なのに有効でない (Status=${status})`);
      pass(`4 署名 Valid`);
    }
  }

  // ── 5. zip 往復後も実行体とネイティブ依存が揃うか ─────────────
  {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), "pf-win-dist-"));
    try {
      ps(`Expand-Archive -Path ${JSON.stringify(zipPath)} -DestinationPath ${JSON.stringify(work)} -Force`);
      const extractedExe = path.join(work, `${productName}.exe`);
      expectTrue(fs.existsSync(extractedExe), `5 zip: 展開後に ${productName}.exe が無い`);
      const info = psJson(`(Get-Item ${JSON.stringify(extractedExe)}).VersionInfo | Select-Object ProductVersion`);
      expectTrue(
        String(info.ProductVersion || "").startsWith(version),
        `5 zip: 展開後 exe のバージョンが一致しない (${info.ProductVersion})`,
      );
      // koffi のネイティブは asarUnpack 対象。展開後も実体があること。
      const koffiNode = path.join(
        work, "resources", "app.asar.unpacked", "node_modules", "@koromix",
        "koffi-win32-x64", "win32_x64", "koffi.node",
      );
      expectTrue(fs.existsSync(koffiNode), `5 zip: koffi のネイティブが展開後に無い (${koffiNode})`);
      expectTrue(fs.statSync(koffiNode).size > 0, "5 zip: koffi.node が空");
      const wasm = path.join(work, "resources", "app.asar");
      expectTrue(fs.existsSync(wasm), "5 zip: app.asar が無い");
      pass("5 zip 往復後も exe / koffi ネイティブ / app.asar が揃う");
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  }

  // ── 6. win-unpacked が起動できる（全画面検知の koffi ロード込み） ──
  {
    const unpackedExe = path.join(unpacked, `${productName}.exe`);
    expectTrue(fs.existsSync(unpackedExe), "6 起動: win-unpacked に exe が無い");
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "pf-win-dist-ud-"));
    fs.writeFileSync(path.join(userDataDir, "settings.json"), JSON.stringify({ enabled: false }), "utf8");
    const started = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", `
      $p = Start-Process -FilePath ${JSON.stringify(unpackedExe)} -PassThru
      Start-Sleep -Seconds 6
      $alive = -not $p.HasExited
      try { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } catch {}
      Get-Process -Name ${JSON.stringify(productName)} -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
      if ($alive) { "ALIVE" } else { "EXITED:" + $p.ExitCode }
    `], {
      encoding: "utf8",
      env: {
        ...process.env,
        POKEFOLLOWER_ALLOW_TEST_USER_DATA: "1",
        POKEFOLLOWER_TEST_USER_DATA_DIR: userDataDir,
      },
    });
    fs.rmSync(userDataDir, { recursive: true, force: true });
    const verdict = `${started.stdout || ""}`.trim().split("\n").pop().trim();
    expectEqual(verdict, "ALIVE", `6 起動: win-unpacked の exe が6秒持たなかった (${verdict})`);
    pass("6 起動 win-unpacked が6秒生存（Electron + ネイティブ依存のロードを通る）");
  }

  // ── 7. サイレントインストール（明示 opt-in のみ） ──────────────
  if (!allowInstall) {
    notes.push("サイレントインストール検証は未実行。PF_WIN_DIST_ALLOW_INSTALL=1 で有効化（HKCU Run とインストール先に実書き込み）。");
    pass("7 サイレントインストール: skip（既定 off）");
  } else {
    const before = psJson(`Get-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' -ErrorAction SilentlyContinue | Select-Object -Property *`);
    ps(`Start-Process -FilePath ${JSON.stringify(exePath)} -ArgumentList '/S' -Wait`);
    const installDir = path.join(process.env.LOCALAPPDATA || "", "Programs", productName);
    expectTrue(fs.existsSync(installDir), `7 インストール: ${installDir} が作られない`);
    expectTrue(fs.existsSync(path.join(installDir, `${productName}.exe`)), "7 インストール: インストール先に exe が無い");
    const uninstaller = fs.readdirSync(installDir).find((name) => /^Uninstall .*\.exe$/.test(name));
    expectTrue(!!uninstaller, `7 インストール: アンインストーラが無い (${JSON.stringify(fs.readdirSync(installDir))})`);
    ps(`Start-Process -FilePath ${JSON.stringify(path.join(installDir, uninstaller))} -ArgumentList '/S' -Wait; Start-Sleep -Seconds 3`);
    expectTrue(!fs.existsSync(path.join(installDir, `${productName}.exe`)), "7 アンインストール: exe が残っている");
    notes.push(`インストール前の HKCU Run: ${JSON.stringify(before && Object.keys(before).filter((k) => !k.startsWith("PS")))}`);
    pass("7 サイレントインストール → インストール先とアンインストーラを確認 → アンインストール");
  }

  console.log(`[verify-win-distribution] ok: ${checks.length} checks`);
  for (const note of notes) console.log(`  note: ${note}`);
}

try {
  main();
} catch (error) {
  console.error(`[verify-win-distribution] ${error.message}`);
  process.exit(1);
}

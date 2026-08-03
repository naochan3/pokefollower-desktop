// 自前アップデート機能の純粋ロジック（副作用なし・テスト対象）。
// ダイアログ/ダウンロード/プロセス起動などの副作用は main.js 側に置く。

const REPO = "naochan3/pokefollower-desktop";
const LATEST_RELEASE_URL = `https://api.github.com/repos/${REPO}/releases/latest`;
const WINDOWS_INSTALLER_NAME = "PokeFollower-Setup.exe";

// MAJOR.MINOR.PATCH を数値として比較する（辞書順にしない）。a>b で 1、a<b で -1、等値で 0。
function compareVersions(a, b) {
  const pa = String(a).split(".").map((n) => Number(n) || 0);
  const pb = String(b).split(".").map((n) => Number(n) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

// current が latest より古い（更新が必要）なら true。ローカルが新しい/同値なら false。
function isOutdated(current, latest) {
  return compareVersions(current, latest) < 0;
}

// Windows インストーラ（安定名 PokeFollower-Setup.exe）の download URL を返す。なければ null。
function pickWindowsInstallerAsset(assets) {
  if (!Array.isArray(assets)) return null;
  const found = assets.find((a) => a && a.name === WINDOWS_INSTALLER_NAME);
  return found ? found.browser_download_url : null;
}

// GitHub の release JSON から必要項目を取り出す。tag_name が v#.#.# 形式でなければ throw。
function parseLatestRelease(json) {
  const tag = json && json.tag_name;
  if (typeof tag !== "string" || !/^v\d+\.\d+\.\d+$/.test(tag)) {
    throw new Error(`unexpected GitHub release tag_name: ${tag}`);
  }
  return {
    version: tag.slice(1),
    tag,
    htmlUrl: json.html_url,
    assets: Array.isArray(json.assets) ? json.assets : [],
  };
}

// fetchFn（net.fetch 互換: ok/status/json() を持つ Response を返す）を注入して最新リリースを取得。
async function checkLatestRelease(fetchFn) {
  const res = await fetchFn(LATEST_RELEASE_URL, {
    headers: {
      "User-Agent": "pokefollower-desktop",
      Accept: "application/vnd.github+json",
    },
  });
  if (!res || !res.ok) {
    const status = res ? res.status : "no response";
    throw new Error(`GitHub release check failed: HTTP ${status}`);
  }
  const json = await res.json();
  return parseLatestRelease(json);
}

module.exports = {
  REPO,
  LATEST_RELEASE_URL,
  WINDOWS_INSTALLER_NAME,
  compareVersions,
  isOutdated,
  pickWindowsInstallerAsset,
  parseLatestRelease,
  checkLatestRelease,
};

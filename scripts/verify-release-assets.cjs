const fs = require("node:fs");
const https = require("node:https");
const path = require("node:path");

const root = path.join(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
const repo = process.env.PF_RELEASE_REPO || "naochan3/pokefollower-desktop";
const tag = process.env.PF_RELEASE_TAG || `v${pkg.version}`;
const expectedAssets = [
  "PokeFollower-Setup.exe",
  `PokeFollower-${pkg.version}-win.zip`,
  `PokeFollower-${pkg.version}-arm64.dmg`,
  `PokeFollower-${pkg.version}-arm64-mac.zip`,
];

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const headers = {
      Accept: "application/vnd.github+json",
      "User-Agent": "pokefollower-release-verifier",
    };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

    https
      .get(url, { headers }, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`GitHub API ${res.statusCode}: ${body}`));
            return;
          }
          resolve(JSON.parse(body));
        });
      })
      .on("error", reject);
  });
}

function fail(message) {
  console.error(`[verify-release-assets] ${message}`);
  process.exit(1);
}

function expectReadmeLink(assetName, url) {
  if (!readme.includes(url)) {
    fail(`README missing download link for ${assetName}: ${url}`);
  }
}

(async () => {
  const release = await requestJson(`https://api.github.com/repos/${repo}/releases/tags/${tag}`);
  const latest = await requestJson(`https://api.github.com/repos/${repo}/releases/latest`);
  if (latest.tag_name !== tag) {
    fail(`latest release is ${latest.tag_name}, expected ${tag}`);
  }
  if (release.draft) fail(`${tag} is a draft release`);
  if (release.prerelease) fail(`${tag} is a prerelease`);

  const assets = new Map((release.assets || []).map((asset) => [asset.name, asset]));
  for (const name of expectedAssets) {
    const asset = assets.get(name);
    if (!asset) fail(`missing release asset: ${name}`);
    if (asset.state !== "uploaded") fail(`${name} state is ${asset.state}`);
    if (!asset.digest || !asset.digest.startsWith("sha256:")) {
      fail(`${name} is missing GitHub sha256 digest`);
    }
    if (!Number.isFinite(asset.size) || asset.size <= 0) fail(`${name} has invalid size ${asset.size}`);
  }

  expectReadmeLink(
    "PokeFollower-Setup.exe",
    `https://github.com/${repo}/releases/latest/download/PokeFollower-Setup.exe`,
  );
  expectReadmeLink(
    `PokeFollower-${pkg.version}-arm64.dmg`,
    `https://github.com/${repo}/releases/download/${tag}/PokeFollower-${pkg.version}-arm64.dmg`,
  );
  expectReadmeLink(
    `PokeFollower-${pkg.version}-arm64-mac.zip`,
    `https://github.com/${repo}/releases/download/${tag}/PokeFollower-${pkg.version}-arm64-mac.zip`,
  );

  const linuxAssets = [...assets.keys()].filter((name) => /appimage/i.test(name));
  if (linuxAssets.length > 0) {
    fail(`unexpected Linux AppImage asset present while Linux runtime remains unverified: ${linuxAssets.join(", ")}`);
  }

  console.log(
    `[verify-release-assets] ok: ${repo} ${tag} is latest and has ${expectedAssets.length} expected assets with sha256 digests, README links, and no Linux AppImage`,
  );
})();

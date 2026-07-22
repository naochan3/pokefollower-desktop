import { describe, it, expect } from "vitest";
import {
  compareVersions,
  isOutdated,
  pickWindowsInstallerAsset,
  parseLatestRelease,
  checkLatestRelease,
} from "../src/main/updater.js";

describe("compareVersions", () => {
  it("大きい方に 1、小さい方に -1、等値で 0", () => {
    expect(compareVersions("1.3.0", "1.2.0")).toBe(1);
    expect(compareVersions("1.2.0", "1.3.0")).toBe(-1);
    expect(compareVersions("1.2.0", "1.2.0")).toBe(0);
  });

  it("数値として比較する（辞書順にしない）", () => {
    expect(compareVersions("1.10.0", "1.9.0")).toBe(1);
    expect(compareVersions("2.0.0", "1.9.9")).toBe(1);
    expect(compareVersions("1.0.10", "1.0.9")).toBe(1);
  });
});

describe("isOutdated", () => {
  it("現在 < 最新 で true", () => {
    expect(isOutdated("1.2.0", "1.3.0")).toBe(true);
  });

  it("等値で false", () => {
    expect(isOutdated("1.3.0", "1.3.0")).toBe(false);
  });

  it("ローカルが新しい（開発ビルド）なら false", () => {
    expect(isOutdated("1.4.0", "1.3.0")).toBe(false);
  });
});

describe("pickWindowsInstallerAsset", () => {
  it("PokeFollower-Setup.exe の browser_download_url を返す", () => {
    const assets = [
      { name: "PokeFollower-1.3.0-win.zip", browser_download_url: "https://x/zip" },
      { name: "PokeFollower-Setup.exe", browser_download_url: "https://x/setup.exe" },
    ];
    expect(pickWindowsInstallerAsset(assets)).toBe("https://x/setup.exe");
  });

  it("存在しなければ null", () => {
    const assets = [{ name: "PokeFollower-1.3.0-arm64.dmg", browser_download_url: "https://x/dmg" }];
    expect(pickWindowsInstallerAsset(assets)).toBe(null);
  });

  it("空配列で null", () => {
    expect(pickWindowsInstallerAsset([])).toBe(null);
  });
});

describe("parseLatestRelease", () => {
  it("tag_name から version(v除去)・tag・htmlUrl・assets を取り出す", () => {
    const json = {
      tag_name: "v1.3.0",
      html_url: "https://github.com/naochan3/pokefollower-desktop/releases/tag/v1.3.0",
      assets: [{ name: "PokeFollower-Setup.exe", browser_download_url: "https://x/setup.exe" }],
    };
    const r = parseLatestRelease(json);
    expect(r.version).toBe("1.3.0");
    expect(r.tag).toBe("v1.3.0");
    expect(r.htmlUrl).toBe(json.html_url);
    expect(r.assets).toEqual(json.assets);
  });

  it("tag_name が無ければ throw", () => {
    expect(() => parseLatestRelease({ html_url: "x", assets: [] })).toThrow();
  });

  it("tag_name が不正な形式なら throw", () => {
    expect(() => parseLatestRelease({ tag_name: "latest", assets: [] })).toThrow();
  });
});

describe("checkLatestRelease", () => {
  it("200 ならパース結果を返す", async () => {
    const releaseJson = {
      tag_name: "v1.3.0",
      html_url: "https://x/tag/v1.3.0",
      assets: [{ name: "PokeFollower-Setup.exe", browser_download_url: "https://x/setup.exe" }],
    };
    const fetchFn = async () => ({ ok: true, status: 200, json: async () => releaseJson });
    const r = await checkLatestRelease(fetchFn);
    expect(r.version).toBe("1.3.0");
    expect(r.tag).toBe("v1.3.0");
  });

  it("403（レート制限）で throw", async () => {
    const fetchFn = async () => ({ ok: false, status: 403, json: async () => ({}) });
    await expect(checkLatestRelease(fetchFn)).rejects.toThrow();
  });

  it("404 で throw", async () => {
    const fetchFn = async () => ({ ok: false, status: 404, json: async () => ({}) });
    await expect(checkLatestRelease(fetchFn)).rejects.toThrow();
  });
});

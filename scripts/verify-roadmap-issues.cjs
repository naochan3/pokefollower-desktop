const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const status = fs.readFileSync(path.join(root, "docs", "STATUS.md"), "utf8");
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
const errors = [];

function expect(condition, message) {
  if (!condition) errors.push(message);
}

expect(readme.includes("[docs/STATUS.md](docs/STATUS.md)"), "README must link to docs/STATUS.md");
expect(status.includes("現在のバージョン: **v1.0.4**"), "STATUS must state current version v1.0.4");
expect(status.includes("現在含まれているもの（v1.0.4）"), "STATUS must have included-assets section for v1.0.4");

for (const issue of [
  ["#14", "全ポケモン対応（第5〜9世代の追加）", "現状は493種（〜第4世代）"],
  ["#16", "配布物の署名・公証（Win/Mac）", "SmartScreen / Gatekeeper"],
  ["#17", "macOS / Linux の全画面自動非表示・Linux 実機検証", "macOS / Linux の best-effort 検知は実装済み"],
]) {
  const [num, title, note] = issue;
  const id = num.slice(1);
  expect(status.includes(`[${num}](https://github.com/naochan3/pokefollower-desktop/issues/${id})`), `STATUS must link ${num}`);
  expect(status.includes(title), `STATUS roadmap missing title for ${num}: ${title}`);
  expect(status.includes(note), `STATUS roadmap missing note for ${num}: ${note}`);
}

expect(status.includes("追従更新間隔の軽量化"), "STATUS must record completed sim interval lightweight change");
expect(status.includes("既定を16ms（最大60fps相当）へ戻し"), "STATUS must document the 16ms default decision");

for (const closedIssue of ["#1", "#2", "#3", "#4", "#6", "#7", "#8", "#9", "#10"]) {
  expect(status.includes(closedIssue), `STATUS completed-plan table must keep ${closedIssue}`);
}

expect(status.includes("Linux は AppImage ビルドまで（実機の常駐挙動は未検証）。"), "STATUS must keep Linux runtime limitation");
expect(status.includes("全画面の自動非表示は macOS / Linux では権限や外部コマンドに依存します。"), "STATUS must keep macOS/Linux fullscreen dependency limitation");
expect(status.includes("macOS / Windows とも **未署名**"), "STATUS must keep unsigned limitation");

if (errors.length > 0) {
  for (const error of errors) console.error(`[verify-roadmap-issues] ${error}`);
  process.exit(1);
}

console.log("[verify-roadmap-issues] ok: README/STATUS roadmap and known limitations are aligned with tracked issues");

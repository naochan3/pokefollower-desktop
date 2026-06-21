const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const status = fs.readFileSync(path.join(root, "docs", "STATUS.md"), "utf8");
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
const notificationCapture = fs.readFileSync(path.join(root, "docs", "notification-capture.md"), "utf8");
const errors = [];

function expect(condition, message) {
  if (!condition) errors.push(message);
}

expect(readme.includes("[docs/STATUS.md](docs/STATUS.md)"), "README must link to docs/STATUS.md");
expect(status.includes("現在のバージョン: **v1.0.5**"), "STATUS must state current version v1.0.5");
expect(status.includes("現在含まれているもの（v1.0.5）"), "STATUS must have included-assets section for v1.0.5");

for (const issue of [
  ["#16", "配布物の署名・公証（Win/Mac）", "SmartScreen / Gatekeeper"],
  ["#17", "macOS / Linux の全画面自動非表示・Linux 実機検証", "Linux AppImage build/start smoke は確認済み"],
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

expect(
  status.includes("Linux は AppImage ビルドと WSLg 起動 smoke まで（実機の tray・透明・クリック透過・最前面は未検証）。"),
  "STATUS must keep Linux visual runtime limitation",
);
expect(status.includes("全画面の自動非表示は macOS / Linux では権限や外部コマンドに依存します。"), "STATUS must keep macOS/Linux fullscreen dependency limitation");
expect(status.includes("macOS / Windows とも **未署名**"), "STATUS must keep unsigned limitation");
expect(status.includes("[通知コンパニオンの取得境界](notification-capture.md)"), "STATUS must link notification capture boundaries");
expect(readme.includes("[通知コンパニオンの取得境界](docs/notification-capture.md)"), "README must link notification capture boundaries");
expect(readme.includes("v1.0.5 の Release には AppImage asset をまだ添付していない"), "README must not link a missing v1.0.5 AppImage asset");
expect(!readme.includes("releases/download/v1.0.5/PokeFollower-1.0.5.AppImage"), "README must not contain the missing v1.0.5 AppImage URL");
expect(status.includes("未完了・対応中・検討中の項目"), "STATUS roadmap must not describe active work as only unstarted");
expect(status.includes("OS 通知本文は保存しない"), "STATUS must distinguish OS notification bodies from Codex summaries");

expect(notificationCapture.includes("既定 OFF"), "notification boundaries must require default OFF");
expect(notificationCapture.includes("明示的な設定 ON"), "notification boundaries must require explicit user opt-in");
expect(notificationCapture.includes("通知本文をリポジトリ、Issue、ログ、共有ファイルへ保存しません"), "notification boundaries must prohibit storing OS notification bodies");
expect(notificationCapture.includes("アプリ内イベント") && notificationCapture.includes("Codex `notify`"), "notification boundaries must keep safe input scope");
expect(notificationCapture.includes("UNUserNotificationCenter"), "notification boundaries must document macOS boundary");
expect(notificationCapture.includes("User Notification Listener capability"), "notification boundaries must document Windows listener capability");
expect(notificationCapture.includes("Desktop Notifications Specification"), "notification boundaries must document Linux freedesktop boundary");
expect(notificationCapture.includes("org.freedesktop.portal.Notification"), "notification boundaries must document XDG portal boundary");
expect(
  notificationCapture.includes("RemoveNotification") && notificationCapture.includes("ClearNotifications") && notificationCapture.includes("使いません"),
  "Windows listener boundary must explicitly prohibit destructive notification operations"
);

if (errors.length > 0) {
  for (const error of errors) console.error(`[verify-roadmap-issues] ${error}`);
  process.exit(1);
}

console.log("[verify-roadmap-issues] ok: README/STATUS roadmap and known limitations are aligned with tracked issues");

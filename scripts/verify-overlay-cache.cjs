const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const overlay = fs.readFileSync(path.join(root, "src", "overlay", "overlay.js"), "utf8");
const preload = fs.readFileSync(path.join(root, "src", "overlay", "overlay-preload.js"), "utf8");
const errors = [];

function expect(condition, message) {
  if (!condition) errors.push(message);
}

function count(pattern) {
  return (overlay.match(pattern) || []).length;
}

expect(/let followerEl = null;/.test(overlay), "overlay must cache the follower DOM element");
expect(/function ensureEl\(\)/.test(overlay), "overlay must use ensureEl()");
expect(/if \(followerEl\) return;/.test(overlay), "ensureEl must return early when the cached element exists");
expect(count(/document\.createElement\(/g) === 5, "overlay should create only the cached follower and notification DOM elements");
expect(!/innerHTML|insertAdjacentHTML|replaceChildren/.test(overlay), "overlay must not rebuild DOM with HTML replacement APIs");
expect(/let notificationEl = null;/.test(overlay), "overlay must cache the notification DOM element");
expect(/function ensureNotificationEl\(\)/.test(overlay), "overlay must use ensureNotificationEl()");
expect(/if \(notificationEl\) return;/.test(overlay), "ensureNotificationEl must return early when cached notification elements exist");
expect(/const images = \{\};/.test(overlay), "overlay must cache preloaded Image objects");
expect(/const sheetUrls = \{\};/.test(overlay), "overlay must cache resolved sheet URLs");
expect(/let appliedState = "";/.test(overlay), "overlay must cache applied sprite state");
expect(/let appliedSize = "";/.test(overlay), "overlay must cache applied sprite size");
expect(/let appliedBgSize = "";/.test(overlay), "overlay must cache applied background size");
expect(/let appliedFramePosition = "";/.test(overlay), "overlay must cache applied background position");
expect(/let appliedTransform = "";/.test(overlay), "overlay must cache applied transform");
expect(/if \(appliedSize !== sizeKey\)/.test(overlay), "overlay must avoid repeated width/height writes");
expect(/if \(appliedState !== f\.state\)/.test(overlay), "overlay must avoid repeated background-image writes");
expect(/if \(appliedBgSize !== bgSize\)/.test(overlay), "overlay must avoid repeated background-size writes");
expect(/if \(appliedFramePosition !== framePosition\)/.test(overlay), "overlay must avoid repeated background-position writes");
expect(/if \(appliedTransform !== transform\)/.test(overlay), "overlay must avoid repeated transform writes");
expect(/willChange: "transform, background-position, background-image"/.test(overlay), "overlay should keep compositor hints");
expect(/transformOrigin: "center center"/.test(overlay), "overlay should set transform-origin once");
expect(/translate3d\(/.test(overlay), "overlay should position sprites with translate3d");
expect(/onCompanionNotification/.test(overlay), "overlay must subscribe to companion notification events");
expect(!/getBoundingClientRect/.test(overlay), "overlay notification positioning must avoid forced layout reads");
expect(
  /onMeta: \(cb\) => ipcRenderer\.on\("meta", \(_e, m\) => cb\(m\)\)/.test(preload) &&
    /onFrame: \(cb\) => ipcRenderer\.on\("frame", \(_e, f\) => cb\(f\)\)/.test(preload) &&
    /onCompanionNotification: \(cb\) => ipcRenderer\.on\("companion-notification", \(_e, n\) => cb\(n\)\)/.test(preload),
  "overlay preload must expose only meta/frame/companion notification subscriptions",
);

if (errors.length > 0) {
  for (const error of errors) console.error(`[verify-overlay-cache] ${error}`);
  process.exit(1);
}

console.log("[verify-overlay-cache] ok: overlay DOM/cache invariants are present");

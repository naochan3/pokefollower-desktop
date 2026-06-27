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
expect(/let renderFromFrame = null;/.test(overlay), "overlay must track the previous render frame for interpolation");
expect(/let renderToFrame = null;/.test(overlay), "overlay must track the target render frame for interpolation");
expect(/const FRAME_INTERPOLATION_FALLBACK_MS = 16;/.test(overlay), "overlay interpolation must default to one 60Hz frame");
expect(/const FRAME_INTERPOLATION_MAX_MS = 80;/.test(overlay), "overlay interpolation must cap stale frame spans");
expect(/if \(appliedSize !== sizeKey\)/.test(overlay), "overlay must avoid repeated width/height writes");
expect(/if \(appliedState !== frame\.state\)/.test(overlay), "overlay must avoid repeated background-image writes");
expect(/if \(appliedBgSize !== bgSize\)/.test(overlay), "overlay must avoid repeated background-size writes");
expect(/if \(appliedFramePosition !== framePosition\)/.test(overlay), "overlay must avoid repeated background-position writes");
expect(/if \(appliedTransform !== transform\)/.test(overlay), "overlay must avoid repeated transform writes");
expect(/window\.requestAnimationFrame\(renderInterpolatedFrame\)/.test(overlay), "overlay must use requestAnimationFrame for display-cadence interpolation");
expect(/function hideFollower\(\)/.test(overlay) && /resetInterpolation\(\);/.test(overlay), "overlay must reset interpolation whenever the follower is hidden");
expect(/renderFromFrame = lastRenderedFrame \|\| frame;/.test(overlay), "overlay must interpolate from the current rendered frame, not a stale hidden frame");
expect(/Math\.min\(FRAME_INTERPOLATION_MAX_MS, Math\.max\(FRAME_INTERPOLATION_FALLBACK_MS, elapsed\)\)/.test(overlay), "overlay must clamp interpolation duration");
expect(/willChange: "transform, background-position, background-image"/.test(overlay), "overlay should keep compositor hints");
expect(/transformOrigin: "center center"/.test(overlay), "overlay should set transform-origin once");
expect(/translate3d\(/.test(overlay), "overlay should position sprites with translate3d");
expect(/onCompanionNotification/.test(overlay), "overlay must subscribe to companion notification events");
expect(!/getBoundingClientRect/.test(overlay), "overlay notification positioning must avoid forced layout reads");
expect(/const NOTIFICATION_FALLBACK_WIDTH = 292;/.test(overlay), "notification fallback width must match the styled pixel bubble width");
expect(/const NOTIFICATION_FALLBACK_HEIGHT = 124;/.test(overlay), "notification fallback height must leave clamp room for the styled pixel bubble");
expect(/const NOTIFICATION_SIDE_MARGIN = 24;/.test(overlay), "notification side margin must stay stable");
expect(/const NOTIFICATION_BOTTOM_MARGIN = 96;/.test(overlay), "notification bottom margin must stay above the macOS Dock area");
expect(/width: "min\(292px, calc\(100vw - 24px\)\)"/.test(overlay), "notification bubble must use a stable clamped width");
expect(/height: "124px"/.test(overlay), "notification bubble must reserve a stable CleanShot-style height");
expect(/border: "4px solid #000"/.test(overlay), "notification bubble must keep a crisp 4px pixel border");
expect(/boxShadow: "6px 6px 0 #000"/.test(overlay), "notification bubble must keep a pixel shadow");
expect(/ui-monospace/.test(overlay), "notification bubble must use a pixel-like monospace font stack");
expect(/borderBottom: "4px solid #000"/.test(overlay), "notification source strip must keep a pixel divider");
expect(/bottom-left/.test(overlay) && /bottom-right/.test(overlay), "notification bubble must support bottom-left and bottom-right corner placement");
expect(!/lastFollowerX|lastFollowerY/.test(overlay), "notification placement must not depend on follower coordinates");
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

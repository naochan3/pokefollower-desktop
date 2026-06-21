const MAX_SOURCE_CHARS = 24;
const MAX_TITLE_CHARS = 48;
const MAX_BODY_CHARS = 96;
const DEFAULT_TTL_MS = 5200;
const MIN_SEND_INTERVAL_MS = 350;

function compactText(value, maxChars) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function normalizeCompanionNotification(input, { now = Date.now() } = {}) {
  if (!input || typeof input !== "object") return null;
  const source = compactText(input.source || "通知", MAX_SOURCE_CHARS);
  const title = compactText(input.title, MAX_TITLE_CHARS);
  const body = compactText(input.body, MAX_BODY_CHARS);
  if (!title && !body) return null;
  return {
    source,
    title,
    body,
    receivedAt: now,
    ttlMs: DEFAULT_TTL_MS,
  };
}

function createNotificationCompanion({
  getSettings,
  getOverlays,
  isSuppressed,
  now = Date.now,
  minIntervalMs = MIN_SEND_INTERVAL_MS,
}) {
  let lastSentAt = 0;

  function publish(input) {
    const settings = getSettings();
    if (!settings.notificationCompanionEnabled) return false;
    if (isSuppressed()) return false;
    const currentTime = now();
    if (lastSentAt && currentTime - lastSentAt < minIntervalMs) return false;
    const notification = normalizeCompanionNotification(input, { now: currentTime });
    if (!notification) return false;
    const overlay = getOverlays().find((candidate) => (
      candidate.visible &&
      candidate.win &&
      !candidate.win.isDestroyed()
    ));
    if (!overlay) return false;
    overlay.win.webContents.send("companion-notification", notification);
    lastSentAt = currentTime;
    return true;
  }

  return { publish };
}

module.exports = { createNotificationCompanion, normalizeCompanionNotification };

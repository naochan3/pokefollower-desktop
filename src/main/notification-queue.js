const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const MAX_QUEUE_LINES = 64;
const MAX_BODY_CHARS = 96;
const MAX_TITLE_CHARS = 48;

function defaultNotificationQueuePath(env = process.env, homeDir = os.homedir()) {
  return env.POKEFOLLOWER_NOTIFICATION_QUEUE || path.join(homeDir, ".pokefollower", "notifications", "codex.jsonl");
}

function compactText(value, maxChars) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function projectNameFromCwd(cwd) {
  const base = path.basename(String(cwd || "").replace(/\/+$/g, ""));
  return base || "Codex";
}

function buildCodexNotification(payload, { now = Date.now() } = {}) {
  if (!payload || typeof payload !== "object") return null;
  const project = projectNameFromCwd(payload.cwd);
  const assistant = compactText(payload["last-assistant-message"], MAX_BODY_CHARS);
  const body = compactText(assistant ? `${project}: ${assistant}` : `${project}: turn complete`, MAX_BODY_CHARS);
  return {
    source: "Codex",
    title: compactText("Codex turn complete", MAX_TITLE_CHARS),
    body,
    receivedAt: now,
    ttlMs: 5200,
  };
}

function parseCodexPayload(argv = process.argv.slice(2)) {
  const raw = argv.slice(1).join(" ").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return {
      type: argv[0] || "codex",
      "last-assistant-message": raw,
    };
  }
}

function writeCodexNotification(queuePath, payload, {
  fileSystem = fs,
  now = Date.now(),
  maxLines = MAX_QUEUE_LINES,
} = {}) {
  const notification = buildCodexNotification(payload, { now });
  if (!notification) return null;
  fileSystem.mkdirSync(path.dirname(queuePath), { recursive: true });
  let lines = [];
  try {
    lines = fileSystem.readFileSync(queuePath, "utf8").split("\n").filter(Boolean);
  } catch (_) {
    lines = [];
  }
  lines.push(JSON.stringify(notification));
  if (lines.length > maxLines) lines = lines.slice(lines.length - maxLines);
  fileSystem.writeFileSync(queuePath, `${lines.join("\n")}\n`, "utf8");
  return notification;
}

function readNewNotifications(queuePath, { offset = 0, fileSystem = fs } = {}) {
  let stat;
  try {
    stat = fileSystem.statSync(queuePath);
  } catch (_) {
    return { offset: 0, notifications: [] };
  }
  if (stat.size < offset) offset = 0;
  const fd = fileSystem.openSync(queuePath, "r");
  try {
    const size = stat.size - offset;
    if (size <= 0) return { offset: stat.size, notifications: [] };
    const buffer = Buffer.alloc(size);
    fileSystem.readSync(fd, buffer, 0, size, offset);
    const notifications = buffer
      .toString("utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try { return JSON.parse(line); }
        catch (_) { return null; }
      })
      .filter(Boolean);
    return { offset: stat.size, notifications };
  } finally {
    fileSystem.closeSync(fd);
  }
}

module.exports = {
  MAX_QUEUE_LINES,
  buildCodexNotification,
  defaultNotificationQueuePath,
  parseCodexPayload,
  readNewNotifications,
  writeCodexNotification,
};

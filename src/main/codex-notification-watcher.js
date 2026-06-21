const fs = require("node:fs");
const path = require("node:path");
const { readNewNotifications } = require("./notification-queue.js");

const CHANGE_DEBOUNCE_MS = 120;

function createCodexNotificationWatcher({
  queuePath,
  getSettings,
  publish,
  fsImpl = fs,
  readNewNotifications: readQueue = readNewNotifications,
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
}) {
  let watcher = null;
  let offset = 0;
  let debounceTimer = null;

  function stop() {
    if (debounceTimer) {
      clearTimeoutImpl(debounceTimer);
      debounceTimer = null;
    }
    if (watcher) {
      watcher.close();
      watcher = null;
    }
  }

  function drain() {
    debounceTimer = null;
    const result = readQueue(queuePath, { offset });
    offset = result.offset;
    for (const notification of result.notifications) publish(notification);
  }

  function handleChange() {
    if (!watcher) return;
    if (debounceTimer) clearTimeoutImpl(debounceTimer);
    debounceTimer = setTimeoutImpl(drain, CHANGE_DEBOUNCE_MS);
  }

  function start() {
    if (watcher) return;
    fsImpl.mkdirSync(path.dirname(queuePath), { recursive: true });
    if (fsImpl.existsSync(queuePath)) {
      offset = fsImpl.statSync(queuePath).size;
    }
    watcher = fsImpl.watch(path.dirname(queuePath), { persistent: false }, (eventType, filename) => {
      if (filename && path.basename(filename) !== path.basename(queuePath)) return;
      if (eventType === "rename" || eventType === "change") handleChange();
    });
  }

  function sync() {
    const enabled = !!getSettings().notificationCompanionEnabled;
    if (enabled) start();
    else stop();
  }

  return { handleChange, stop, sync };
}

module.exports = { createCodexNotificationWatcher };

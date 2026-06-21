import { describe, expect, it } from "vitest";
import { createCodexNotificationWatcher } from "../src/main/codex-notification-watcher.js";

describe("codex-notification-watcher", () => {
  it("設定OFFではwatchを開始せず、ONで開始し、OFFで停止する", () => {
    const calls = [];
    let enabled = false;
    const watcher = createCodexNotificationWatcher({
      queuePath: "/tmp/pf-codex.jsonl",
      getSettings: () => ({ notificationCompanionEnabled: enabled }),
      publish: () => true,
      fsImpl: {
        existsSync: () => false,
        mkdirSync: (dir) => calls.push(["mkdir", dir]),
        watch: (target, _options, cb) => {
          calls.push(["watch", target]);
          return { close: () => calls.push(["close"]), cb };
        },
      },
    });

    watcher.sync();
    expect(calls).toEqual([]);
    enabled = true;
    watcher.sync();
    expect(calls.map(([kind]) => kind)).toEqual(["mkdir", "watch"]);
    enabled = false;
    watcher.sync();
    expect(calls.map(([kind]) => kind)).toEqual(["mkdir", "watch", "close"]);
  });

  it("watchイベントをdebounceして新規通知だけpublishする", () => {
    const timers = [];
    const published = [];
    let currentOffset = 0;
    const watcher = createCodexNotificationWatcher({
      queuePath: "/tmp/pf-codex.jsonl",
      getSettings: () => ({ notificationCompanionEnabled: true }),
      publish: (n) => published.push(n),
      readNewNotifications: (_path, { offset }) => {
        currentOffset = offset + 10;
        return {
          offset: currentOffset,
          notifications: offset === 0 ? [{ title: "done" }] : [],
        };
      },
      setTimeoutImpl: (fn) => {
        timers.push(fn);
        return timers.length;
      },
      clearTimeoutImpl: () => {},
      fsImpl: {
        existsSync: () => false,
        mkdirSync: () => {},
        watch: (_target, _options, cb) => ({ close: () => {}, cb }),
      },
    });

    watcher.sync();
    watcher.handleChange();
    expect(published).toEqual([]);
    timers.pop()();
    expect(published).toEqual([{ title: "done" }]);
    watcher.handleChange();
    timers.pop()();
    expect(published).toEqual([{ title: "done" }]);
  });
});

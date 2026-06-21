import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildCodexNotification,
  defaultNotificationQueuePath,
  readNewNotifications,
  writeCodexNotification,
} from "../src/main/notification-queue.js";

describe("notification-queue", () => {
  it("Codex notify payloadを短い通知に変換し、入力本文は保存しない", () => {
    const notification = buildCodexNotification({
      type: "agent-turn-complete",
      cwd: "/Users/me/work/pokefollower-desktop",
      "last-assistant-message": "検証が完了しました。".repeat(20),
      "input-messages": ["秘密っぽい長いユーザー入力"],
    }, { now: 1111 });

    expect(notification).toMatchObject({
      source: "Codex",
      title: "Codex turn complete",
      receivedAt: 1111,
    });
    expect(notification.body).toContain("pokefollower-desktop");
    expect(notification.body).toContain("検証が完了しました");
    expect(JSON.stringify(notification)).not.toContain("秘密っぽい長いユーザー入力");
    expect(notification.body.length).toBeLessThanOrEqual(96);
  });

  it("queue pathは環境変数で上書きでき、既定はhome配下", () => {
    expect(defaultNotificationQueuePath({ POKEFOLLOWER_NOTIFICATION_QUEUE: "/tmp/pf.jsonl" }, "/home/me")).toBe("/tmp/pf.jsonl");
    expect(defaultNotificationQueuePath({}, "/home/me")).toBe("/home/me/.pokefollower/notifications/codex.jsonl");
  });

  it("JSONL queueを書き、読み取りoffset以降だけ返し、最大行数で切り詰める", () => {
    const dir = mkdtempSync(join(tmpdir(), "pf-queue-"));
    const queuePath = join(dir, "codex.jsonl");
    try {
      for (let i = 0; i < 70; i += 1) {
        writeCodexNotification(queuePath, {
          type: "agent-turn-complete",
          cwd: `/work/project-${i}`,
          "last-assistant-message": `done ${i}`,
        }, { now: 2000 + i, maxLines: 64 });
      }

      const rawLines = readFileSync(queuePath, "utf8").trim().split("\n");
      expect(rawLines).toHaveLength(64);
      expect(rawLines[0]).toContain("project-6");

      const first = readNewNotifications(queuePath, { offset: 0 });
      expect(first.notifications).toHaveLength(64);
      const second = readNewNotifications(queuePath, { offset: first.offset });
      expect(second.notifications).toEqual([]);
      expect(second.offset).toBe(first.offset);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

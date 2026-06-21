import { describe, expect, it } from "vitest";
import { createNotificationCompanion, normalizeCompanionNotification } from "../src/main/notification-companion.js";

function makeOverlaySink() {
  const sent = [];
  return {
    sent,
    overlays: [
      {
        win: {
          isDestroyed: () => false,
          webContents: {
            send: (channel, payload) => sent.push([channel, payload]),
          },
        },
      },
    ],
  };
}

function makeMultiOverlaySink() {
  const sent = [];
  return {
    sent,
    overlays: [
      {
        visible: false,
        win: {
          isDestroyed: () => false,
          webContents: {
            send: (channel, payload) => sent.push(["hidden", channel, payload]),
          },
        },
      },
      {
        visible: true,
        win: {
          isDestroyed: () => false,
          webContents: {
            send: (channel, payload) => sent.push(["visible", channel, payload]),
          },
        },
      },
    ],
  };
}

describe("notification-companion", () => {
  it("通知本文をドット吹き出し向けに短く正規化する", () => {
    const normalized = normalizeCompanionNotification({
      source: "Codex",
      title: "  Long   title ".repeat(8),
      body: "build finished\n\nwith many details ".repeat(12),
    }, { now: 1234 });

    expect(normalized.source).toBe("Codex");
    expect(normalized.title.length).toBeLessThanOrEqual(48);
    expect(normalized.body.length).toBeLessThanOrEqual(96);
    expect(normalized.body).not.toMatch(/\s{2,}/);
    expect(normalized.receivedAt).toBe(1234);
    expect(normalized.ttlMs).toBe(5200);
  });

  it("設定OFFではoverlayへ通知を送らない", () => {
    const sink = makeOverlaySink();
    const companion = createNotificationCompanion({
      isEnabled: () => false,
      getOverlays: () => sink.overlays,
      isSuppressed: () => false,
      now: () => 2000,
    });

    expect(companion.publish({ title: "Done", body: "Task finished" })).toBe(false);
    expect(sink.sent).toEqual([]);
  });

  it("force指定では設定OFFでもアプリ内通知を送れる", () => {
    const sink = makeOverlaySink();
    sink.overlays[0].visible = true;
    const companion = createNotificationCompanion({
      getSettings: () => ({ notificationCompanionEnabled: false }),
      getOverlays: () => sink.overlays,
      isSuppressed: () => false,
      now: () => 2100,
    });

    expect(companion.publish({ title: "Break" }, { force: true })).toBe(true);
    expect(sink.sent).toHaveLength(1);
  });

  it("設定ONかつ非抑制時だけ要約通知をoverlayへ送る", () => {
    const sink = makeOverlaySink();
    sink.overlays[0].visible = true;
    const companion = createNotificationCompanion({
      isEnabled: () => true,
      getOverlays: () => sink.overlays,
      isSuppressed: () => false,
      now: () => 3000,
    });

    expect(companion.publish({ source: "Codex", title: "PR ready", body: "検証結果をまとめました" })).toBe(true);
    expect(sink.sent).toHaveLength(1);
    expect(sink.sent[0][0]).toBe("companion-notification");
    expect(sink.sent[0][1]).toMatchObject({
      source: "Codex",
      title: "PR ready",
      body: "検証結果をまとめました",
      receivedAt: 3000,
    });
  });

  it("通知本文はポケモンが表示されているoverlay 1枚だけへ送る", () => {
    const sink = makeMultiOverlaySink();
    const companion = createNotificationCompanion({
      isEnabled: () => true,
      getOverlays: () => sink.overlays,
      isSuppressed: () => false,
      now: () => 4000,
    });

    expect(companion.publish({ title: "One screen" })).toBe(true);
    expect(sink.sent).toHaveLength(1);
    expect(sink.sent[0][0]).toBe("visible");
    expect(sink.sent[0][1]).toBe("companion-notification");
  });

  it("全画面などの抑制中は通知を出さず、短時間の連投も落とす", () => {
    let now = 5000;
    let suppressed = true;
    const sink = makeOverlaySink();
    const companion = createNotificationCompanion({
      isEnabled: () => true,
      getOverlays: () => sink.overlays,
      isSuppressed: () => suppressed,
      now: () => now,
    });

    expect(companion.publish({ title: "Hidden" })).toBe(false);
    suppressed = false;
    sink.overlays[0].visible = true;
    expect(companion.publish({ title: "Visible" })).toBe(true);
    now += 100;
    expect(companion.publish({ title: "Too soon" })).toBe(false);
    now += 300;
    expect(companion.publish({ title: "Later" })).toBe(true);
    expect(sink.sent.map(([, payload]) => payload.title)).toEqual(["Visible", "Later"]);
  });
});

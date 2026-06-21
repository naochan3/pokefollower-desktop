import { describe, expect, it } from "vitest";
import { createWorkWatchSession, presetDurations } from "../src/main/work-watch.js";

describe("work-watch", () => {
  it("停止状態から開始し、作業終了で休憩、休憩終了で作業へ戻る", () => {
    const session = createWorkWatchSession({ preset: "25/5", now: () => 0 });
    expect(session.snapshot()).toMatchObject({ running: false, phase: "stopped", preset: "25/5" });
    const started = session.start(1000);
    expect(started).toMatchObject({ running: true, phase: "work" });
    expect(started.phaseEndsAt).toBe(1000 + presetDurations("25/5").workMs);

    const before = session.tick(started.phaseEndsAt - 1);
    expect(before.event).toBe(null);
    expect(before.state.phase).toBe("work");

    const breakStart = session.tick(started.phaseEndsAt);
    expect(breakStart.event).toBe("break-started");
    expect(breakStart.state.phase).toBe("break");

    const workStart = session.tick(breakStart.state.phaseEndsAt);
    expect(workStart.event).toBe("work-started");
    expect(workStart.state.phase).toBe("work");
  });

  it("stopは再起動後に勝手に進まない停止状態と同じ形に戻す", () => {
    const session = createWorkWatchSession({ preset: "50/10" });
    session.start(0);
    expect(session.stop()).toMatchObject({ running: false, phase: "stopped", preset: "50/10" });
    expect(session.tick(999999).event).toBe(null);
  });

  it("未知プリセットは25/5へフォールバックする", () => {
    const session = createWorkWatchSession({ preset: "bad" });
    expect(session.snapshot().preset).toBe("25/5");
    session.setPreset("50/10");
    expect(session.snapshot().preset).toBe("50/10");
    session.setPreset("../bad");
    expect(session.snapshot().preset).toBe("50/10");
  });
});

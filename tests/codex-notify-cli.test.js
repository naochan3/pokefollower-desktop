import { describe, expect, it } from "vitest";
import { buildNotifyCommandPlan } from "../src/main/codex-notify-cli.js";

describe("codex-notify-cli", () => {
  it("Codex payloadをqueue書き込み対象にし、既存notify helperへforwardできる", () => {
    const payload = JSON.stringify({ type: "agent-turn-complete", cwd: "/work/app" });
    const plan = buildNotifyCommandPlan([
      "--forward",
      "/Applications/Codex.app/Helper",
      "turn-ended",
      payload,
    ]);

    expect(plan.payload).toEqual({ type: "agent-turn-complete", cwd: "/work/app" });
    expect(plan.forward).toEqual({
      command: "/Applications/Codex.app/Helper",
      args: ["turn-ended", payload],
    });
  });

  it("forwardなしでもpayloadだけ扱える", () => {
    const payload = JSON.stringify({ type: "agent-turn-complete", cwd: "/work/app" });
    const plan = buildNotifyCommandPlan(["turn-ended", payload]);

    expect(plan.payload).toEqual({ type: "agent-turn-complete", cwd: "/work/app" });
    expect(plan.forward).toBe(null);
  });
});

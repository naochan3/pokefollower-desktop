import { describe, it, expect } from "vitest";
import { classifyForegroundApp, reactionModeForForeground } from "../src/main/app-reactions.js";

describe("app-reactions", () => {
  it("前面アプリ名から控えめな反応モードへ分類する", () => {
    expect(classifyForegroundApp({ cls: "Chrome_WidgetWin_1" })).toBe("friendly");
    expect(classifyForegroundApp({ cls: "Visual Studio Code" })).toBe("focus");
    expect(classifyForegroundApp({ cls: "Shell_TrayWnd" })).toBe("normal");
    expect(classifyForegroundApp(null)).toBe("normal");
  });

  it("作業見守り中は前面アプリよりタイマー状態を優先する", () => {
    expect(reactionModeForForeground({ cls: "Chrome" }, { enabled: true, workWatchPhase: "work" })).toBe("calm");
    expect(reactionModeForForeground({ cls: "Code" }, { enabled: true, workWatchPhase: "break" })).toBe("break");
    expect(reactionModeForForeground({ cls: "Code" }, { enabled: false, workWatchPhase: "idle" })).toBe("normal");
  });
});

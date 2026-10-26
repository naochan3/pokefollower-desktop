import { describe, expect, it, vi } from "vitest";
import { buildTrayMenuTemplate } from "../src/main/tray-menu.js";

// ネイティブのトレイ widget は自動操作できないので、
// 「出す項目」と「押した時の作用」をテンプレート単位で固定する。

function actionsSpy() {
  return {
    openSettings: vi.fn(),
    setEnabled: vi.fn(),
    setOpenAtLogin: vi.fn(),
    checkUpdate: vi.fn(),
    quit: vi.fn(),
  };
}

function itemById(template, id) {
  const found = template.find((entry) => entry.id === id);
  if (!found) throw new Error(`menu item ${id} が無い`);
  return found;
}

describe("buildTrayMenuTemplate", () => {
  it("項目の並びと種類が固定されている", () => {
    const template = buildTrayMenuTemplate({}, actionsSpy());
    expect(template.map((entry) => entry.id ?? `separator:${entry.type}`)).toEqual([
      "open-settings",
      "separator:separator",
      "enabled",
      "auto-launch",
      "separator:separator",
      "check-update",
      "quit",
    ]);
  });

  it("ラベルが日本語表記のまま", () => {
    const template = buildTrayMenuTemplate({}, actionsSpy());
    expect(template.filter((entry) => entry.label).map((entry) => entry.label)).toEqual([
      "設定を開く",
      "有効",
      "自動起動",
      "アップデートを確認",
      "終了",
    ]);
  });

  it("トグル2件が checkbox で、状態を反映する", () => {
    const off = buildTrayMenuTemplate({ enabled: false, openAtLogin: false }, actionsSpy());
    expect(itemById(off, "enabled").type).toBe("checkbox");
    expect(itemById(off, "auto-launch").type).toBe("checkbox");
    expect(itemById(off, "enabled").checked).toBe(false);
    expect(itemById(off, "auto-launch").checked).toBe(false);

    const on = buildTrayMenuTemplate({ enabled: true, openAtLogin: true }, actionsSpy());
    expect(itemById(on, "enabled").checked).toBe(true);
    expect(itemById(on, "auto-launch").checked).toBe(true);
  });

  it("undefined な状態は false に正規化される（checked が undefined のまま渡らない）", () => {
    const template = buildTrayMenuTemplate({}, actionsSpy());
    expect(itemById(template, "enabled").checked).toBe(false);
    expect(itemById(template, "auto-launch").checked).toBe(false);
  });

  it("「設定を開く」で openSettings が呼ばれる", () => {
    const actions = actionsSpy();
    itemById(buildTrayMenuTemplate({}, actions), "open-settings").click();
    expect(actions.openSettings).toHaveBeenCalledTimes(1);
  });

  it("「有効」は Electron が渡す item.checked をそのまま作用に流す", () => {
    const actions = actionsSpy();
    const item = itemById(buildTrayMenuTemplate({ enabled: false }, actions), "enabled");
    item.click({ checked: true });
    expect(actions.setEnabled).toHaveBeenCalledWith(true);
    item.click({ checked: false });
    expect(actions.setEnabled).toHaveBeenLastCalledWith(false);
  });

  it("「自動起動」も item.checked をそのまま流す", () => {
    const actions = actionsSpy();
    const item = itemById(buildTrayMenuTemplate({ openAtLogin: true }, actions), "auto-launch");
    item.click({ checked: false });
    expect(actions.setOpenAtLogin).toHaveBeenCalledWith(false);
    item.click({ checked: true });
    expect(actions.setOpenAtLogin).toHaveBeenLastCalledWith(true);
  });

  it("item が渡らない場合も false として扱い、例外を出さない", () => {
    const actions = actionsSpy();
    const template = buildTrayMenuTemplate({ enabled: true }, actions);
    expect(() => itemById(template, "enabled").click()).not.toThrow();
    expect(actions.setEnabled).toHaveBeenCalledWith(false);
  });

  it("「アップデートを確認」で checkUpdate が呼ばれる", () => {
    const actions = actionsSpy();
    itemById(buildTrayMenuTemplate({}, actions), "check-update").click();
    expect(actions.checkUpdate).toHaveBeenCalledTimes(1);
  });

  it("「終了」で quit が呼ばれる", () => {
    const actions = actionsSpy();
    itemById(buildTrayMenuTemplate({}, actions), "quit").click();
    expect(actions.quit).toHaveBeenCalledTimes(1);
  });

  it("actions 未指定でも click が例外を出さない（起動直後の取りこぼし防止）", () => {
    const template = buildTrayMenuTemplate({ enabled: true });
    for (const entry of template) {
      if (typeof entry.click === "function") expect(() => entry.click({ checked: true })).not.toThrow();
    }
  });

  it("他のトグルを押しても別の作用は呼ばれない", () => {
    const actions = actionsSpy();
    const template = buildTrayMenuTemplate({}, actions);
    itemById(template, "enabled").click({ checked: true });
    expect(actions.setOpenAtLogin).not.toHaveBeenCalled();
    expect(actions.quit).not.toHaveBeenCalled();
    expect(actions.checkUpdate).not.toHaveBeenCalled();
    expect(actions.openSettings).not.toHaveBeenCalled();
  });
});

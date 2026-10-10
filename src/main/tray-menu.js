// トレイのコンテキストメニュー定義。
//
// ネイティブのトレイ widget は macOS / Windows のどちらでも自動操作できない
// （Electron 側に API が無く、Playwright でも届かない）。テストできる形にするため、
// 「どんな項目を出すか」と「押されたら何をするか」だけをここに純関数として切り出し、
// Menu.buildFromTemplate と tray.setContextMenu は main.js に残す。
//
// id を持たせているのは、テストからの項目特定と、将来 clickMenuItemById 系の
// ヘルパを使う場合の入口を兼ねるため。

function buildTrayMenuTemplate(state = {}, actions = {}) {
  const noop = () => {};
  const openSettings = actions.openSettings || noop;
  const setEnabled = actions.setEnabled || noop;
  const setOpenAtLogin = actions.setOpenAtLogin || noop;
  const checkUpdate = actions.checkUpdate || noop;
  const quit = actions.quit || noop;

  return [
    { id: "open-settings", label: "設定を開く", click: () => openSettings() },
    { type: "separator" },
    {
      id: "enabled",
      label: "有効",
      type: "checkbox",
      checked: !!state.enabled,
      click: (item) => setEnabled(!!(item && item.checked)),
    },
    {
      id: "auto-launch",
      label: "自動起動",
      type: "checkbox",
      checked: !!state.openAtLogin,
      click: (item) => setOpenAtLogin(!!(item && item.checked)),
    },
    { type: "separator" },
    { id: "check-update", label: "アップデートを確認", click: () => checkUpdate() },
    { id: "quit", label: "終了", click: () => quit() },
  ];
}

module.exports = { buildTrayMenuTemplate };

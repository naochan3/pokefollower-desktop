const fs = require("node:fs");
const path = require("node:path");
const src = fs.readFileSync(path.join(__dirname, "..", "src", "settings", "settings-preload.js"), "utf8");

test("preload exposes new IPC surfaces", () => {
  expect(src).toContain('getPackMeta: (packKey) => ipcRenderer.invoke("packs:meta", packKey)');
  expect(src).toContain('setNickname: (packKey, name) => ipcRenderer.invoke("nickname:set", { packKey, name })');
  expect(src).toContain('setLead: (packKey) => ipcRenderer.invoke("party:set-lead", packKey)');
});

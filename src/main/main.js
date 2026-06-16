const { app, BrowserWindow } = require("electron");

app.whenReady().then(() => {
  const win = new BrowserWindow({ width: 400, height: 300 });
  win.loadURL("data:text/html,<h1>PokeFollower Desktop OK</h1>");
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

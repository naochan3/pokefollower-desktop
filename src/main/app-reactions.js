const EDITOR_RE = /(code|cursor|studio|vim|emacs|zed|sublime|webstorm|intellij|pycharm|terminal|wezterm|alacritty|powershell|cmd|windows terminal)/i;
const BROWSER_RE = /(chrome|firefox|edge|safari|browser|arc|brave)/i;
const CHAT_RE = /(slack|discord|teams|chat|zoom|meet)/i;

function classifyForegroundApp(info) {
  const name = String((info && (info.cls || info.name || info.appName)) || "").trim();
  if (!name) return "normal";
  if (EDITOR_RE.test(name)) return "focus";
  if (BROWSER_RE.test(name) || CHAT_RE.test(name)) return "friendly";
  return "normal";
}

function reactionModeForForeground(info, { enabled = false, workWatchPhase = "idle" } = {}) {
  if (workWatchPhase === "break") return "break";
  if (workWatchPhase === "work") return "calm";
  if (!enabled) return "normal";
  return classifyForegroundApp(info);
}

module.exports = { classifyForegroundApp, reactionModeForForeground };

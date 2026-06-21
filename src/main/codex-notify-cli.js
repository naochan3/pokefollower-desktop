const { spawn } = require("node:child_process");
const {
  defaultNotificationQueuePath,
  parseCodexPayload,
  writeCodexNotification,
} = require("./notification-queue.js");

function buildNotifyCommandPlan(argv) {
  const forwardIndex = argv.indexOf("--forward");
  let payloadArgs = argv;
  let forward = null;
  if (forwardIndex >= 0) {
    const command = argv[forwardIndex + 1];
    const args = argv.slice(forwardIndex + 2);
    if (command) forward = { command, args };
    payloadArgs = args;
  }
  return {
    payload: parseCodexPayload(payloadArgs),
    forward,
  };
}

function forwardNotification(forward) {
  if (!forward) return;
  try {
    const child = spawn(forward.command, forward.args, {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  } catch (_) {
    // Keep the bridge best-effort so Codex notify cannot be slowed by PokéFollower.
  }
}

function runNotifyCommand(argv = process.argv.slice(2)) {
  const plan = buildNotifyCommandPlan(argv);
  if (plan.payload) writeCodexNotification(defaultNotificationQueuePath(), plan.payload);
  forwardNotification(plan.forward);
}

module.exports = { buildNotifyCommandPlan, forwardNotification, runNotifyCommand };

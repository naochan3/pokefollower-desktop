function waitForProcessExit(child, timeoutMs) {
  if (child.exitCode !== null) return Promise.resolve({ code: child.exitCode, signal: null });
  if (child.signalCode !== null) return Promise.resolve({ code: null, signal: child.signalCode });

  return new Promise((resolve) => {
    let settled = false;
    let timeout;
    const cleanup = () => {
      clearTimeout(timeout);
      child.removeListener("exit", onExit);
      child.removeListener("error", onError);
    };
    const finish = (result) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    const onExit = (code, signal) => finish({ code, signal });
    const onError = (error) => finish({ error: error.message });

    child.once("exit", onExit);
    child.once("error", onError);
    timeout = setTimeout(() => finish(null), timeoutMs);
  });
}

module.exports = waitForProcessExit;

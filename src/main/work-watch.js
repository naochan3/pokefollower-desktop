const PRESETS = {
  "25/5": { workMs: 25 * 60 * 1000, breakMs: 5 * 60 * 1000 },
  "50/10": { workMs: 50 * 60 * 1000, breakMs: 10 * 60 * 1000 },
};

function presetDurations(preset) {
  return PRESETS[preset] || PRESETS["25/5"];
}

function createWorkWatchSession({ preset = "25/5", now = Date.now } = {}) {
  let currentPreset = presetDurations(preset) === PRESETS[preset] ? preset : "25/5";
  let state = { running: false, phase: "stopped", startedAt: 0, phaseEndsAt: 0 };

  function snapshot() {
    return { ...state, preset: currentPreset };
  }

  function start(startNow = now()) {
    const durations = presetDurations(currentPreset);
    state = {
      running: true,
      phase: "work",
      startedAt: startNow,
      phaseEndsAt: startNow + durations.workMs,
    };
    return snapshot();
  }

  function stop() {
    state = { running: false, phase: "stopped", startedAt: 0, phaseEndsAt: 0 };
    return snapshot();
  }

  function setPreset(nextPreset) {
    if (PRESETS[nextPreset]) currentPreset = nextPreset;
    if (state.running) start(now());
    return snapshot();
  }

  function tick(tickNow = now()) {
    if (!state.running || tickNow < state.phaseEndsAt) return { state: snapshot(), event: null };
    const durations = presetDurations(currentPreset);
    if (state.phase === "work") {
      state = {
        running: true,
        phase: "break",
        startedAt: tickNow,
        phaseEndsAt: tickNow + durations.breakMs,
      };
      return { state: snapshot(), event: "break-started" };
    }
    state = {
      running: true,
      phase: "work",
      startedAt: tickNow,
      phaseEndsAt: tickNow + durations.workMs,
    };
    return { state: snapshot(), event: "work-started" };
  }

  return { snapshot, start, stop, setPreset, tick };
}

module.exports = { PRESETS, createWorkWatchSession, presetDurations };

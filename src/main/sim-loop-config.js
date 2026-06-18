const DEFAULT_AC_INTERVAL_MS = 16;
const DEFAULT_BATTERY_INTERVAL_MS = 16;
const MIN_INTERVAL_MS = 4;
const MAX_INTERVAL_MS = 1000;

function parseInterval(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(MAX_INTERVAL_MS, Math.max(MIN_INTERVAL_MS, Math.round(n)));
}

function getSimIntervalMs({ env = process.env, isOnBattery = false } = {}) {
  const override = parseInterval(env.POKEFOLLOWER_SIM_INTERVAL_MS);
  if (override != null) return override;
  return isOnBattery ? DEFAULT_BATTERY_INTERVAL_MS : DEFAULT_AC_INTERVAL_MS;
}

module.exports = {
  DEFAULT_AC_INTERVAL_MS,
  DEFAULT_BATTERY_INTERVAL_MS,
  getSimIntervalMs,
  parseInterval,
};

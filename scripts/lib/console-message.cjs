function readConsoleMessage(event, legacyLevelOrDetails, legacyMessage) {
  const secondaryDetails = legacyLevelOrDetails && typeof legacyLevelOrDetails === "object"
    ? legacyLevelOrDetails
    : null;
  const details = secondaryDetails || event || {};
  const level = details.level ?? legacyLevelOrDetails;
  const message = details.message ?? legacyMessage;
  return {
    level,
    message: String(message ?? ""),
    isError: level === "error" || level === 3,
  };
}

module.exports = readConsoleMessage;

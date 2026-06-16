function screenPointToOverlay(point, bounds) {
  return { x: point.x - bounds.x, y: point.y - bounds.y };
}

module.exports = { screenPointToOverlay };

const path = require("node:path");

function isInsideRoot(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveAppProtocolPath(root, requestUrl) {
  const url = new URL(requestUrl);
  const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const rootPath = path.resolve(root);
  const assetsRoot = path.join(rootPath, "assets");
  const filePath = path.resolve(rootPath, rel);
  if (!isInsideRoot(assetsRoot, filePath)) return null;
  return filePath;
}

module.exports = { resolveAppProtocolPath, isInsideRoot };

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const lock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "ci.yml"), "utf8");
const errors = [];

function expect(condition, message) {
  if (!condition) errors.push(message);
}

function depSpec(section, name) {
  return pkg[section] && pkg[section][name];
}

const rootLock = lock.packages?.[""] || {};
expect(lock.name === pkg.name, "package-lock root name must match package.json");
expect(lock.version === pkg.version, "package-lock root version must match package.json");
expect(rootLock.name === pkg.name, 'package-lock packages[""].name must match package.json');
expect(rootLock.version === pkg.version, 'package-lock packages[""].version must match package.json');
expect(rootLock.engines?.node === pkg.engines?.node, 'package-lock packages[""].engines.node must match package.json');

for (const [section, names] of [
  ["dependencies", ["koffi"]],
  ["devDependencies", ["electron", "electron-builder", "vitest"]],
]) {
  for (const name of names) {
    expect(rootLock[section]?.[name] === depSpec(section, name), `package-lock ${section}.${name} must match package.json`);
  }
}

expect(pkg.engines?.node === ">=22.12.0", "package.json engines.node must remain >=22.12.0");
expect(workflow.includes('NODE_VERSION: "22.12.0"'), "CI NODE_VERSION must remain 22.12.0");
expect(lock.lockfileVersion === 3, "package-lock lockfileVersion must remain 3");
expect(lock.packages?.["node_modules/electron"]?.version === "42.4.1", "locked electron version must remain 42.4.1");
expect(lock.packages?.["node_modules/electron-builder"]?.version === "26.15.3", "locked electron-builder version must remain 26.15.3");
expect(lock.packages?.["node_modules/vitest"]?.version === "4.1.9", "locked vitest version must remain 4.1.9");
expect(lock.packages?.["node_modules/koffi"]?.version === "3.0.2", "locked koffi version must remain 3.0.2");

if (errors.length > 0) {
  for (const error of errors) console.error(`[verify-dependency-metadata] ${error}`);
  process.exit(1);
}

console.log("[verify-dependency-metadata] ok: package metadata, lockfile, and CI Node version are consistent");

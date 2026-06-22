const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const docPath = path.join(root, "docs", "feature-development-governance.md");
const templatePath = path.join(root, ".github", "ISSUE_TEMPLATE", "feature-experiment.yml");
const doc = fs.readFileSync(docPath, "utf8");
const template = fs.readFileSync(templatePath, "utf8");
const errors = [];

function expect(condition, message) {
  if (!condition) errors.push(message);
}

function expectIncludes(source, label, snippets) {
  for (const snippet of snippets) {
    expect(source.includes(snippet), `${label} missing: ${snippet}`);
  }
}

function normalizeYamlListItem(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("- ")) return null;
  return trimmed
    .slice(2)
    .trim()
    .replace(/^["']|["']$/g, "");
}

function readTopLevelList(source, key) {
  const lines = source.split(/\r?\n/);
  const keyIndex = lines.findIndex((line) => line.trim() === `${key}:`);
  if (keyIndex === -1) return [];
  const values = [];
  for (let i = keyIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\S/.test(line) && line.trim().endsWith(":")) break;
    const value = normalizeYamlListItem(line);
    if (value) values.push(value);
  }
  return values;
}

function readIssueBodyBlocks(source) {
  const blocks = [];
  let current = null;

  for (const line of source.split(/\r?\n/)) {
    if (/^  - type: /.test(line)) {
      current = {
        type: line.split(":").slice(1).join(":").trim(),
        id: null,
        required: false,
        options: [],
        inOptions: false,
      };
      blocks.push(current);
      continue;
    }
    if (!current) continue;
    const trimmed = line.trim();
    if (trimmed.startsWith("id: ")) {
      current.id = trimmed.slice("id: ".length).trim();
      current.inOptions = false;
      continue;
    }
    if (trimmed === "options:") {
      current.inOptions = true;
      continue;
    }
    if (/^[a-z_]+:/.test(trimmed) && trimmed !== "options:") {
      current.inOptions = false;
    }
    if (current.inOptions) {
      const value = normalizeYamlListItem(line);
      if (value) current.options.push(value);
    }
    if (trimmed === "required: true") {
      current.required = true;
    }
  }

  return blocks;
}

const templateLabels = readTopLevelList(template, "labels");
const templateFields = new Map(readIssueBodyBlocks(template).filter((block) => block.id).map((block) => [block.id, block]));

expectIncludes(doc, "governance doc", [
  "実装と検証は前に進める。ローンチ判断は別ゲートで行う。",
  "「検証完了」は「リリース可能」と同義ではない。",
  "PdM GO / NO-GO 判断",
  "## Triage 手順",
  "PdM 判断コメントを Issue に残す。",
  "## PdM 判断",
  "- 判断: GO / NO-GO / 保留",
  "Release notes や README のユーザー向け訴求は、`launch-approved` になるまで追加しない。",
  "`npm run verify:local` と対象 OS の package smoke を再実行する。",
]);

for (const state of [
  "idea",
  "experiment-ready",
  "implemented",
  "validated",
  "launch-approved",
  "released",
  "parked",
]) {
  expect(doc.includes(`\`${state}\``), `governance doc must define state ${state}`);
}

for (const label of [
  "feature:idea",
  "feature:experiment",
  "feature:validated",
  "feature:launch-approved",
  "feature:parked",
  "risk:performance",
  "risk:privacy",
  "risk:release",
]) {
  expect(doc.includes(`\`${label}\``), `governance doc must define label ${label}`);
}

expectIncludes(template, "feature issue template", [
  "name: 機能候補 / 検証",
  "ユーザーへローンチするかは、検証完了後に別途 PdM 判断します。",
  "id: value",
  "id: scope",
  "id: current_state",
  "id: launch_decision",
  "id: validation",
  "id: risks",
  "id: done",
  "- 未判断",
  "- GO: launch-approved に進める",
  "- NO-GO: parked にする",
  "- 保留: validated のまま再判断",
  "`npm run verify:local` を通す",
  "既定 OFF または既存ユーザーに影響しない導線にする",
]);

for (const label of ["enhancement", "feature:idea"]) {
  expect(templateLabels.includes(label), `feature issue template must apply ${label} label`);
}

const stateField = templateFields.get("current_state");
expect(Boolean(stateField), "feature issue template must define current_state field");
if (stateField) {
  for (const state of ["idea", "experiment-ready", "implemented", "validated", "launch-approved", "parked"]) {
    expect(stateField.options.includes(state), `current_state field must include ${state}`);
  }
}

const launchDecisionField = templateFields.get("launch_decision");
expect(Boolean(launchDecisionField), "feature issue template must define launch_decision field");
if (launchDecisionField) {
  for (const option of [
    "未判断",
    "GO: launch-approved に進める",
    "NO-GO: parked にする",
    "保留: validated のまま再判断",
  ]) {
    expect(launchDecisionField.options.includes(option), `launch_decision field must include ${option}`);
  }
}

for (const requiredId of ["value", "scope", "current_state", "launch_decision", "risks", "done"]) {
  const block = templateFields.get(requiredId);
  expect(Boolean(block), `feature issue template field ${requiredId} must exist`);
  if (block) expect(block.required, `feature issue template field ${requiredId} must be required`);
}

if (errors.length > 0) {
  for (const error of errors) console.error(`[verify-feature-development-governance] ${error}`);
  process.exit(1);
}

console.log("[verify-feature-development-governance] ok: feature governance doc and issue template are aligned");

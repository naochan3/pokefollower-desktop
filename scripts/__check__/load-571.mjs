#!/usr/bin/env node
/**
 * Programmatic load check for dex 571 (Zoroark).
 *
 * Uses pack-reader.js to load the pack and asserts:
 *   - states.idle, states.walk, states.sleep all present
 *   - each state has 8-direction rows (front, frontRight, right, backRight,
 *     back, backLeft, left, frontLeft)
 *
 * Usage: node scripts/__check__/load-571.mjs
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', '..');
const require = createRequire(import.meta.url);

const { makePackReader } = require(path.join(root, 'src', 'main', 'pack-reader.js'));
const reader = makePackReader(root);

const PACK_KEY = 'retro/gen-5/571-zoroark';
const EXPECTED_STATES = ['idle', 'walk', 'sleep'];
const EXPECTED_DIRS = ['front', 'frontRight', 'right', 'backRight', 'back', 'backLeft', 'left', 'frontLeft'];

let failures = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  FAIL: ${message}`);
    failures++;
  }
}

console.log(`Loading pack: ${PACK_KEY}`);
let meta;
try {
  const result = reader.readPackMeta(PACK_KEY);
  meta = result.meta;
  console.log(`  resolvedKey: ${result.resolvedKey}`);
} catch (err) {
  console.error(`  FAIL: readPackMeta threw: ${err.message}`);
  process.exit(1);
}

// Check top-level fields
assert(meta.name === '571-zoroark', `name should be "571-zoroark", got "${meta.name}"`);
assert(meta.generation === 'gen-5', `generation should be "gen-5", got "${meta.generation}"`);
assert(meta.rawPath === 'gen-5/571-zoroark', `rawPath should be "gen-5/571-zoroark", got "${meta.rawPath}"`);

// Check all three states exist
for (const stateName of EXPECTED_STATES) {
  const state = meta.states?.[stateName];
  assert(state != null, `states.${stateName} should exist`);
  if (!state) continue;

  assert(typeof state.sheet === 'string' && state.sheet.length > 0, `states.${stateName}.sheet should be a non-empty string`);
  assert(typeof state.fps === 'number' && state.fps > 0, `states.${stateName}.fps should be > 0, got ${state.fps}`);
  assert(typeof state.frames === 'number' && state.frames > 0, `states.${stateName}.frames should be > 0, got ${state.frames}`);
  assert(state.frame?.w > 0, `states.${stateName}.frame.w should be > 0`);
  assert(state.frame?.h > 0, `states.${stateName}.frame.h should be > 0`);

  // 8-direction rows check
  assert(state.rows != null, `states.${stateName}.rows should exist`);
  if (state.rows) {
    for (const dir of EXPECTED_DIRS) {
      assert(dir in state.rows, `states.${stateName}.rows.${dir} should exist`);
    }
    const rowCount = Object.keys(state.rows).length;
    assert(rowCount === 8, `states.${stateName}.rows should have exactly 8 directions, got ${rowCount}`);
  }
}

if (failures === 0) {
  console.log(`\nOK: pack 571-zoroark loaded, 3 states (idle/walk/sleep), 8 rows each`);
  console.log(`  idle  : fps=${meta.states.idle?.fps}, frames=${meta.states.idle?.frames}, frame=${JSON.stringify(meta.states.idle?.frame)}`);
  console.log(`  walk  : fps=${meta.states.walk?.fps}, frames=${meta.states.walk?.frames}, frame=${JSON.stringify(meta.states.walk?.frame)}`);
  console.log(`  sleep : fps=${meta.states.sleep?.fps}, frames=${meta.states.sleep?.frames}, frame=${JSON.stringify(meta.states.sleep?.frame)}`);
} else {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}

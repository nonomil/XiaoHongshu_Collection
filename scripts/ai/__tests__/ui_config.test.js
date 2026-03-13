const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { loadUiConfig, mergeUiConfig, saveUiConfig } = require('../../lib/ui_config');

const tmpDir = path.join(__dirname, '..', '__tmp__', 'ui-config');
const cfgPath = path.join(tmpDir, 'ui.json');

function resetTmp() {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });
}

test('loadUiConfig returns defaults when missing', () => {
  resetTmp();
  const cfg = loadUiConfig({ configPath: cfgPath });
  assert.equal(cfg._missing, true);
  assert.ok(cfg.paths);
  assert.equal(cfg.naming.conflictStrategy, 'overwrite');
});

test('mergeUiConfig overlays user values', () => {
  const base = { paths: { saveLinksOutputRoot: 'A' }, runtime: { aiSummaryEnabled: true } };
  const override = { paths: { saveLinksOutputRoot: 'B' }, runtime: { aiSummaryEnabled: false } };
  const merged = mergeUiConfig(base, override);
  assert.equal(merged.paths.saveLinksOutputRoot, 'B');
  assert.equal(merged.runtime.aiSummaryEnabled, false);
});

test('saveUiConfig writes json file', () => {
  resetTmp();
  const payload = { paths: { saveLinksOutputRoot: 'X' } };
  saveUiConfig({ configPath: cfgPath, payload });
  const stored = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
  assert.equal(stored.paths.saveLinksOutputRoot, 'X');
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { loadUiConfig, mergeUiConfig, saveUiConfig } = require('../../lib/ui_config');
const { resolveTestTmpDir } = require('./test_tmp');

const tmpDir = resolveTestTmpDir('ui-config');
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
  assert.ok(cfg.browser);
  assert.equal(cfg.browser.mode, 'isolated');
  assert.equal(cfg.browser.channel, 'stable');
  assert.equal(cfg.browser.headless, false);
  assert.equal(cfg.naming.conflictStrategy, 'overwrite');
  assert.equal(cfg.pushbullet, undefined);
  assert.ok(cfg.inbox);
  assert.deepEqual(cfg.inbox.categories, {});
  assert.equal(cfg.runtime.autoClassifyLinksEnabled, true);
});

test('loadUiConfig provides inbox categories defaults', () => {
  resetTmp();
  const cfg = loadUiConfig({ configPath: cfgPath });
  assert.ok(cfg.inbox);
  assert.deepEqual(cfg.inbox.categories, {});
});

test('mergeUiConfig overlays user values', () => {
  const base = {
    paths: { saveLinksOutputRoot: 'A' },
    browser: { mode: 'isolated', channel: 'stable' },
    runtime: { aiSummaryEnabled: true }
  };
  const override = {
    paths: { saveLinksOutputRoot: 'B' },
    browser: { mode: 'current-browser', channel: 'beta' },
    runtime: { aiSummaryEnabled: false }
  };
  const merged = mergeUiConfig(base, override);
  assert.equal(merged.paths.saveLinksOutputRoot, 'B');
  assert.equal(merged.browser.mode, 'current-browser');
  assert.equal(merged.browser.channel, 'beta');
  assert.equal(merged.runtime.aiSummaryEnabled, false);
});

test('mergeUiConfig overlays auto classify runtime flag', () => {
  const merged = mergeUiConfig(
    { runtime: { autoClassifyLinksEnabled: true } },
    { runtime: { autoClassifyLinksEnabled: false } }
  );

  assert.equal(merged.runtime.autoClassifyLinksEnabled, false);
});

test('mergeUiConfig overlays browser headless flag', () => {
  const merged = mergeUiConfig(
    { browser: { headless: false } },
    { browser: { headless: true } }
  );

  assert.equal(merged.browser.headless, true);
});

test('saveUiConfig writes json file', () => {
  resetTmp();
  const payload = { paths: { saveLinksOutputRoot: 'X' } };
  saveUiConfig({ configPath: cfgPath, payload });
  const stored = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
  assert.equal(stored.paths.saveLinksOutputRoot, 'X');
});

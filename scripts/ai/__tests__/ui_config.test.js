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
  assert.equal(cfg.browser.mode, 'current-browser');
  assert.equal(cfg.browser.channel, 'stable');
  assert.equal(cfg.browser.headless, false);
  assert.equal(cfg.naming.conflictStrategy, 'overwrite');
  assert.equal(cfg.pushbullet, undefined);
  assert.ok(cfg.inbox);
  assert.deepEqual(cfg.inbox.categories, {});
  assert.equal(cfg.runtime.autoClassifyLinksEnabled, true);
  assert.equal(cfg.runtime.openRouterBaseUrl, '');
  assert.equal(cfg.runtime.openRouterModel, '');
  assert.equal(cfg.runtime.hasOpenRouterApiKey, false);
});

test('loadUiConfig provides inbox categories defaults', () => {
  resetTmp();
  const cfg = loadUiConfig({ configPath: cfgPath });
  assert.ok(cfg.inbox);
  assert.deepEqual(cfg.inbox.categories, {});
});

test('loadUiConfig provides ingress defaults', () => {
  resetTmp();
  const cfg = loadUiConfig({ configPath: cfgPath });
  assert.ok(cfg.ingress);
  assert.equal(cfg.ingress.localBaseUrl, 'http://127.0.0.1:3030');
  assert.equal(cfg.ingress.cloudBaseUrl, '');
  assert.equal(cfg.ingress.defaultRoute, 'local');
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

test('mergeUiConfig overlays ingress settings', () => {
  const merged = mergeUiConfig(
    {
      ingress: {
        localBaseUrl: 'http://127.0.0.1:3030',
        defaultRoute: 'local'
      }
    },
    {
      ingress: {
        cloudBaseUrl: 'https://example.com',
        defaultRoute: 'cloud'
      }
    }
  );

  assert.equal(merged.ingress.localBaseUrl, 'http://127.0.0.1:3030');
  assert.equal(merged.ingress.cloudBaseUrl, 'https://example.com');
  assert.equal(merged.ingress.defaultRoute, 'cloud');
});

test('mergeUiConfig overlays ai runtime api fields', () => {
  const merged = mergeUiConfig(
    {
      runtime: {
        openRouterBaseUrl: 'https://openrouter.ai/api/v1',
        openRouterModel: 'openrouter/free',
        hasOpenRouterApiKey: false
      }
    },
    {
      runtime: {
        openRouterBaseUrl: 'http://127.0.0.1:12345/v1',
        openRouterModel: 'local-test-model',
        hasOpenRouterApiKey: true
      }
    }
  );

  assert.equal(merged.runtime.openRouterBaseUrl, 'http://127.0.0.1:12345/v1');
  assert.equal(merged.runtime.openRouterModel, 'local-test-model');
  assert.equal(merged.runtime.hasOpenRouterApiKey, true);
});

test('saveUiConfig writes json file', () => {
  resetTmp();
  const payload = { paths: { saveLinksOutputRoot: 'X' } };
  saveUiConfig({ configPath: cfgPath, payload });
  const stored = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
  assert.equal(stored.paths.saveLinksOutputRoot, 'X');
});

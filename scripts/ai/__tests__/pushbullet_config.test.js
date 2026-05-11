const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { loadPushbulletConfig } = require('../../lib/pushbullet_config');
const { resolveTestTmpDir } = require('./test_tmp');

const tmpDir = resolveTestTmpDir('pushbullet-config');
const configPath = path.join(tmpDir, 'pushbullet.json');

function resetTmp() {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });
}

test('loadPushbulletConfig returns defaults when missing', () => {
  resetTmp();
  const cfg = loadPushbulletConfig({ configPath });
  assert.equal(cfg._missing, true);
  assert.equal(cfg.enabled, false);
  assert.equal(cfg.accessToken, '');
  assert.equal(cfg.lastModified, 0);
  assert.match(cfg.inboxPath, /data[\\/]+inbox_links\.jsonl$/);
  assert.equal(cfg.maxPages, 50);
  assert.equal(cfg.bootstrapMaxPages, 200);
  assert.equal(cfg.pageLimit, 500);
});

test('loadPushbulletConfig migrates plain text token to json', () => {
  resetTmp();
  fs.writeFileSync(configPath, 'token-123', 'utf-8');
  const cfg = loadPushbulletConfig({ configPath });
  assert.equal(cfg.accessToken, 'token-123');
  const stored = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  assert.equal(stored.accessToken, 'token-123');
  assert.equal(stored.enabled, true);
  assert.equal(stored.lastModified, 0);
  assert.equal(stored.maxPages, 50);
  assert.equal(stored.bootstrapMaxPages, 200);
  assert.equal(stored.pageLimit, 500);
});

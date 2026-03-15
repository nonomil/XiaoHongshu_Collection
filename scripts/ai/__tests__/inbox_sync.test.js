const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { syncInbox } = require('../../lib/inbox_sync');
const { resolveTestTmpDir } = require('./test_tmp');

const tmpDir = resolveTestTmpDir('inbox-sync');
const pushbulletConfigPath = path.join(tmpDir, 'pushbullet.json');

function resetTmp() {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });
}

test('syncInbox updates lastModified in pushbullet config', async () => {
  resetTmp();
  fs.writeFileSync(pushbulletConfigPath, JSON.stringify({
    enabled: true,
    accessToken: 'token',
    lastModified: 0,
    inboxPath: 'data/inbox.jsonl'
  }, null, 2), 'utf-8');

  await syncInbox({
    pushbulletConfigPath,
    providerFactory: () => ({
      pull: async () => ({ items: [], nextModified: 10 })
    }),
    storeFactory: () => ({
      append: async () => ({ added: 0, skipped: 0 })
    })
  });

  const stored = JSON.parse(fs.readFileSync(pushbulletConfigPath, 'utf-8'));
  assert.equal(stored.lastModified, 10);
});

test('syncInbox uses since=0 for full sync', async () => {
  resetTmp();
  fs.writeFileSync(pushbulletConfigPath, JSON.stringify({
    enabled: true,
    accessToken: 'token',
    lastModified: 999,
    inboxPath: 'data/inbox.jsonl'
  }, null, 2), 'utf-8');

  let capturedSince = null;
  await syncInbox({
    pushbulletConfigPath,
    mode: 'all',
    providerFactory: () => ({
      pull: async ({ since }) => {
        capturedSince = since;
        return { items: [], nextModified: 10 };
      }
    }),
    storeFactory: () => ({
      append: async () => ({ added: 0, skipped: 0 })
    })
  });

  assert.equal(capturedSince, 0);
});

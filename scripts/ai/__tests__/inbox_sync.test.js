const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { syncInbox } = require('../../lib/inbox_sync');

const tmpDir = path.join(__dirname, '..', '__tmp__', 'inbox-sync');
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

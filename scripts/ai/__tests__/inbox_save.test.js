const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { loadInboxUrls, saveInboxUrls } = require('../../lib/inbox_save');

const tmpDir = path.join(__dirname, '..', '__tmp__', 'inbox-save');
const inboxPath = path.join(tmpDir, 'inbox.jsonl');
const pushbulletConfigPath = path.join(tmpDir, 'pushbullet.json');

function resetTmp() {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });
}

test('loadInboxUrls de-duplicates urls', async () => {
  resetTmp();
  const lines = [
    JSON.stringify({ url: 'https://a.com' }),
    JSON.stringify({ url: 'https://b.com' }),
    JSON.stringify({ url: 'https://a.com' }),
    JSON.stringify({ url: '' }),
    'not-json'
  ].join('\n') + '\n';
  fs.writeFileSync(inboxPath, lines, 'utf-8');

  const urls = await loadInboxUrls({ inboxPath });
  assert.deepEqual(urls, ['https://a.com', 'https://b.com']);
});

test('saveInboxUrls uses inbox urls and saveLinksText', async () => {
  resetTmp();
  const lines = [
    JSON.stringify({ url: 'https://a.com' }),
    JSON.stringify({ url: 'https://b.com' })
  ].join('\n') + '\n';
  fs.writeFileSync(inboxPath, lines, 'utf-8');
  fs.writeFileSync(pushbulletConfigPath, JSON.stringify({
    enabled: true,
    accessToken: 'token',
    lastModified: 0,
    inboxPath
  }, null, 2), 'utf-8');

  let captured = '';
  const result = await saveInboxUrls({
    pushbulletConfigPath,
    saveLinksText: async (text) => {
      captured = text;
      return { total: 2, successCount: 2, failureCount: 0, results: [] };
    }
  });

  assert.equal(captured, 'https://a.com\nhttps://b.com');
  assert.equal(result.total, 2);
});

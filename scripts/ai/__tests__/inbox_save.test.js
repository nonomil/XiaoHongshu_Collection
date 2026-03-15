const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { loadInboxUrls, saveInboxUrls } = require('../../lib/inbox_save');
const { resolveTestTmpDir } = require('./test_tmp');

const tmpDir = resolveTestTmpDir('inbox-save');
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

test('saveInboxUrls injects inbox output root and classifier', async () => {
  resetTmp();
  const lines = [
    JSON.stringify({ url: 'https://a.com' })
  ].join('\n') + '\n';
  fs.writeFileSync(inboxPath, lines, 'utf-8');
  fs.writeFileSync(pushbulletConfigPath, JSON.stringify({
    enabled: true,
    accessToken: 'token',
    lastModified: 0,
    inboxPath
  }, null, 2), 'utf-8');

  let seenOptions = null;
  await saveInboxUrls({
    pushbulletConfigPath,
    saveLinksText: async (_text, options = {}) => {
      seenOptions = options;
      return { total: 1, successCount: 1, failureCount: 0, results: [] };
    }
  });

  assert.ok(seenOptions);
  assert.match(seenOptions.outputRoot, /收件箱同步/);
  assert.equal(typeof seenOptions.collectionResolver, 'function');
});

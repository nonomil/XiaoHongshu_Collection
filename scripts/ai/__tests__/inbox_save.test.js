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

  const captured = [];
  const result = await saveInboxUrls({
    pushbulletConfigPath,
    saveLinksText: async (text) => {
      captured.push(text);
      return {
        total: 1,
        successCount: 1,
        failureCount: 0,
        results: [{ status: 'success', input: text, filepath: `G:/output/${captured.length}.md` }]
      };
    }
  });

  assert.deepEqual(captured, ['https://a.com', 'https://b.com']);
  assert.equal(result.total, 2);
  assert.equal(result.summary.successCount, 2);
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

test('saveInboxUrls uses explicitly provided urls instead of the full inbox file', async () => {
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

  const captured = [];
  const result = await saveInboxUrls({
    pushbulletConfigPath,
    urls: ['https://mp.weixin.qq.com/s/demo'],
    saveLinksText: async (text) => {
      captured.push(text);
      return {
        total: 1,
        successCount: 1,
        failureCount: 0,
        results: [{ status: 'success', input: text, filepath: 'G:/output/demo.md' }]
      };
    }
  });

  assert.deepEqual(captured, ['https://mp.weixin.qq.com/s/demo']);
  assert.equal(result.total, 1);
  assert.equal(result.summary.total, 1);
});

test('saveInboxUrls reports unsupported urls as failures and continues supported saves', async () => {
  resetTmp();
  fs.writeFileSync(pushbulletConfigPath, JSON.stringify({
    enabled: true,
    accessToken: 'token',
    lastModified: 0,
    inboxPath
  }, null, 2), 'utf-8');

  const result = await saveInboxUrls({
    pushbulletConfigPath,
    urls: [
      'https://unsupported.example/item',
      'https://mp.weixin.qq.com/s/demo'
    ],
    saveLinksText: async (text) => {
      if (text.includes('unsupported.example')) {
        throw new Error('Unsupported note input: expected a Xiaohongshu note URL or share text');
      }
      return {
        total: 1,
        successCount: 1,
        failureCount: 0,
        results: [{ status: 'success', input: text, filepath: 'G:/output/demo.md' }]
      };
    }
  });

  assert.equal(result.total, 2);
  assert.equal(result.summary.total, 2);
  assert.equal(result.summary.successCount, 1);
  assert.equal(result.summary.failureCount, 1);
  assert.equal(result.summary.results[0].status, 'failed');
  assert.equal(result.summary.results[0].input, 'https://unsupported.example/item');
  assert.equal(result.summary.results[1].status, 'success');
});

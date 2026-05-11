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
    JSON.stringify({ url: 'https://a.com', timestamp: 1714521600 })
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
  assert.match(seenOptions.outputRoot, /收件箱同步[\\/]+2024[\\/]+2024-05$/);
  assert.equal(typeof seenOptions.collectionResolver, 'function');
  assert.equal(seenOptions.conflictStrategy, 'content-aware');
  assert.deepEqual(seenOptions.mirrorTargets, [
    {
      outputRoot: seenOptions.outputRoot,
      collection: '全部'
    }
  ]);
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

test('saveInboxUrls uses the current month bucket when explicit urls have no inbox timestamp', async () => {
  resetTmp();
  fs.writeFileSync(pushbulletConfigPath, JSON.stringify({
    enabled: true,
    accessToken: 'token',
    lastModified: 0,
    inboxPath
  }, null, 2), 'utf-8');

  let seenOptions = null;
  await saveInboxUrls({
    pushbulletConfigPath,
    urls: ['https://mp.weixin.qq.com/s/demo'],
    now: new Date('2026-04-08T10:00:00+08:00'),
    saveLinksText: async (_text, options = {}) => {
      seenOptions = options;
      return {
        total: 1,
        successCount: 1,
        failureCount: 0,
        results: [{ status: 'success', filepath: 'G:/output/demo.md' }]
      };
    }
  });

  assert.ok(seenOptions);
  assert.match(seenOptions.outputRoot, /收件箱同步[\\/]+2026[\\/]+2026-04$/);
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

test('saveInboxUrls emits progress events for each inbox item', async () => {
  resetTmp();
  fs.writeFileSync(pushbulletConfigPath, JSON.stringify({
    enabled: true,
    accessToken: 'token',
    lastModified: 0,
    inboxPath
  }, null, 2), 'utf-8');

  const events = [];
  const result = await saveInboxUrls({
    pushbulletConfigPath,
    urls: ['https://mp.weixin.qq.com/s/demo-a', 'https://mp.weixin.qq.com/s/demo-b'],
    onProgress: (event) => events.push(event),
    saveLinksText: async (text) => ({
      total: 1,
      successCount: 1,
      failureCount: 0,
      results: [{ status: 'success', input: text, filepath: `G:/output/${encodeURIComponent(text)}.md` }]
    })
  });

  assert.equal(result.total, 2);
  assert.equal(events[0].type, 'start');
  assert.equal(events[0].total, 2);
  assert.equal(events[0].targets.length, 2);
  assert.equal(events[1].type, 'tick');
  assert.equal(events[1].index, 0);
  assert.equal(events[2].type, 'progress');
  assert.equal(events[2].index, 0);
  assert.equal(events[2].result.status, 'success');
  assert.equal(events[3].type, 'tick');
  assert.equal(events[4].type, 'progress');
  assert.equal(events[4].index, 1);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { createInboxStore } = require('../../lib/inbox_store');
const { resolveTestTmpDir } = require('./test_tmp');

const tmpDir = resolveTestTmpDir('inbox-store');
const filePath = path.join(tmpDir, 'inbox.jsonl');

function resetTmp() {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });
}

test('inbox store appends and reads items', async () => {
  resetTmp();
  const store = createInboxStore({ filePath });
  await store.append([{ url: 'https://example.com', source: 'pushbullet', timestamp: 1 }]);
  const items = await store.readAll();
  assert.equal(items.length, 1);
  assert.equal(items[0].url, 'https://example.com');
});

test('inbox store de-duplicates by url', async () => {
  resetTmp();
  const store = createInboxStore({ filePath });
  await store.append([{ url: 'https://example.com', source: 'pushbullet', timestamp: 1 }]);
  await store.append([{ url: 'https://example.com', source: 'pushbullet', timestamp: 2 }]);
  const items = await store.readAll();
  assert.equal(items.length, 1);
});

test('inbox store mirrors added items into monthly archive buckets', async () => {
  resetTmp();
  const archiveRoot = path.join(tmpDir, 'archive');
  const store = createInboxStore({ filePath, archiveRoot });
  await store.append([
    { url: 'https://example.com/a', source: 'pushbullet', timestamp: 1714521600 }
  ]);

  const archivePath = path.join(archiveRoot, '2024', '2024-05.jsonl');
  assert.equal(fs.existsSync(archivePath), true);
  const lines = fs.readFileSync(archivePath, 'utf-8').trim().split(/\r?\n/);
  assert.equal(lines.length, 1);
  const payload = JSON.parse(lines[0]);
  assert.equal(payload.url, 'https://example.com/a');
});

test('inbox store preserves ingress metadata fields', async () => {
  resetTmp();
  const store = createInboxStore({ filePath });
  await store.append([{
    url: 'https://example.com/ingress',
    source: 'feishu',
    route: 'cloud',
    delivery_mode: 'queue',
    requested_at: '2026-04-08T10:00:00.000Z',
    metadata: {
      page_title: '标题'
    }
  }]);

  const items = await store.readAll();
  assert.equal(items.length, 1);
  assert.equal(items[0].route, 'cloud');
  assert.equal(items[0].delivery_mode, 'queue');
  assert.equal(items[0].requested_at, '2026-04-08T10:00:00.000Z');
  assert.deepEqual(items[0].metadata, { page_title: '标题' });
});

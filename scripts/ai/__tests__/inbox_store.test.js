const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { createInboxStore } = require('../../lib/inbox_store');

const tmpDir = path.join(__dirname, '..', '__tmp__', 'inbox-store');
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

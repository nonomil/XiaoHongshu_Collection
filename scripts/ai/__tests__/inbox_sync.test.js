const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { parseArgs, run } = require('../../inbox_sync');
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

test('syncInbox returns mode/since and preserves provider warnings', async () => {
  resetTmp();
  fs.writeFileSync(pushbulletConfigPath, JSON.stringify({
    enabled: true,
    accessToken: 'token',
    lastModified: 123,
    inboxPath: 'data/inbox.jsonl'
  }, null, 2), 'utf-8');

  const result = await syncInbox({
    pushbulletConfigPath,
    mode: 'latest',
    providerFactory: () => ({
      pull: async ({ since }) => ({
        items: [{ url: 'https://example.com' }],
        nextModified: Number(since) + 10,
        truncated: true,
        warning: 'mock warning'
      })
    }),
    storeFactory: () => ({
      append: async () => ({ added: 1, skipped: 0 })
    })
  });

  assert.equal(result.mode, 'latest');
  assert.equal(result.since, 123);
  assert.equal(result.nextModified, 133);
  assert.equal(result.truncated, true);
  assert.equal(result.warning, 'mock warning');
});

test('syncInbox recent mode does not advance lastModified and returns limit', async () => {
  resetTmp();
  fs.writeFileSync(pushbulletConfigPath, JSON.stringify({
    enabled: true,
    accessToken: 'token',
    lastModified: 321,
    inboxPath: 'data/inbox.jsonl'
  }, null, 2), 'utf-8');

  let capturedArgs;
  const result = await syncInbox({
    pushbulletConfigPath,
    mode: 'recent',
    limit: 20,
    providerFactory: () => ({
      pull: async (args) => {
        capturedArgs = args;
        return {
          items: [{ url: 'https://example.com/recent' }],
          nextModified: 999
        };
      }
    }),
    storeFactory: () => ({
      append: async () => ({ added: 1, skipped: 0 })
    })
  });

  const stored = JSON.parse(fs.readFileSync(pushbulletConfigPath, 'utf-8'));
  assert.equal(capturedArgs.since, 0);
  assert.equal(capturedArgs.maxItems, 20);
  assert.equal(result.mode, 'recent');
  assert.equal(result.limit, 20);
  assert.equal(stored.lastModified, 321);
});

test('syncInbox recent mode returns pulled urls for follow-up save', async () => {
  resetTmp();
  fs.writeFileSync(pushbulletConfigPath, JSON.stringify({
    enabled: true,
    accessToken: 'token',
    lastModified: 321,
    inboxPath: 'data/inbox.jsonl'
  }, null, 2), 'utf-8');

  const result = await syncInbox({
    pushbulletConfigPath,
    mode: 'recent',
    limit: 2,
    providerFactory: () => ({
      pull: async () => ({
        items: [
          { url: 'http://xhslink.com/o/abc' },
          { url: 'https://mp.weixin.qq.com/s/demo' }
        ],
        nextModified: 999
      })
    }),
    storeFactory: () => ({
      append: async () => ({ added: 1, skipped: 1 })
    })
  });

  assert.deepEqual(result.urls, [
    'http://xhslink.com/o/abc',
    'https://mp.weixin.qq.com/s/demo'
  ]);
});

test('syncInbox window mode uses time window since, filters old items, and does not advance lastModified', async () => {
  resetTmp();
  fs.writeFileSync(pushbulletConfigPath, JSON.stringify({
    enabled: true,
    accessToken: 'token',
    lastModified: 321,
    inboxPath: 'data/inbox.jsonl'
  }, null, 2), 'utf-8');

  let capturedArgs;
  let appendedItems = [];
  const now = new Date('2026-04-12T18:20:00+08:00');
  const expectedSince = Math.trunc(Date.parse('2026-04-12T00:00:00+08:00') / 1000);
  const result = await syncInbox({
    pushbulletConfigPath,
    mode: 'window',
    timeWindow: {
      preset: 'today'
    },
    now,
    providerFactory: () => ({
      pull: async (args) => {
        capturedArgs = args;
        return {
          items: [
            { url: 'https://example.com/before', timestamp: expectedSince - 1 },
            { url: 'https://example.com/after', timestamp: expectedSince + 60 }
          ],
          nextModified: 999
        };
      }
    }),
    storeFactory: () => ({
      append: async (items) => {
        appendedItems = items;
        return { added: items.length, skipped: 0 };
      }
    })
  });

  const stored = JSON.parse(fs.readFileSync(pushbulletConfigPath, 'utf-8'));
  assert.equal(capturedArgs.since, expectedSince);
  assert.equal(appendedItems.length, 1);
  assert.equal(appendedItems[0].url, 'https://example.com/after');
  assert.equal(result.mode, 'window');
  assert.equal(result.since, expectedSince);
  assert.deepEqual(result.timeWindow, { preset: 'today' });
  assert.equal(result.windowLabel, '今天');
  assert.deepEqual(result.urls, ['https://example.com/after']);
  assert.equal(stored.lastModified, 321);
});

test('syncInbox window mode supports natural month offsets for custom ranges', async () => {
  resetTmp();
  fs.writeFileSync(pushbulletConfigPath, JSON.stringify({
    enabled: true,
    accessToken: 'token',
    lastModified: 321,
    inboxPath: 'data/inbox.jsonl'
  }, null, 2), 'utf-8');

  let capturedArgs;
  const now = new Date('2026-04-12T18:20:00+08:00');
  const expectedDate = new Date(now.getTime());
  expectedDate.setMonth(expectedDate.getMonth() - 2);
  await syncInbox({
    pushbulletConfigPath,
    mode: 'window',
    timeWindow: {
      value: 2,
      unit: 'month'
    },
    now,
    providerFactory: () => ({
      pull: async (args) => {
        capturedArgs = args;
        return {
          items: [],
          nextModified: 999
        };
      }
    }),
    storeFactory: () => ({
      append: async () => ({ added: 0, skipped: 0 })
    })
  });

  assert.equal(capturedArgs.since, Math.trunc(expectedDate.getTime() / 1000));
});

test('syncInbox does not advance lastModified when provider result is truncated', async () => {
  resetTmp();
  fs.writeFileSync(pushbulletConfigPath, JSON.stringify({
    enabled: true,
    accessToken: 'token',
    lastModified: 321,
    inboxPath: 'data/inbox.jsonl'
  }, null, 2), 'utf-8');

  const result = await syncInbox({
    pushbulletConfigPath,
    mode: 'latest',
    providerFactory: () => ({
      pull: async () => ({
        items: [{ url: 'https://example.com/new' }],
        nextModified: 999,
        truncated: true,
        warning: 'Pushbullet pull reached maxPages=50.'
      })
    }),
    storeFactory: () => ({
      append: async () => ({ added: 1, skipped: 0 })
    })
  });

  const stored = JSON.parse(fs.readFileSync(pushbulletConfigPath, 'utf-8'));
  assert.equal(stored.lastModified, 321);
  assert.equal(result.stateAdvanced, false);
  assert.equal(result.warning, 'Pushbullet pull reached maxPages=50.');
  assert.match(result.stateWarning, /lastModified/i);
});

test('syncInbox emits progress events while streaming inbox sync state', async () => {
  resetTmp();
  fs.writeFileSync(pushbulletConfigPath, JSON.stringify({
    enabled: true,
    accessToken: 'token',
    lastModified: 321,
    inboxPath: 'data/inbox.jsonl'
  }, null, 2), 'utf-8');

  const events = [];
  const result = await syncInbox({
    pushbulletConfigPath,
    mode: 'window',
    now: new Date('2026-03-15T00:00:00Z'),
    timeWindow: {
      value: 2,
      unit: 'month'
    },
    onProgress: (event) => events.push(event),
    providerFactory: () => ({
      pull: async ({ onPage }) => {
        onPage?.({
          page: 1,
          pushesCount: 2,
          accumulatedItems: 2,
          nextCursor: 'cursor-1'
        });
        return {
          items: [
            { url: 'https://example.com/a', timestamp: 1770000000 },
            { url: 'https://example.com/b', timestamp: 1770000600 }
          ],
          nextModified: 999,
          pagesFetched: 1
        };
      }
    }),
    storeFactory: () => ({
      append: async () => ({ added: 1, skipped: 1 })
    })
  });

  assert.equal(result.total, 2);
  assert.equal(events[0].type, 'start');
  assert.equal(events[0].mode, 'window');
  assert.deepEqual(events[0].timeWindow, { value: 2, unit: 'month' });
  assert.equal(events[1].type, 'page');
  assert.equal(events[1].page, 1);
  assert.equal(events[1].pushesCount, 2);
  assert.equal(events[1].accumulatedItems, 2);
  assert.equal(events[2].type, 'store');
  assert.equal(events[2].added, 1);
  assert.equal(events[2].skipped, 1);
  assert.equal(events[2].total, 2);
});

test('syncInbox all mode uses bootstrapMaxPages from config', async () => {
  resetTmp();
  fs.writeFileSync(pushbulletConfigPath, JSON.stringify({
    enabled: true,
    accessToken: 'token',
    lastModified: 999,
    inboxPath: 'data/inbox.jsonl',
    bootstrapMaxPages: 200
  }, null, 2), 'utf-8');

  let capturedArgs = null;
  await syncInbox({
    pushbulletConfigPath,
    mode: 'all',
    providerFactory: () => ({
      pull: async (args) => {
        capturedArgs = args;
        return { items: [], nextModified: 10 };
      }
    }),
    storeFactory: () => ({
      append: async () => ({ added: 0, skipped: 0 })
    })
  });

  assert.equal(capturedArgs.since, 0);
  assert.equal(capturedArgs.maxPages, 200);
});

test('parseArgs accepts recent mode and limit', () => {
  assert.deepEqual(
    parseArgs(['--mode', 'recent', '--limit', '50']),
    {
      mode: 'recent',
      limit: 50
    }
  );
});

test('parseArgs accepts bootstrap mode and max-pages', () => {
  assert.deepEqual(
    parseArgs(['--mode', 'bootstrap', '--max-pages', '200']),
    {
      mode: 'bootstrap',
      maxPages: 200
    }
  );
});

test('parseArgs accepts window mode and preset', () => {
  assert.deepEqual(
    parseArgs(['--mode', 'window', '--preset', 'today']),
    {
      mode: 'window',
      timeWindow: {
        preset: 'today'
      }
    }
  );
});

test('parseArgs accepts window mode and custom value/unit', () => {
  assert.deepEqual(
    parseArgs(['window', '--value', '2', '--unit', 'month']),
    {
      mode: 'window',
      timeWindow: {
        value: 2,
        unit: 'month'
      }
    }
  );
});

test('parseArgs also accepts npm forwarded positional recent mode and limit', () => {
  assert.deepEqual(
    parseArgs(['recent', '50']),
    {
      mode: 'recent',
      limit: 50
    }
  );
});

test('run forwards parsed cli args into syncInbox', async () => {
  const result = await run(
    ['--mode', 'recent', '--limit', '30'],
    {
      syncInboxFn: async (options) => {
        assert.equal(options.mode, 'recent');
        assert.equal(options.limit, 30);
        return {
          mode: 'recent',
          total: 30,
          added: 5,
          skipped: 25
        };
      }
    }
  );

  assert.equal(result.mode, 'recent');
  assert.equal(result.total, 30);
});

test('run forwards parsed window args into syncInbox', async () => {
  const result = await run(
    ['--mode', 'window', '--value', '1', '--unit', 'year'],
    {
      syncInboxFn: async (options) => {
        assert.equal(options.mode, 'window');
        assert.deepEqual(options.timeWindow, { value: 1, unit: 'year' });
        return {
          mode: 'window',
          total: 12,
          added: 3,
          skipped: 9
        };
      }
    }
  );

  assert.equal(result.mode, 'window');
  assert.equal(result.total, 12);
});

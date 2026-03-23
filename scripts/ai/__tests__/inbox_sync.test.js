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

test('parseArgs accepts recent mode and limit', () => {
  assert.deepEqual(
    parseArgs(['--mode', 'recent', '--limit', '50']),
    {
      mode: 'recent',
      limit: 50
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

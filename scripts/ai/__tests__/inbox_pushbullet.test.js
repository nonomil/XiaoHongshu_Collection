const { test } = require('node:test');
const assert = require('node:assert/strict');

const { createPushbulletProvider } = require('../../lib/inbox_pushbullet');

test('pushbullet provider pulls link and note urls', async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      pushes: [
        { type: 'link', url: 'https://example.com', modified: 10 },
        { type: 'note', body: 'check https://foo.com here', modified: 20 }
      ]
    })
  });
  const provider = createPushbulletProvider({ accessToken: 'token', fetchImpl: mockFetch });
  const { items, nextModified } = await provider.pull({ since: 0 });
  assert.equal(items.length, 2);
  assert.equal(items[0].url, 'https://example.com');
  assert.equal(items[1].url, 'https://foo.com');
  assert.equal(nextModified, 20);
});

test('pushbullet provider follows cursor pagination and merges pages', async () => {
  const calls = [];
  const mockFetch = async (url) => {
    calls.push(String(url));
    if (calls.length === 1) {
      return {
        ok: true,
        json: async () => ({
          pushes: [{ type: 'link', url: 'https://a.com', modified: 10 }],
          cursor: 'c1'
        })
      };
    }
    return {
      ok: true,
      json: async () => ({
        pushes: [{ type: 'link', url: 'https://b.com', modified: 20 }]
      })
    };
  };

  const provider = createPushbulletProvider({ accessToken: 'token', fetchImpl: mockFetch });
  const { items, nextModified } = await provider.pull({ since: 0 });

  assert.equal(calls.length, 2);
  assert.match(calls[0], /modified_after=0/);
  assert.match(calls[0], /limit=500/);
  assert.match(calls[1], /cursor=c1/);
  assert.match(calls[1], /limit=500/);
  assert.equal(items.length, 2);
  assert.equal(items[0].url, 'https://a.com');
  assert.equal(items[1].url, 'https://b.com');
  assert.equal(nextModified, 20);
});

test('pushbullet provider reports truncated when max pages reached', async () => {
  let callCount = 0;
  const mockFetch = async () => {
    callCount += 1;
    return {
      ok: true,
      json: async () => ({
        pushes: [{ type: 'link', url: `https://example.com/${callCount}`, modified: callCount }],
        cursor: `c${callCount}`
      })
    };
  };

  const provider = createPushbulletProvider({ accessToken: 'token', fetchImpl: mockFetch, maxPages: 1 });
  const result = await provider.pull({ since: 0 });

  assert.equal(result.items.length, 1);
  assert.equal(result.truncated, true);
  assert.match(result.warning, /maxPages/i);
});

test('pushbullet provider can stop after maxItems when pulling recent messages', async () => {
  let callCount = 0;
  const mockFetch = async () => {
    callCount += 1;
    return {
      ok: true,
      json: async () => ({
        pushes: [
          { type: 'link', url: 'https://example.com/1', modified: 30 },
          { type: 'link', url: 'https://example.com/2', modified: 20 },
          { type: 'link', url: 'https://example.com/3', modified: 10 }
        ],
        cursor: 'c1'
      })
    };
  };

  const provider = createPushbulletProvider({ accessToken: 'token', fetchImpl: mockFetch });
  const result = await provider.pull({ since: 0, maxItems: 2 });

  assert.equal(callCount, 1);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].url, 'https://example.com/1');
  assert.equal(result.items[1].url, 'https://example.com/2');
  assert.equal(result.truncated, true);
});

test('pushbullet provider allows pull-level maxPages override for full imports', async () => {
  let callCount = 0;
  const mockFetch = async () => {
    callCount += 1;
    return {
      ok: true,
      json: async () => ({
        pushes: [{ type: 'link', url: `https://example.com/${callCount}`, modified: callCount }],
        ...(callCount < 3 ? { cursor: `c${callCount}` } : {})
      })
    };
  };

  const provider = createPushbulletProvider({ accessToken: 'token', fetchImpl: mockFetch, maxPages: 1 });
  const result = await provider.pull({ since: 0, maxPages: 3 });

  assert.equal(callCount, 3);
  assert.equal(result.items.length, 3);
  assert.equal(result.truncated, undefined);
  assert.equal(result.pagesFetched, 3);
});

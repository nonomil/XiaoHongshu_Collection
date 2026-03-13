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

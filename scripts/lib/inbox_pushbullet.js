const DEFAULT_BASE_URL = 'https://api.pushbullet.com/v2';

function extractUrls(text) {
  if (!text) return [];
  const matches = String(text).match(/https?:\/\/[^\s]+/g);
  return matches ? matches.map((value) => value.replace(/[),.;]+$/, '')) : [];
}

function buildItemFromPush(push) {
  if (!push || typeof push !== 'object') return null;
  const modified = Number(push.modified || 0);
  if (push.type === 'link' && push.url) {
    return {
      source: 'pushbullet',
      url: push.url,
      title: push.title || '',
      timestamp: modified || 0,
      raw: push
    };
  }

  const urls = extractUrls(push.body || '');
  if (urls.length === 0) return null;

  return {
    source: 'pushbullet',
    url: urls[0],
    title: push.title || '',
    timestamp: modified || 0,
    raw: push
  };
}

function createPushbulletProvider({
  accessToken,
  fetchImpl = fetch,
  baseUrl = DEFAULT_BASE_URL
} = {}) {
  if (!accessToken) {
    throw new Error('Pushbullet access token is required');
  }

  return {
    async pull({ since = 0 } = {}) {
      const url = `${baseUrl}/pushes?modified_after=${encodeURIComponent(since)}`;
      const response = await fetchImpl(url, {
        headers: {
          'Access-Token': accessToken
        }
      });

      if (!response.ok) {
        throw new Error(`Pushbullet API error: ${response.status}`);
      }

      const payload = await response.json();
      const pushes = Array.isArray(payload?.pushes) ? payload.pushes : [];
      const items = [];
      let nextModified = Number(since) || 0;

      for (const push of pushes) {
        if (Number(push.modified || 0) > nextModified) {
          nextModified = Number(push.modified || 0);
        }
        const item = buildItemFromPush(push);
        if (item) items.push(item);
      }

      return { items, nextModified };
    }
  };
}

module.exports = {
  createPushbulletProvider
};

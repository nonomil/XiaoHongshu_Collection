const DEFAULT_BASE_URL = 'https://api.pushbullet.com/v2';
const DEFAULT_PAGE_LIMIT = 500;
const DEFAULT_MAX_PAGES = 50;

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

function resolveInteger(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.trunc(num);
}

function buildBasicAuth(accessToken) {
  const encoded = Buffer.from(`${accessToken}:`).toString('base64');
  return `Basic ${encoded}`;
}

function buildPushesUrl({ baseUrl, since, cursor, limit }) {
  const params = new URLSearchParams();
  params.set('modified_after', String(since || 0));
  params.set('limit', String(limit || DEFAULT_PAGE_LIMIT));
  if (cursor) params.set('cursor', String(cursor));
  return `${baseUrl}/pushes?${params.toString()}`;
}

async function fetchPushesWithAuth({ fetchImpl, url, accessToken }) {
  const primary = await fetchImpl(url, {
    headers: {
      'Access-Token': accessToken
    }
  });

  if (primary.status !== 401) {
    return primary;
  }

  // Compatibility: Some environments may require Basic auth instead of Access-Token header.
  return fetchImpl(url, {
    headers: {
      Authorization: buildBasicAuth(accessToken)
    }
  });
}

function createPushbulletProvider({
  accessToken,
  fetchImpl = fetch,
  baseUrl = DEFAULT_BASE_URL,
  limit = DEFAULT_PAGE_LIMIT,
  maxPages = undefined
} = {}) {
  if (!accessToken) {
    throw new Error('Pushbullet access token is required');
  }

  const resolvedLimit = resolveInteger(limit, DEFAULT_PAGE_LIMIT) || DEFAULT_PAGE_LIMIT;
  const resolvedMaxPages = resolveInteger(maxPages, resolveInteger(process.env.PUSHBULLET_MAX_PAGES, DEFAULT_MAX_PAGES));
  const safeMaxPages = resolvedMaxPages > 0 ? resolvedMaxPages : DEFAULT_MAX_PAGES;

  return {
    async pull({ since = 0 } = {}) {
      const items = [];
      const normalizedSince = Number(since) || 0;
      let nextModified = normalizedSince;
      let cursor = '';
      let pagesFetched = 0;
      let truncated = false;
      let warning = '';

      while (true) {
        if (pagesFetched >= safeMaxPages) {
          truncated = true;
          warning = `Pushbullet 拉取分页达到上限（maxPages=${safeMaxPages}），结果已截断。可提高环境变量 PUSHBULLET_MAX_PAGES 后重试“同步全部”。`;
          break;
        }

        const url = buildPushesUrl({
          baseUrl,
          since: normalizedSince,
          cursor,
          limit: resolvedLimit
        });

        const response = await fetchPushesWithAuth({ fetchImpl, url, accessToken });
        if (!response.ok) {
          throw new Error(`Pushbullet API error: ${response.status}`);
        }

        pagesFetched += 1;

        const payload = await response.json();
        const pushes = Array.isArray(payload?.pushes) ? payload.pushes : [];

        for (const push of pushes) {
          if (Number(push?.modified || 0) > nextModified) {
            nextModified = Number(push.modified || 0);
          }
          const item = buildItemFromPush(push);
          if (item) items.push(item);
        }

        cursor = typeof payload?.cursor === 'string' ? payload.cursor : '';
        if (!cursor || pushes.length === 0) break;
      }

      const result = { items, nextModified };
      if (truncated) {
        result.truncated = true;
        result.warning = warning;
      }
      return result;
    }
  };
}

module.exports = {
  createPushbulletProvider
};

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
  const resolvedDefaultMaxPages = resolveInteger(
    maxPages,
    resolveInteger(process.env.PUSHBULLET_MAX_PAGES, DEFAULT_MAX_PAGES)
  );
  const defaultMaxPages = resolvedDefaultMaxPages > 0 ? resolvedDefaultMaxPages : DEFAULT_MAX_PAGES;

  return {
    async pull({ since = 0, maxItems, maxPages: pullMaxPages, limit: pullLimit, onPage } = {}) {
      const items = [];
      const normalizedSince = Number(since) || 0;
      const normalizedMaxItems = resolveInteger(maxItems, 0);
      const safeMaxItems = normalizedMaxItems > 0 ? normalizedMaxItems : 0;
      const resolvedPullMaxPages = resolveInteger(pullMaxPages, defaultMaxPages);
      const safeMaxPages = resolvedPullMaxPages > 0 ? resolvedPullMaxPages : defaultMaxPages;
      const resolvedPullLimit = resolveInteger(pullLimit, resolvedLimit);
      const safeLimit = resolvedPullLimit > 0 ? resolvedPullLimit : resolvedLimit;
      let nextModified = normalizedSince;
      let cursor = '';
      let pagesFetched = 0;
      let truncated = false;
      let warning = '';
      let cappedByItems = false;

      while (true) {
        if (pagesFetched >= safeMaxPages) {
          truncated = true;
          warning = `Pushbullet pull reached maxPages=${safeMaxPages}.`;
          break;
        }

        const url = buildPushesUrl({
          baseUrl,
          since: normalizedSince,
          cursor,
          limit: safeLimit
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
          if (!item) continue;
          items.push(item);
          if (safeMaxItems > 0 && items.length >= safeMaxItems) {
            cappedByItems = true;
            truncated = true;
            warning = `Pushbullet pull capped at maxItems=${safeMaxItems}.`;
            break;
          }
        }

        cursor = typeof payload?.cursor === 'string' ? payload.cursor : '';
        if (typeof onPage === 'function') {
          onPage({
            page: pagesFetched,
            pushesCount: pushes.length,
            accumulatedItems: items.length,
            nextCursor: cursor
          });
        }
        if (cappedByItems) {
          items.length = safeMaxItems;
          break;
        }
        if (!cursor || pushes.length === 0) break;
      }

      const result = { items, nextModified, pagesFetched };
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

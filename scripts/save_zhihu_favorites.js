const path = require('path');
const { connectToChrome, send } = require('./lib/cdp_note');
const { resolveProjectPaths } = require('./lib/config');
const {
  buildZhihuFavoritesPaths,
  collectZhihuFavoriteEntries,
  fetchZhihuCollectionPage,
  fetchZhihuCollectionTitle,
  parseZhihuCollectionId
} = require('./lib/zhihu_favorites');
const { saveLinksText } = require('./save_note');

const PATHS = resolveProjectPaths(path.resolve(__dirname, '..'));
const DEFAULT_ZHIHU_COOKIE_URLS = [
  'https://www.zhihu.com/',
  'https://zhuanlan.zhihu.com/'
];
const DEFAULT_ZHIHU_COOKIE_DOMAINS = ['zhihu.com'];
const DEFAULT_BROWSER_COOKIE_CANDIDATES = [
  { label: 'project-browser', browser: {} },
  { label: 'current-browser', browser: { mode: 'current-browser' } }
];

function parseArgs(argv = []) {
  if (!Array.isArray(argv) || argv.length === 0) {
    throw new Error('Usage: node scripts/save_zhihu_favorites.js <collection-url> [--cookie <cookie>] [--title <title>] [--output-root <dir>] [--limit <n>]');
  }

  const args = [...argv];
  const parsed = {
    collectionUrl: ''
  };

  while (args.length > 0) {
    const token = args.shift();
    if (!token) continue;

    switch (token) {
      case '--cookie':
        parsed.cookie = args.shift() || '';
        break;
      case '--title':
        parsed.title = args.shift() || '';
        break;
      case '--output-root':
        parsed.outputRoot = args.shift() || '';
        break;
      case '--limit':
        parsed.limit = Number(args.shift() || 0) || 0;
        break;
      default:
        if (!parsed.collectionUrl) {
          parsed.collectionUrl = token;
          break;
        }
        throw new Error(`Unknown argument: ${token}`);
    }
  }

  if (!parsed.collectionUrl) {
    throw new Error('Usage: node scripts/save_zhihu_favorites.js <collection-url> [--cookie <cookie>] [--title <title>] [--output-root <dir>] [--limit <n>]');
  }

  if (parsed.limit) {
    parsed.limit = Math.max(1, parsed.limit);
  }

  return parsed;
}

function resolveCollectionTitle(title, collectionId) {
  return String(title || '').trim() || `收藏夹 ${collectionId}`;
}

function uniqueStrings(values = []) {
  const seen = new Set();
  const list = [];
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    list.push(normalized);
  }
  return list;
}

function extractResolvedValue(value, field) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return String(value[field] || '').trim();
  }
  return String(value || '').trim();
}

function buildBrowserConnectOptions(browser = {}) {
  const options = {
    requireXiaohongshu: false
  };

  if (browser.mode) options.browserMode = String(browser.mode || '').trim();
  if (browser.channel) options.browserChannel = String(browser.channel || '').trim();
  if (browser.browserUrl) options.browserUrl = String(browser.browserUrl || '').trim();
  if (browser.wsEndpoint) options.wsEndpoint = String(browser.wsEndpoint || '').trim();
  return options;
}

function matchesCookieDomain(domain, expectedDomains = []) {
  const normalizedDomain = String(domain || '').trim().replace(/^\./, '').toLowerCase();
  if (!normalizedDomain) return false;
  return expectedDomains.some((entry) => {
    const normalizedEntry = String(entry || '').trim().replace(/^\./, '').toLowerCase();
    return normalizedEntry
      && (
        normalizedDomain === normalizedEntry
        || normalizedDomain.endsWith(`.${normalizedEntry}`)
      );
  });
}

function serializeCookiesToHeader(cookies = [], domains = DEFAULT_ZHIHU_COOKIE_DOMAINS) {
  const seenNames = new Set();
  const pairs = [];

  for (const cookie of Array.isArray(cookies) ? cookies : []) {
    const name = String(cookie?.name || '').trim();
    const value = String(cookie?.value || '').trim();
    const domain = String(cookie?.domain || '').trim();
    if (!name || !value) continue;
    if (Array.isArray(domains) && domains.length > 0 && !matchesCookieDomain(domain, domains)) {
      continue;
    }
    if (seenNames.has(name)) continue;
    seenNames.add(name);
    pairs.push(`${name}=${value}`);
  }

  return pairs.join('; ');
}

function closeSocketQuietly(socket) {
  if (!socket || typeof socket.close !== 'function') return;
  try {
    socket.close();
  } catch (_) {
    // ignore socket close failures
  }
}

async function readCookieHeaderFromBrowserCandidate(candidate = {}, options = {}) {
  const connectToChromeFn = options.connectToChromeFn || connectToChrome;
  const sendFn = options.sendFn || send;
  const browser = candidate?.browser && typeof candidate.browser === 'object'
    ? candidate.browser
    : candidate;
  const urls = uniqueStrings([
    ...(Array.isArray(options.urls) ? options.urls : []),
    ...DEFAULT_ZHIHU_COOKIE_URLS
  ]);
  const domains = Array.isArray(options.domains) && options.domains.length > 0
    ? options.domains
    : DEFAULT_ZHIHU_COOKIE_DOMAINS;
  let ws;

  try {
    ws = await connectToChromeFn(buildBrowserConnectOptions(browser));
    let cookies = [];

    try {
      const storageResult = await sendFn(ws, 'Storage.getCookies');
      cookies = Array.isArray(storageResult?.cookies) ? storageResult.cookies : [];
    } catch (_) {
      cookies = [];
    }

    if (cookies.length === 0) {
      const networkResult = await sendFn(ws, 'Network.getCookies', { urls });
      cookies = Array.isArray(networkResult?.cookies) ? networkResult.cookies : [];
    }

    const cookieHeader = serializeCookiesToHeader(cookies, domains);
    if (!cookieHeader) {
      throw new Error('No matching Zhihu cookies found in browser session');
    }
    return cookieHeader;
  } finally {
    closeSocketQuietly(ws);
  }
}

async function resolveCookieHeaderFromBrowser(options = {}) {
  const candidates = Array.isArray(options.candidates) && options.candidates.length > 0
    ? options.candidates
    : DEFAULT_BROWSER_COOKIE_CANDIDATES;
  const errors = [];

  for (const candidate of candidates) {
    const label = String(candidate?.label || candidate?.browser?.mode || candidate?.mode || 'browser').trim();
    try {
      const cookie = await readCookieHeaderFromBrowserCandidate(candidate, options);
      if (cookie) {
        return { cookie, source: label };
      }
    } catch (error) {
      errors.push(`${label}: ${error.message}`);
    }
  }

  throw new Error(errors.length > 0
    ? `Unable to resolve Zhihu cookies from Chrome session (${errors.join('; ')})`
    : 'Unable to resolve Zhihu cookies from Chrome session'
  );
}

async function resolveZhihuCookie(parsed = {}, options = {}, context = {}) {
  const explicitCookie = String(parsed.cookie || process.env.ZHIHU_COOKIE || '').trim();
  if (explicitCookie) {
    return explicitCookie;
  }

  const collectionUrl = String(context.collectionUrl || parsed.collectionUrl || '').trim();
  const collectionId = String(context.collectionId || parseZhihuCollectionId(collectionUrl)).trim();
  const resolveCookieFn = options.resolveCookieFn;

  if (typeof resolveCookieFn === 'function') {
    const resolvedCookie = extractResolvedValue(
      await resolveCookieFn({
        parsed,
        collectionId,
        collectionUrl
      }),
      'cookie'
    );
    if (resolvedCookie) {
      return resolvedCookie;
    }
  }

  const resolveCookieHeaderFromBrowserFn = options.resolveCookieHeaderFromBrowserFn || resolveCookieHeaderFromBrowser;
  const browserResult = await resolveCookieHeaderFromBrowserFn({
    urls: uniqueStrings([collectionUrl, ...DEFAULT_ZHIHU_COOKIE_URLS]),
    domains: DEFAULT_ZHIHU_COOKIE_DOMAINS,
    candidates: Array.isArray(options.browserCandidates) && options.browserCandidates.length > 0
      ? options.browserCandidates
      : DEFAULT_BROWSER_COOKIE_CANDIDATES
  });
  const resolvedBrowserCookie = extractResolvedValue(browserResult, 'cookie');
  if (resolvedBrowserCookie) {
    return resolvedBrowserCookie;
  }

  throw new Error('Zhihu favorites export requires --cookie or ZHIHU_COOKIE, or an active logged-in Chrome session');
}

async function resolveCollectionTitleInput(parsed, collectionId, cookie, options = {}) {
  if (String(parsed.title || '').trim()) {
    return resolveCollectionTitle(parsed.title, collectionId);
  }

  let detectedTitle = '';
  if (typeof options.resolveCollectionTitleFn === 'function') {
    detectedTitle = extractResolvedValue(
      await options.resolveCollectionTitleFn({
        parsed,
        collectionId,
        collectionUrl: parsed.collectionUrl,
        cookie
      }),
      'title'
    );
  }

  if (!detectedTitle) {
    const fetchZhihuCollectionTitleFn = options.fetchZhihuCollectionTitleFn || fetchZhihuCollectionTitle;
    try {
      detectedTitle = extractResolvedValue(
        await fetchZhihuCollectionTitleFn({
          collectionUrl: parsed.collectionUrl,
          cookie
        }),
        'title'
      );
    } catch (_) {
      detectedTitle = '';
    }
  }

  return resolveCollectionTitle(detectedTitle, collectionId);
}

async function run(argv = process.argv.slice(2), options = {}) {
  const parsed = options.parsed || parseArgs(argv);
  const collectionId = parseZhihuCollectionId(parsed.collectionUrl);
  const cookie = await resolveZhihuCookie(parsed, options, {
    collectionId,
    collectionUrl: parsed.collectionUrl
  });
  const collectionTitle = await resolveCollectionTitleInput(parsed, collectionId, cookie, options);
  const outputRoot = String(parsed.outputRoot || options.outputRoot || PATHS.outputDir).trim();
  const paths = buildZhihuFavoritesPaths({
    outputRoot,
    collectionId,
    collectionTitle
  });

  const fetchZhihuCollectionPageFn = options.fetchZhihuCollectionPageFn || fetchZhihuCollectionPage;
  const collectZhihuFavoriteEntriesFn = options.collectZhihuFavoriteEntriesFn || collectZhihuFavoriteEntries;
  const saveLinksTextFn = options.saveLinksTextFn || saveLinksText;
  const limit = Math.max(1, Number(parsed.limit || 20) || 20);

  const collect = await collectZhihuFavoriteEntriesFn({
    collectionId,
    progressPath: paths.progressPath,
    limit,
    fetchPageFn: ({ offset, limit: pageLimit }) => fetchZhihuCollectionPageFn({
      collectionId,
      offset,
      limit: pageLimit,
      cookie
    })
  });

  const urls = collect.entries.map((item) => String(item.url || '').trim()).filter(Boolean);
  const summary = urls.length > 0
    ? await saveLinksTextFn(urls.join('\n'), {
      outputRoot: paths.rootDir
    })
    : {
      total: 0,
      successCount: 0,
      failureCount: 0,
      results: []
    };

  return {
    collectionId,
    collectionTitle,
    paths,
    collect,
    summary
  };
}

if (require.main === module) {
  run()
    .then(({ collectionTitle, summary }) => {
      console.log(`Zhihu favorites export completed: ${collectionTitle}`);
      console.log(`Processed ${summary.total} item(s): ${summary.successCount} succeeded, ${summary.failureCount} failed.`);
      if (summary.failureCount > 0) {
        process.exitCode = 1;
      }
    })
    .catch((error) => {
      console.error(`Zhihu favorites export failed: ${error.message}`);
      process.exitCode = 1;
    });
}

module.exports = {
  parseArgs,
  readCookieHeaderFromBrowserCandidate,
  resolveCookieHeaderFromBrowser,
  resolveCollectionTitle,
  resolveCollectionTitleInput,
  resolveZhihuCookie,
  serializeCookiesToHeader,
  run
};

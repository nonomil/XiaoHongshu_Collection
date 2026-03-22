const path = require('path');

const { resolveProjectPaths } = require('./config');
const { createInboxStore } = require('./inbox_store');
const { classifyInboxNote, defaultInboxCategories } = require('./inbox_classifier');
const { buildTaskSummary } = require('./report');
const { loadPushbulletConfig } = require('./pushbullet_config');
const { resolveInboxPath } = require('./inbox_sync');
const { formatSaveNoteError, saveLinksText } = require('../save_note');

const PATHS = resolveProjectPaths(path.resolve(__dirname, '..', '..'));
const DEFAULT_PUSHBULLET_CONFIG_PATH = path.join(PATHS.configDir, 'pushbullet.json');
const INBOX_OUTPUT_ROOT = path.join(PATHS.outputDir, '收件箱同步');

function resolveInboxCategories(uiConfig) {
  const categories = uiConfig?.inbox?.categories;
  if (categories && typeof categories === 'object' && !Array.isArray(categories)) {
    return categories;
  }
  return defaultInboxCategories();
}

function normalizeUrlList(urls = []) {
  const seen = new Set();
  const normalized = [];

  for (const value of Array.isArray(urls) ? urls : []) {
    const url = String(value || '').trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    normalized.push(url);
  }

  return normalized;
}

function normalizeSummaryResults(summary, fallbackUrl) {
  const results = Array.isArray(summary?.results) ? summary.results : [];
  if (results.length > 0) {
    return results.map((item) => ({
      ...item,
      input: item?.input || fallbackUrl,
      navigationUrl: item?.navigationUrl || fallbackUrl,
      warnings: Array.isArray(item?.warnings) ? item.warnings : []
    }));
  }

  const failed = Number(summary?.failureCount || 0) > 0;
  return [{
    input: fallbackUrl,
    navigationUrl: fallbackUrl,
    status: failed ? 'failed' : 'success',
    error: failed ? 'Inbox save failed' : '',
    warnings: []
  }];
}

async function loadInboxUrls({
  inboxPath,
  storeFactory
} = {}) {
  if (!inboxPath) {
    throw new Error('inboxPath is required');
  }
  const store = storeFactory
    ? storeFactory({ inboxPath })
    : createInboxStore({ filePath: inboxPath });
  const items = await store.readAll();
  const seen = new Set();
  const urls = [];

  for (const item of items) {
    if (!item || !item.url) continue;
    const url = String(item.url).trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }

  return urls;
}

async function saveInboxUrls({
  pushbulletConfigPath = DEFAULT_PUSHBULLET_CONFIG_PATH,
  saveLinksText: saveLinks = saveLinksText,
  storeFactory,
  uiConfig,
  urls
} = {}) {
  const config = loadPushbulletConfig({ configPath: pushbulletConfigPath });
  const inboxPath = resolveInboxPath(PATHS.projectDir, config.inboxPath);
  const targetUrls = Array.isArray(urls)
    ? normalizeUrlList(urls)
    : await loadInboxUrls({ inboxPath, storeFactory });

  if (targetUrls.length === 0) {
    return { total: 0, summary: null };
  }

  const categories = resolveInboxCategories(uiConfig);
  const results = [];

  for (const url of targetUrls) {
    try {
      const summary = await saveLinks(url, {
        source: 'inbox',
        outputRoot: INBOX_OUTPUT_ROOT,
        collectionResolver: ({ note }) => classifyInboxNote({
          title: note?.title || '',
          content: note?.content || '',
          tags: note?.tags || []
        }, categories)
      });
      results.push(...normalizeSummaryResults(summary, url));
    } catch (error) {
      results.push({
        input: url,
        navigationUrl: url,
        status: 'failed',
        error: formatSaveNoteError(error),
        warnings: []
      });
    }
  }

  const summary = buildTaskSummary(results.map((item, index) => ({
    ...item,
    index
  })), { includeWarnings: true });
  return { total: targetUrls.length, summary };
}

module.exports = {
  loadInboxUrls,
  saveInboxUrls
};

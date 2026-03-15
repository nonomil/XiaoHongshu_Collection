const path = require('path');

const { resolveProjectPaths } = require('./config');
const { createInboxStore } = require('./inbox_store');
const { classifyInboxNote, defaultInboxCategories } = require('./inbox_classifier');
const { loadPushbulletConfig } = require('./pushbullet_config');
const { resolveInboxPath } = require('./inbox_sync');
const { saveLinksText } = require('../save_note');

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
  uiConfig
} = {}) {
  const config = loadPushbulletConfig({ configPath: pushbulletConfigPath });
  const inboxPath = resolveInboxPath(PATHS.projectDir, config.inboxPath);
  const urls = await loadInboxUrls({ inboxPath, storeFactory });

  if (urls.length === 0) {
    return { total: 0, summary: null };
  }

  const text = urls.join('\n');
  const categories = resolveInboxCategories(uiConfig);
  const summary = await saveLinks(text, {
    source: 'inbox',
    outputRoot: INBOX_OUTPUT_ROOT,
    collectionResolver: ({ note }) => classifyInboxNote({
      title: note?.title || '',
      content: note?.content || '',
      tags: note?.tags || []
    }, categories)
  });
  return { total: urls.length, summary };
}

module.exports = {
  loadInboxUrls,
  saveInboxUrls
};

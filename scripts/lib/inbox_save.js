const path = require('path');

const { resolveProjectPaths } = require('./config');
const { createInboxStore } = require('./inbox_store');
const { loadPushbulletConfig } = require('./pushbullet_config');
const { resolveInboxPath } = require('./inbox_sync');
const { saveLinksText } = require('../save_note');

const PATHS = resolveProjectPaths(path.resolve(__dirname, '..', '..'));
const DEFAULT_PUSHBULLET_CONFIG_PATH = path.join(PATHS.configDir, 'pushbullet.json');

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
  storeFactory
} = {}) {
  const config = loadPushbulletConfig({ configPath: pushbulletConfigPath });
  const inboxPath = resolveInboxPath(PATHS.projectDir, config.inboxPath);
  const urls = await loadInboxUrls({ inboxPath, storeFactory });

  if (urls.length === 0) {
    return { total: 0, summary: null };
  }

  const text = urls.join('\n');
  const summary = await saveLinks(text, { source: 'cli' });
  return { total: urls.length, summary };
}

module.exports = {
  loadInboxUrls,
  saveInboxUrls
};

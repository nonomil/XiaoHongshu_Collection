const path = require('path');

const { resolveProjectPaths } = require('./config');
const { createInboxStore } = require('./inbox_store');
const { createPushbulletProvider } = require('./inbox_pushbullet');
const { loadPushbulletConfig, savePushbulletConfig } = require('./pushbullet_config');

const PATHS = resolveProjectPaths(path.resolve(__dirname, '..', '..'));
const DEFAULT_PUSHBULLET_CONFIG_PATH = path.join(PATHS.configDir, 'pushbullet.json');

function extractUniqueUrls(items = []) {
  const seen = new Set();
  const urls = [];

  for (const item of items) {
    const url = String(item?.url || '').trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }

  return urls;
}

function resolveInboxPath(projectDir, inboxPath) {
  if (!inboxPath) {
    return path.join(projectDir, 'data', 'inbox_links.jsonl');
  }
  if (path.isAbsolute(inboxPath)) return inboxPath;
  return path.join(projectDir, inboxPath);
}

async function syncInbox({
  pushbulletConfigPath = DEFAULT_PUSHBULLET_CONFIG_PATH,
  mode = 'latest',
  limit,
  providerFactory,
  storeFactory
} = {}) {
  const config = loadPushbulletConfig({ configPath: pushbulletConfigPath });

  if (!config.enabled) {
    throw new Error('Pushbullet sync is disabled.');
  }
  if (!config.accessToken) {
    throw new Error('Pushbullet access token is required.');
  }

  const provider = providerFactory
    ? providerFactory(config)
    : createPushbulletProvider({ accessToken: config.accessToken });
  const normalizedMode = mode === 'all' ? 'all' : mode === 'recent' ? 'recent' : 'latest';
  const normalizedLimit = Number.isFinite(Number(limit)) && Number(limit) > 0
    ? Math.trunc(Number(limit))
    : 0;
  const since = normalizedMode === 'all' || normalizedMode === 'recent'
    ? 0
    : Number(config.lastModified || 0);
  const pullArgs = {
    since,
    ...(normalizedMode === 'recent' && normalizedLimit > 0 ? { maxItems: normalizedLimit } : {})
  };
  const pullResult = await provider.pull(pullArgs);
  const items = Array.isArray(pullResult?.items) ? pullResult.items : [];
  const nextModified = Number(pullResult?.nextModified || 0);
  const inboxPath = resolveInboxPath(PATHS.projectDir, config.inboxPath);
  const store = storeFactory
    ? storeFactory(config)
    : createInboxStore({ filePath: inboxPath });
  const { added, skipped } = await store.append(items);

  if (normalizedMode !== 'recent') {
    const updatedConfig = { ...config, lastModified: nextModified };
    savePushbulletConfig({ configPath: pushbulletConfigPath, payload: updatedConfig });
  }

  const result = {
    mode: normalizedMode,
    since,
    added,
    skipped,
    total: items.length,
    nextModified
  };

  if (normalizedMode === 'recent' && normalizedLimit > 0) {
    result.limit = normalizedLimit;
    result.urls = extractUniqueUrls(items);
  }
  if (pullResult?.truncated) {
    result.truncated = true;
  }
  if (pullResult?.warning) {
    result.warning = String(pullResult.warning);
  }

  return result;
}

module.exports = {
  resolveInboxPath,
  syncInbox
};

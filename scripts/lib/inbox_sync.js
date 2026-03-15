const path = require('path');

const { resolveProjectPaths } = require('./config');
const { createInboxStore } = require('./inbox_store');
const { createPushbulletProvider } = require('./inbox_pushbullet');
const { loadPushbulletConfig, savePushbulletConfig } = require('./pushbullet_config');

const PATHS = resolveProjectPaths(path.resolve(__dirname, '..', '..'));
const DEFAULT_PUSHBULLET_CONFIG_PATH = path.join(PATHS.configDir, 'pushbullet.json');

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
  const normalizedMode = mode === 'all' ? 'all' : 'latest';
  const since = normalizedMode === 'all' ? 0 : Number(config.lastModified || 0);
  const { items, nextModified } = await provider.pull({ since });
  const inboxPath = resolveInboxPath(PATHS.projectDir, config.inboxPath);
  const store = storeFactory
    ? storeFactory(config)
    : createInboxStore({ filePath: inboxPath });
  const { added, skipped } = await store.append(items);

  const updatedConfig = { ...config, lastModified: nextModified };
  savePushbulletConfig({ configPath: pushbulletConfigPath, payload: updatedConfig });

  return {
    added,
    skipped,
    total: items.length,
    nextModified
  };
}

module.exports = {
  resolveInboxPath,
  syncInbox
};

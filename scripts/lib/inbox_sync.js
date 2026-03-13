const path = require('path');

const { resolveProjectPaths } = require('./config');
const { loadUiConfig, saveUiConfig } = require('./ui_config');
const { createInboxStore } = require('./inbox_store');
const { createPushbulletProvider } = require('./inbox_pushbullet');

const PATHS = resolveProjectPaths(path.resolve(__dirname, '..', '..'));
const DEFAULT_UI_CONFIG_PATH = path.join(PATHS.configDir, 'ui.json');

function resolveInboxPath(projectDir, inboxPath) {
  if (!inboxPath) {
    return path.join(projectDir, 'data', 'inbox_links.jsonl');
  }
  if (path.isAbsolute(inboxPath)) return inboxPath;
  return path.join(projectDir, inboxPath);
}

async function syncInbox({
  uiConfigPath = DEFAULT_UI_CONFIG_PATH,
  uiConfig
} = {}) {
  const config = uiConfig || loadUiConfig({ configPath: uiConfigPath });
  const pushbullet = config.pushbullet || {};

  if (!pushbullet.enabled) {
    throw new Error('Pushbullet sync is disabled.');
  }
  if (!pushbullet.accessToken) {
    throw new Error('Pushbullet access token is required.');
  }

  const provider = createPushbulletProvider({ accessToken: pushbullet.accessToken });
  const since = Number(pushbullet.lastModified || 0);
  const { items, nextModified } = await provider.pull({ since });
  const inboxPath = resolveInboxPath(PATHS.projectDir, config.inbox?.path);
  const store = createInboxStore({ filePath: inboxPath });
  const { added, skipped } = await store.append(items);

  const updatedConfig = {
    ...config,
    pushbullet: {
      ...pushbullet,
      lastModified: nextModified
    }
  };
  saveUiConfig({ configPath: uiConfigPath, payload: updatedConfig });

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

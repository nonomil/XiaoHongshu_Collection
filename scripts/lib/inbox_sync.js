const path = require('path');

const { resolveProjectPaths } = require('./config');
const { createInboxStore } = require('./inbox_store');
const { createPushbulletProvider } = require('./inbox_pushbullet');
const { loadPushbulletConfig, savePushbulletConfig } = require('./pushbullet_config');

const PATHS = resolveProjectPaths(path.resolve(__dirname, '..', '..'));
const DEFAULT_PUSHBULLET_CONFIG_PATH = path.join(PATHS.configDir, 'pushbullet.json');
const DEFAULT_INBOX_ARCHIVE_ROOT = path.join(PATHS.dataDir, 'inbox_archive');

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

function resolvePositiveInteger(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return 0;
  return Math.trunc(num);
}

function buildSyncWarningMessages(...messages) {
  return messages
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ');
}

function normalize_time_window(time_window) {
  if (!time_window || typeof time_window !== 'object') return null;

  const preset = String(time_window.preset || '').trim().toLowerCase();
  if (['today', '7d', '30d', '60d', '2m'].includes(preset)) {
    return { preset };
  }

  const value = resolvePositiveInteger(time_window.value);
  const unit = String(time_window.unit || '').trim().toLowerCase();
  if (value > 0 && ['day', 'month', 'year'].includes(unit)) {
    return {
      value,
      unit
    };
  }

  return null;
}

function describe_time_window_label(time_window) {
  const normalized_time_window = normalize_time_window(time_window);
  if (!normalized_time_window) return '';

  if (normalized_time_window.preset === 'today') return '今天';
  if (normalized_time_window.preset === '7d') return '最近 7 天';
  if (normalized_time_window.preset === '30d') return '最近 30 天';
  if (normalized_time_window.preset === '60d') return '最近 60 天';
  if (normalized_time_window.preset === '2m') return '最近 2 个月';

  if (normalized_time_window.unit === 'day') {
    return `最近 ${normalized_time_window.value} 天`;
  }
  if (normalized_time_window.unit === 'month') {
    return `最近 ${normalized_time_window.value} 个月`;
  }
  return `最近 ${normalized_time_window.value} 年`;
}

function resolve_time_window_since(time_window, now = new Date()) {
  const normalized_time_window = normalize_time_window(time_window);
  if (!normalized_time_window) return 0;

  const current_date = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  if (Number.isNaN(current_date.getTime())) return 0;

  if (normalized_time_window.preset === 'today') {
    current_date.setHours(0, 0, 0, 0);
    return Math.trunc(current_date.getTime() / 1000);
  }

  if (normalized_time_window.preset === '7d') {
    current_date.setDate(current_date.getDate() - 7);
    return Math.trunc(current_date.getTime() / 1000);
  }
  if (normalized_time_window.preset === '30d') {
    current_date.setDate(current_date.getDate() - 30);
    return Math.trunc(current_date.getTime() / 1000);
  }
  if (normalized_time_window.preset === '60d') {
    current_date.setDate(current_date.getDate() - 60);
    return Math.trunc(current_date.getTime() / 1000);
  }
  if (normalized_time_window.preset === '2m') {
    current_date.setMonth(current_date.getMonth() - 2);
    return Math.trunc(current_date.getTime() / 1000);
  }

  if (normalized_time_window.unit === 'day') {
    current_date.setDate(current_date.getDate() - normalized_time_window.value);
  } else if (normalized_time_window.unit === 'month') {
    current_date.setMonth(current_date.getMonth() - normalized_time_window.value);
  } else {
    current_date.setFullYear(current_date.getFullYear() - normalized_time_window.value);
  }

  return Math.trunc(current_date.getTime() / 1000);
}

function filter_items_by_since(items = [], since = 0) {
  const normalized_since = Number(since) || 0;
  if (normalized_since <= 0) return items;

  return items.filter((item) => {
    const timestamp = Number(item?.timestamp);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return true;
    return timestamp >= normalized_since;
  });
}

async function syncInbox({
  pushbulletConfigPath = DEFAULT_PUSHBULLET_CONFIG_PATH,
  mode = 'latest',
  limit,
  timeWindow,
  maxPages,
  now = new Date(),
  onProgress,
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
    : createPushbulletProvider({
      accessToken: config.accessToken,
      limit: config.pageLimit,
      maxPages: config.maxPages
    });
  const normalizedMode = mode === 'all'
    ? 'all'
    : mode === 'bootstrap'
      ? 'bootstrap'
      : mode === 'recent'
        ? 'recent'
        : mode === 'window'
          ? 'window'
        : 'latest';
  const normalizedLimit = resolvePositiveInteger(limit);
  const normalizedTimeWindow = normalize_time_window(timeWindow);
  const normalizedMaxPages = resolvePositiveInteger(maxPages);
  if (normalizedMode === 'window' && !normalizedTimeWindow) {
    throw new Error('Inbox sync timeWindow is required for window mode.');
  }
  const emitProgress = (event) => {
    if (!event || typeof onProgress !== 'function') return;
    onProgress(event);
  };
  const since = normalizedMode === 'all' || normalizedMode === 'recent'
    || normalizedMode === 'bootstrap'
    ? 0
    : normalizedMode === 'window'
      ? resolve_time_window_since(normalizedTimeWindow, now)
    : Number(config.lastModified || 0);
  const defaultMaxPages = normalizedMode === 'all' || normalizedMode === 'bootstrap'
    ? resolvePositiveInteger(config.bootstrapMaxPages)
    : resolvePositiveInteger(config.maxPages);
  const resolvedMaxPages = normalizedMaxPages || defaultMaxPages;
  const pullArgs = {
    since,
    onPage: (event) => emitProgress({
      type: 'page',
      ...event
    }),
    ...(normalizedMode === 'recent' && normalizedLimit > 0 ? { maxItems: normalizedLimit } : {}),
    ...(resolvedMaxPages > 0 ? { maxPages: resolvedMaxPages } : {})
  };
  emitProgress({
    type: 'start',
    mode: normalizedMode,
    since,
    ...(normalizedLimit > 0 ? { limit: normalizedLimit } : {}),
    ...(normalizedTimeWindow ? { timeWindow: normalizedTimeWindow } : {}),
    ...(resolvedMaxPages > 0 ? { maxPages: resolvedMaxPages } : {})
  });
  const pullResult = await provider.pull(pullArgs);
  const pulledItems = Array.isArray(pullResult?.items) ? pullResult.items : [];
  const items = normalizedMode === 'window'
    ? filter_items_by_since(pulledItems, since)
    : pulledItems;
  const nextModified = Number(pullResult?.nextModified || 0);
  const inboxPath = resolveInboxPath(PATHS.projectDir, config.inboxPath);
  const store = storeFactory
    ? storeFactory(config)
    : createInboxStore({ filePath: inboxPath, archiveRoot: DEFAULT_INBOX_ARCHIVE_ROOT });
  const { added, skipped } = await store.append(items);
  emitProgress({
    type: 'store',
    added,
    skipped,
    total: items.length
  });

  const shouldAdvanceState = normalizedMode !== 'recent'
    && normalizedMode !== 'window'
    && !pullResult?.truncated;
  if (shouldAdvanceState) {
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
  if (normalizedMode !== 'recent') {
    result.stateAdvanced = shouldAdvanceState;
  }

  if (normalizedMode === 'recent' && normalizedLimit > 0) {
    result.limit = normalizedLimit;
    result.urls = extractUniqueUrls(items);
  }
  if (normalizedMode === 'window' && normalizedTimeWindow) {
    result.timeWindow = normalizedTimeWindow;
    result.windowLabel = describe_time_window_label(normalizedTimeWindow);
    result.urls = extractUniqueUrls(items);
  }
  if (resolvedMaxPages > 0) {
    result.maxPages = resolvedMaxPages;
  }
  if (Number.isFinite(Number(pullResult?.pagesFetched))) {
    result.pagesFetched = Number(pullResult.pagesFetched);
  }
  if (pullResult?.truncated) {
    result.truncated = true;
  }
  const warning = buildSyncWarningMessages(pullResult?.warning);
  const stateWarning = pullResult?.truncated && normalizedMode !== 'recent'
    ? 'Pushbullet result was truncated, so lastModified was not advanced.'
    : '';
  if (warning) {
    result.warning = warning;
    emitProgress({
      type: 'warning',
      warning,
      scope: 'provider'
    });
  }
  if (stateWarning) {
    result.stateWarning = stateWarning;
    emitProgress({
      type: 'warning',
      warning: stateWarning,
      scope: 'state'
    });
  }

  return result;
}

module.exports = {
  describe_time_window_label,
  filter_items_by_since,
  normalize_time_window,
  resolve_time_window_since,
  resolveInboxPath,
  syncInbox
};

const { buildTaskSummary } = require('./report');
const { buildNoteSaveTask, assertValidTask } = require('./task');

function clonePlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return JSON.parse(JSON.stringify(value));
}

function toCamelKey(value) {
  return String(value || '').replace(/_([a-z])/g, (_match, char) => char.toUpperCase());
}

function normalizeMetadataValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeMetadataValue(item));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  const normalized = {};
  for (const [key, entry] of Object.entries(value)) {
    normalized[toCamelKey(key)] = normalizeMetadataValue(entry);
  }
  return normalized;
}

function createStatusError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function normalizeRoute(value, fallback = 'local') {
  const route = String(value || '').trim();
  if (!route) return fallback;
  return route;
}

function normalizeDeliveryMode(value, fallback = 'immediate') {
  const mode = String(value || '').trim();
  if (!mode) return fallback;
  return mode;
}

function normalizeRequestedAt(value, now = new Date()) {
  const text = String(value || '').trim();
  if (!text) return now.toISOString();
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    return now.toISOString();
  }
  return date.toISOString();
}

function buildIngressTimestamp(requestedAt) {
  return Math.trunc(new Date(requestedAt).getTime() / 1000);
}

function assertValidIngressUrl(url) {
  const value = String(url || '').trim();
  try {
    const parsed = new URL(value);
    if (!/^https?:$/.test(parsed.protocol)) {
      throw new Error('unsupported');
    }
    return parsed.toString();
  } catch (_) {
    throw createStatusError('Invalid url');
  }
}

function normalizeIngressPayload(payload = {}, {
  defaultSource = 'external',
  defaultRoute = 'local',
  defaultDeliveryMode = 'immediate',
  now = new Date()
} = {}) {
  const input = payload && typeof payload === 'object' ? payload : {};
  const metadataInput = clonePlainObject(input.metadata);
  if (Object.prototype.hasOwnProperty.call(input, 'page_title')) {
    metadataInput.page_title = input.page_title;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'pageTitle')) {
    metadataInput.pageTitle = input.pageTitle;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'selection_text')) {
    metadataInput.selection_text = input.selection_text;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'selectionText')) {
    metadataInput.selectionText = input.selectionText;
  }

  const requestedAt = normalizeRequestedAt(input.requested_at || input.requestedAt, now);
  const metadata = normalizeMetadataValue(metadataInput);
  const title = String(
    input.title
    || metadata.pageTitle
    || metadata.title
    || ''
  ).trim();

  return {
    url: assertValidIngressUrl(input.url || input.link),
    source: String(input.source || defaultSource).trim() || defaultSource,
    route: normalizeRoute(input.route, defaultRoute),
    deliveryMode: normalizeDeliveryMode(
      input.delivery_mode || input.deliveryMode,
      defaultDeliveryMode
    ),
    requestedAt,
    metadata,
    title
  };
}

function buildIngressTask(payload = {}, options = {}) {
  const normalized = normalizeIngressPayload(payload, options);
  const task = buildNoteSaveTask({
    input: normalized.url,
    source: normalized.source,
    route: normalized.route,
    deliveryMode: normalized.deliveryMode,
    metadata: normalized.metadata
  });
  task.requestedAt = normalized.requestedAt;
  return assertValidTask(task);
}

function buildIngressInboxItem(payload = {}, options = {}) {
  const normalized = normalizeIngressPayload(payload, {
    ...options,
    defaultDeliveryMode: 'queue'
  });
  return {
    source: normalized.source,
    url: normalized.url,
    title: normalized.title,
    timestamp: buildIngressTimestamp(normalized.requestedAt),
    route: normalized.route,
    delivery_mode: normalized.deliveryMode,
    requested_at: normalized.requestedAt,
    metadata: normalized.metadata
  };
}

async function saveLinkViaIngress({
  payload,
  saveLinksText,
  saveOptions = {},
  defaults = {}
} = {}) {
  if (typeof saveLinksText !== 'function') {
    throw createStatusError('saveLinksText is required', 500);
  }
  const normalized = normalizeIngressPayload(payload, defaults);
  const task = buildIngressTask(normalized, defaults);
  const summary = await saveLinksText(normalized.url, {
    ...saveOptions,
    task,
    source: task.source
  });
  return {
    accepted: true,
    execution: 'immediate',
    task,
    report: buildTaskSummary(summary?.results || [], { includeWarnings: true })
  };
}

async function enqueueLinkViaIngress({
  payload,
  store,
  defaults = {}
} = {}) {
  if (!store || typeof store.append !== 'function') {
    throw createStatusError('store.append is required', 500);
  }
  const item = buildIngressInboxItem(payload, defaults);
  const queue = await store.append([item]);
  return {
    accepted: true,
    execution: 'queued',
    task: buildIngressTask({
      ...payload,
      url: item.url,
      source: item.source,
      route: item.route,
      delivery_mode: item.delivery_mode,
      requested_at: item.requested_at,
      metadata: item.metadata
    }, {
      ...defaults,
      defaultDeliveryMode: 'queue'
    }),
    queue,
    item
  };
}

module.exports = {
  buildIngressInboxItem,
  buildIngressTask,
  enqueueLinkViaIngress,
  normalizeIngressPayload,
  saveLinkViaIngress
};

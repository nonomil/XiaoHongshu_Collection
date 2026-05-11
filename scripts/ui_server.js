const fs = require('fs');
const http = require('http');
const https = require('https');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const {
  buildFailedSaveSummaryItem,
  buildSuccessfulSaveSummaryItem,
  formatSaveNoteError,
  getNavigationUrl,
  resumeNoteSaveFromCheckpoint,
  resolveRunModes,
  saveLinksText,
  saveMode
} = require('./save_note');
const { runTaskPipeline } = require('./lib/pipeline');
const { DEFAULT_LAUNCH_URL, launchProjectChromeSession } = require('./lib/browser_session');
const { buildBrowserTargets, connectToChrome, send } = require('./lib/cdp_note');
const { resolveProjectPaths } = require('./lib/config');
const { createInboxStore } = require('./lib/inbox_store');
const { saveInboxUrls } = require('./lib/inbox_save');
const { enqueueLinkViaIngress, saveLinkViaIngress } = require('./lib/ingress');
const { handleFeishuWebhook } = require('./lib/ingress_webhook');
const { loadUiConfig, mergeUiConfig, saveUiConfig } = require('./lib/ui_config');
const { loadPushbulletConfig, savePushbulletConfig } = require('./lib/pushbullet_config');
const { normalize_time_window, resolveInboxPath, syncInbox } = require('./lib/inbox_sync');
const { logError, logInfo } = require('./lib/logger');
const {
  openFolder,
  openOutputFolder: defaultOpenOutputFolder
} = require('./lib/open_output');
const { exportLinksList: defaultExportLinksList } = require('./lib/export_links_list');
const { buildTaskResult, buildTaskSummary } = require('./lib/report');
const { run: runZhihuFavoritesCli } = require('./save_zhihu_favorites');
const {
  assertValidTask,
  buildCollectionTask,
  buildNoteSaveTask
} = require('./lib/task');
const {
  loadOpenRouterConfig,
  normalizeOpenRouterConfig,
  saveOpenRouterConfig
} = require('./lib/config');

const PATHS = resolveProjectPaths(path.resolve(__dirname, '..'));
const PROJECT_DIR = PATHS.projectDir;
const UI_DIR = path.join(PROJECT_DIR, 'ui');
const DEFAULT_PORT = Number(process.env.XHS_UI_PORT || 3030);
const DEFAULT_UI_CONFIG_PATH = path.join(PATHS.configDir, 'ui.json');
const DEFAULT_PUSHBULLET_CONFIG_PATH = path.join(PATHS.configDir, 'pushbullet.json');
const DEFAULT_OPENROUTER_CONFIG_PATH = path.join(PATHS.configDir, 'openrouter.json');
const DEFAULT_INBOX_ARCHIVE_ROOT = path.join(PATHS.dataDir, 'inbox_archive');
const DEFAULT_VIDEO_NOTES_DIR = path.join(PROJECT_DIR, 'prj', 'Notes_Video_Collection');
const DEFAULT_VIDEO_NOTES_SCRIPT_PATH = path.join(DEFAULT_VIDEO_NOTES_DIR, 'start_web_ui.bat');
const DEFAULT_VIDEO_NOTES_URL = process.env.NOTES_VIDEO_WEB_URL || 'http://127.0.0.1:7860/';
const DEFAULT_VIDEO_NOTES_FALLBACK_URL = buildFallbackUrl(
  DEFAULT_VIDEO_NOTES_URL,
  process.env.NOTES_VIDEO_WEB_FALLBACK_URL || ''
);

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let raw = '';

    request.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error('Request body too large'));
        request.destroy();
      }
    });
    request.on('end', () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (_) {
        reject(new Error('Invalid JSON payload'));
      }
    });
    request.on('error', reject);
  });
}

function getContentType(filepath) {
  switch (path.extname(filepath).toLowerCase()) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.js':
      return 'application/javascript; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    default:
      return 'text/plain; charset=utf-8';
  }
}

function resolveStaticFile(urlPathname, uiDir = UI_DIR) {
  const requestPath = urlPathname === '/' ? '/index.html' : urlPathname;
  const normalized = path.normalize(requestPath).replace(/^(\.\.[\\/])+/, '');
  const filepath = path.join(uiDir, normalized);

  if (!filepath.startsWith(path.resolve(uiDir))) {
    return '';
  }

  if (!fs.existsSync(filepath) || fs.statSync(filepath).isDirectory()) {
    return '';
  }

  return filepath;
}

function serveStatic(request, response, uiDir = UI_DIR) {
  const url = new URL(request.url, 'http://127.0.0.1');
  const filepath = resolveStaticFile(url.pathname, uiDir);

  if (!filepath) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not Found');
    return;
  }

  response.writeHead(200, {
    'Content-Type': getContentType(filepath),
    'Cache-Control': 'no-store'
  });
  fs.createReadStream(filepath).pipe(response);
}

function runNodeScript(scriptRelativePath, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(PROJECT_DIR, scriptRelativePath)], {
      cwd: PROJECT_DIR,
      windowsHide: true,
      env: { ...process.env, ...(options.env || {}) }
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', (code) => {
      const logs = `${stdout}${stderr}`
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      if (code !== 0) {
        const error = new Error(`Script failed: ${scriptRelativePath}`);
        error.code = code;
        error.logs = logs;
        reject(error);
        return;
      }

      resolve({
        script: path.basename(scriptRelativePath),
        code,
        logs
      });
    });
  });
}

function buildCollectionEnv(overrides = {}) {
  const env = {};
  if (overrides.collectionRawPath) env.XHS_RAW_PATH = overrides.collectionRawPath;
  if (overrides.collectionOutputRoot) env.XHS_OUTPUT_ROOT = overrides.collectionOutputRoot;
  if (overrides.conflictStrategy) env.XHS_CONFLICT_STRATEGY = overrides.conflictStrategy;
  if (overrides.maxTitleLength) env.XHS_MAX_TITLE_LENGTH = String(overrides.maxTitleLength);
  const runtime = overrides.runtime || {};
  if (runtime.aiSummaryEnabled === false) env.XHS_AI_SUMMARY_ENABLED = '0';
  if (runtime.visionOcrEnabled === false) env.XHS_VISION_OCR_ENABLED = '0';
  if (runtime.ocrFallbackEnabled === false) env.XHS_OCR_FALLBACK_ENABLED = '0';
  if (Object.prototype.hasOwnProperty.call(runtime, 'openRouterBaseUrl')) {
    env.XHS_OPENROUTER_BASE_URL = String(runtime.openRouterBaseUrl || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(runtime, 'openRouterModel')) {
    env.XHS_OPENROUTER_MODEL = String(runtime.openRouterModel || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(runtime, 'openRouterApiKey')) {
    const apiKey = String(runtime.openRouterApiKey || '').trim();
    if (apiKey) {
      env.XHS_OPENROUTER_API_KEY = apiKey;
    }
  }
  if (runtime.openRouterTimeoutMs) env.XHS_OPENROUTER_TIMEOUT_MS = String(runtime.openRouterTimeoutMs);
  if (runtime.visionOcrTimeoutMs) env.XHS_VISION_OCR_TIMEOUT_MS = String(runtime.visionOcrTimeoutMs);
  if (runtime.maxImagesPerNote) env.XHS_MAX_IMAGES_PER_NOTE = String(runtime.maxImagesPerNote);
  return env;
}

function extractIncomingConfig(payload) {
  if (!payload || typeof payload !== 'object') return {};
  const incoming = payload.uiConfig || payload.config || payload;
  return incoming && typeof incoming === 'object' ? incoming : {};
}

function resolveUiConfig(configPath, payload) {
  const stored = loadUiConfig({ configPath });
  return mergeUiConfig(stored, extractIncomingConfig(payload));
}

function sanitizePushbulletForUi(config) {
  const enabled = config?.enabled === true;
  const inboxPath = typeof config?.inboxPath === 'string' ? config.inboxPath : '';
  const lastModified = Number(config?.lastModified || 0) || 0;
  const hasAccessToken = Boolean(String(config?.accessToken || '').trim());
  return {
    enabled,
    inboxPath,
    lastModified,
    hasAccessToken
  };
}

function sanitizeOpenRouterForUi(config) {
  const normalized = normalizeOpenRouterConfig(config);
  return {
    baseUrl: normalized.baseUrl,
    model: normalized.model,
    hasApiKey: Boolean(String(normalized.apiKey || '').trim()),
    timeoutMs: Number(normalized.timeoutMs || 30000) || 30000
  };
}

function stripOpenRouterRuntimeFields(runtime = {}) {
  if (!runtime || typeof runtime !== 'object') return runtime;
  const next = { ...runtime };
  delete next.openRouterBaseUrl;
  delete next.openRouterModel;
  delete next.openRouterApiKey;
  delete next.hasOpenRouterApiKey;
  return next;
}

function extractOpenRouterRuntimePayload(runtime = {}) {
  if (!runtime || typeof runtime !== 'object') return {};
  const next = {};
  if (Object.prototype.hasOwnProperty.call(runtime, 'openRouterBaseUrl')) {
    next.baseUrl = String(runtime.openRouterBaseUrl || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(runtime, 'openRouterModel')) {
    next.model = String(runtime.openRouterModel || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(runtime, 'openRouterApiKey')) {
    const apiKey = String(runtime.openRouterApiKey || '').trim();
    if (apiKey) {
      next.apiKey = apiKey;
    }
  }
  if (Object.prototype.hasOwnProperty.call(runtime, 'openRouterTimeoutMs')) {
    next.timeoutMs = Number(runtime.openRouterTimeoutMs);
  }
  return next;
}

function applyOpenRouterUiFields(config, openRouterConfig) {
  const openRouter = sanitizeOpenRouterForUi(openRouterConfig);
  return {
    ...config,
    runtime: {
      ...(config.runtime || {}),
      openRouterBaseUrl: openRouter.baseUrl,
      openRouterModel: openRouter.model,
      hasOpenRouterApiKey: openRouter.hasApiKey
    }
  };
}

function applyRuntimeOpenRouterOverrides(baseConfig, runtime = {}) {
  const next = { ...normalizeOpenRouterConfig(baseConfig) };
  if (!runtime || typeof runtime !== 'object') return next;
  if (Object.prototype.hasOwnProperty.call(runtime, 'openRouterBaseUrl')) {
    next.baseUrl = String(runtime.openRouterBaseUrl || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(runtime, 'openRouterModel')) {
    next.model = String(runtime.openRouterModel || '').trim();
  }
  if (Object.prototype.hasOwnProperty.call(runtime, 'openRouterApiKey')) {
    const apiKey = String(runtime.openRouterApiKey || '').trim();
    if (apiKey) {
      next.apiKey = apiKey;
    }
  }
  if (Object.prototype.hasOwnProperty.call(runtime, 'openRouterTimeoutMs')) {
    next.timeoutMs = Number(runtime.openRouterTimeoutMs);
  }
  return normalizeOpenRouterConfig(next);
}

function resolveOpenRouterConfigForRequest({ payload, openrouterConfigPath }) {
  const stored = loadOpenRouterConfig({ configPath: openrouterConfigPath, projectDir: PROJECT_DIR });
  const incoming = extractIncomingConfig(payload);
  return applyRuntimeOpenRouterOverrides(stored, incoming.runtime);
}

function postJsonToUrl(url, headers, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const target = new URL(url);
    const client = target.protocol === 'http:' ? http : https;
    const request = client.request({
      method: 'POST',
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || undefined,
      path: `${target.pathname}${target.search}`,
      headers: {
        ...headers,
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let rawData = '';
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          const error = new Error(`HTTP ${res.statusCode}: ${rawData.substring(0, 200)}`);
          error.statusCode = res.statusCode;
          reject(error);
          return;
        }
        resolve(rawData);
      });
    });

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error('AI API request timeout'));
    });
    request.on('error', reject);
    request.write(data);
    request.end();
  });
}

async function defaultTestAiApi({ config }) {
  const normalized = normalizeOpenRouterConfig(config);
  const baseUrl = normalized.baseUrl;
  const model = normalized.model;
  if (!String(normalized.apiKey || '').trim()) {
    return {
      reachable: false,
      statusCode: 400,
      message: '请先填写可用的 AI API Key',
      baseUrl,
      model
    };
  }

  try {
    const endpoint = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
    const payload = {
      model,
      messages: [
        { role: 'system', content: 'You are a connectivity checker.' },
        { role: 'user', content: 'ping' }
      ],
      temperature: 0,
      max_tokens: 1
    };
    const rawText = await postJsonToUrl(endpoint, {
      Authorization: `Bearer ${normalized.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/nonomil/XiaoHongshu_Collection',
      'X-Title': 'XiaoHongshu Collection UI Connectivity Check'
    }, payload, Math.min(Number(normalized.timeoutMs || 30000), 15000));
    const parsed = JSON.parse(rawText);
    if (!Array.isArray(parsed?.choices) || parsed.choices.length === 0) {
      throw new Error('AI API 返回缺少 choices 字段');
    }
    return {
      reachable: true,
      statusCode: 200,
      message: `AI API 联通正常：${model}`,
      baseUrl,
      model
    };
  } catch (error) {
    return {
      reachable: false,
      statusCode: Number(error?.statusCode || 0) || 502,
      message: error?.message || 'AI API 请求失败',
      baseUrl,
      model
    };
  }
}

function buildMergedUiConfig({ uiConfigPath, pushbulletConfigPath, openrouterConfigPath }) {
  const storedUi = loadUiConfig({ configPath: uiConfigPath });
  let merged = mergeUiConfig(storedUi, {});
  const pushbullet = loadPushbulletConfig({ configPath: pushbulletConfigPath });
  merged.pushbullet = sanitizePushbulletForUi(pushbullet);
  const openRouter = loadOpenRouterConfig({ configPath: openrouterConfigPath, projectDir: PROJECT_DIR });
  merged = applyOpenRouterUiFields(merged, openRouter);
  return merged;
}

function waitForSpawn(child) {
  if (!child || typeof child.once !== 'function') {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      if (typeof child.off === 'function') {
        child.off('error', onError);
        child.off('spawn', onSpawn);
      } else if (typeof child.removeListener === 'function') {
        child.removeListener('error', onError);
        child.removeListener('spawn', onSpawn);
      }
    };
    const onError = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onSpawn = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    child.once('error', onError);
    child.once('spawn', onSpawn);
  });
}

function resolveUrlPort(rawUrl) {
  const parsed = new URL(rawUrl);
  if (parsed.port) {
    return Number(parsed.port);
  }
  return parsed.protocol === 'https:' ? 443 : 80;
}

function buildFallbackUrl(primaryUrl, overrideUrl) {
  const override = String(overrideUrl || '').trim();
  if (override) {
    return override;
  }

  const parsed = new URL(primaryUrl);
  parsed.port = String(resolveUrlPort(primaryUrl) + 1);
  return parsed.toString();
}

function isPortListening(port, host = '127.0.0.1', timeoutMs = 400) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host });
    let settled = false;
    const finish = (result) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

function probeWebUrl(rawUrl, timeoutMs = 2_000) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(rawUrl);
    const transport = parsed.protocol === 'https:' ? https : http;
    const request = transport.request(parsed, {
      method: 'GET'
    }, (response) => {
      response.resume();
      resolve();
    });

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Timed out while probing ${rawUrl}`));
    });
    request.once('error', reject);
    request.end();
  });
}

async function waitForUrl(urls, {
  intervalMs = 500,
  timeoutMs = 45_000
} = {}) {
  const candidates = Array.from(new Set(urls.filter(Boolean)));
  const deadline = Date.now() + timeoutMs;
  let lastError = null;

  while (Date.now() <= deadline) {
    for (const candidate of candidates) {
      try {
        await probeWebUrl(candidate);
        return candidate;
      } catch (error) {
        lastError = error;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  const hint = candidates.join('、');
  const error = new Error(`视频图文笔记 Web 启动超时，请稍后重试或运行 start_web_ui_debug.bat 排查：${hint}`);
  error.cause = lastError;
  throw error;
}

async function openVideoNotesFolder({
  folderPath = DEFAULT_VIDEO_NOTES_DIR
} = {}) {
  return openFolder(folderPath);
}

async function startVideoNotesWeb({
  folderPath = DEFAULT_VIDEO_NOTES_DIR,
  scriptPath = DEFAULT_VIDEO_NOTES_SCRIPT_PATH,
  url = DEFAULT_VIDEO_NOTES_URL,
  fallbackUrl = DEFAULT_VIDEO_NOTES_FALLBACK_URL,
  spawnFn = spawn,
  isPortListeningFn = isPortListening,
  waitForUrlFn = waitForUrl
} = {}) {
  const resolvedFolderPath = path.normalize(String(folderPath || '').trim());
  const resolvedScriptPath = path.normalize(String(scriptPath || '').trim());
  const resolvedUrl = String(url || '').trim();
  const resolvedFallbackUrl = String(fallbackUrl || '').trim();

  if (!resolvedFolderPath || !fs.existsSync(resolvedFolderPath)) {
    throw new Error(`视频图文笔记目录不存在：${resolvedFolderPath || folderPath}`);
  }
  if (!resolvedScriptPath || !fs.existsSync(resolvedScriptPath)) {
    throw new Error(`视频图文笔记启动脚本不存在：${resolvedScriptPath || scriptPath}`);
  }

  const preferredUrls = [resolvedUrl];
  if (resolvedFallbackUrl) {
    const primaryPort = resolveUrlPort(resolvedUrl);
    const primaryHost = new URL(resolvedUrl).hostname;
    const fallbackPort = resolveUrlPort(resolvedFallbackUrl);
    const fallbackHost = new URL(resolvedFallbackUrl).hostname;

    if (await isPortListeningFn(primaryPort, primaryHost)) {
      if (await isPortListeningFn(fallbackPort, fallbackHost)) {
        throw new Error(`视频图文笔记 Web 端口已被占用：${primaryPort} 和 ${fallbackPort}`);
      }
      preferredUrls[0] = resolvedFallbackUrl;
    }
  }

  const child = spawnFn('cmd.exe', ['/d', '/s', '/c', `"${resolvedScriptPath}"`], {
    cwd: resolvedFolderPath,
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });
  if (child && typeof child.unref === 'function') {
    child.unref();
  }
  await waitForSpawn(child);
  const readyUrl = await waitForUrlFn(preferredUrls);

  return {
    folderPath: resolvedFolderPath,
    scriptPath: resolvedScriptPath,
    url: readyUrl
  };
}

function sendNdjson(response, payload) {
  response.write(`${JSON.stringify(payload)}\n`);
}

function summarizeErrorMessage(error) {
  const logs = Array.isArray(error?.logs) ? error.logs : [];
  if (logs.length === 0) {
    return error?.message || 'Internal Server Error';
  }

  const loginLine = logs.find((line) => /登录|账号异常|无登录/.test(line));
  if (loginLine) return loginLine;

  return logs[logs.length - 1] || error?.message || 'Internal Server Error';
}

function buildBaseResultFromMode(mode = {}, fallbackInput = '', index = 0) {
  const navigationUrl = getNavigationUrl(mode) || String(fallbackInput || '').trim();
  return {
    index,
    noteId: mode?.noteId || '',
    input: mode?.input || navigationUrl,
    canonicalUrl: mode?.canonicalUrl || '',
    navigationUrl
  };
}

async function runSaveLinksWithProgress({ text, uiConfig, onEvent }) {
  const task = buildNoteSaveTask({ input: text, source: 'ui' });
  assertValidTask(task);

  const modes = await resolveRunModes({
    mode: 'input',
    input: text,
    browser: uiConfig.browser
  });
  const targets = modes.map((mode, index) => ({
    index,
    noteId: mode.noteId || '',
    canonicalUrl: mode.canonicalUrl || '',
    navigationUrl: getNavigationUrl(mode)
  }));

  if (onEvent) {
    onEvent({ type: 'start', total: modes.length, targets });
  }

  const results = [];
  for (let index = 0; index < modes.length; index += 1) {
    const mode = modes[index];
    const baseResult = {
      index,
      noteId: mode.noteId || '',
      input: mode.input || getNavigationUrl(mode),
      canonicalUrl: mode.canonicalUrl || '',
      navigationUrl: getNavigationUrl(mode)
    };

    if (onEvent) {
      onEvent({ type: 'tick', index, total: modes.length, target: targets[index] });
    }

    try {
      const saved = await saveMode(mode, {
        task,
        source: 'ui',
        outputRoot: uiConfig.paths.saveLinksOutputRoot || undefined,
        imagesRoot: uiConfig.paths.saveLinksImagesRoot || undefined,
        conflictStrategy: uiConfig.naming.conflictStrategy,
        maxTitleLength: uiConfig.naming.maxTitleLength,
        uiRuntime: uiConfig.runtime,
        classificationCategories: uiConfig.inbox?.categories
      });
      const item = buildSuccessfulSaveSummaryItem(baseResult, saved);
      results.push(item);
      if (onEvent) onEvent({ type: 'progress', index, total: modes.length, result: item });
    } catch (error) {
      const item = buildFailedSaveSummaryItem(baseResult, error, {
        orchestration: {
          checkpointRoot: path.join(PATHS.cacheDir, 'browser-task-checkpoints')
        }
      });
      results.push(item);
      if (onEvent) onEvent({ type: 'progress', index, total: modes.length, result: item });
    }
  }

  const report = buildTaskSummary(results, { includeWarnings: true });
  return { task, report };
}

async function runCollectionExport(task, options = {}) {
  const env = buildCollectionEnv(options.overrides || {});
  if (task) {
    assertValidTask(task);
  }
  const pipeline = await runTaskPipeline({
    task: task || buildCollectionTask({ source: 'ui' }),
    fetchFn: async () => runNodeScript('scripts/extract_v4.js', { env }),
    enrichFn: async (payload) => payload,
    writeFn: async () => runNodeScript('scripts/ocr_and_write.js', { env }),
    reportFn: async (payload) => {
      const fetchResult = payload.steps.fetch?.data;
      const writeResult = payload.steps.write?.data;
      return {
        steps: [
          fetchResult ? { script: fetchResult.script, code: fetchResult.code } : null,
          writeResult ? { script: writeResult.script, code: writeResult.code } : null
        ].filter(Boolean),
        logs: [
          ...(fetchResult?.logs || []),
          ...(writeResult?.logs || [])
        ]
      };
    }
  });

  if (!pipeline.ok) {
    throw pipeline.error || new Error('Collection export failed');
  }

  return pipeline.report;
}

function buildZhihuFavoritesBrowserCandidates(browser = {}) {
  const resolvedBrowser = browser && typeof browser === 'object' ? browser : {};
  const mode = String(resolvedBrowser.mode || '').trim();
  const browserUrl = String(resolvedBrowser.browserUrl || '').trim();
  const channel = String(resolvedBrowser.channel || '').trim();
  const candidates = [];

  if (mode || browserUrl || channel) {
    candidates.push({
      label: 'configured-browser',
      browser: {
        ...(mode ? { mode } : {}),
        ...(browserUrl ? { browserUrl } : {}),
        ...(channel ? { channel } : {})
      }
    });
  }

  candidates.push({
    label: 'current-browser',
    browser: {
      mode: 'current-browser',
      ...(browserUrl ? { browserUrl } : {}),
      ...(channel ? { channel } : {})
    }
  });
  candidates.push({ label: 'project-browser', browser: {} });
  return candidates;
}

function buildZhihuFavoritesReport(payload = {}) {
  const summary = payload?.summary || {};
  const warnings = (Array.isArray(payload?.collect?.warnings) ? payload.collect.warnings : [])
    .map((message) => String(message || '').trim())
    .filter(Boolean)
    .map((message) => ({
      code: 'favorites_warning',
      message
    }));

  return {
    total: Number(summary.total || 0) || 0,
    successCount: Number(summary.successCount || 0) || 0,
    failureCount: Number(summary.failureCount || 0) || 0,
    results: Array.isArray(summary.results) ? summary.results : [],
    warnings,
    outputFolder: String(payload?.paths?.rootDir || '').trim(),
    collectionId: String(payload?.collectionId || '').trim(),
    collectionTitle: String(payload?.collectionTitle || '').trim()
  };
}

function closeSocketQuietly(ws) {
  if (!ws || typeof ws.close !== 'function') return;
  try {
    ws.close();
  } catch (_) {
    // ignore socket close failures
  }
}

function matchesCookieDomain(domain, expectedDomain) {
  const normalizedDomain = String(domain || '').trim().replace(/^\./, '').toLowerCase();
  const normalizedExpected = String(expectedDomain || '').trim().replace(/^\./, '').toLowerCase();
  if (!normalizedDomain || !normalizedExpected) return false;
  return normalizedDomain === normalizedExpected || normalizedDomain.endsWith(`.${normalizedExpected}`);
}

function resolveBrowserStatusForCookies({
  cookies = [],
  domain,
  authCookieNames = []
} = {}) {
  const domainCookies = (Array.isArray(cookies) ? cookies : []).filter((cookie) =>
    matchesCookieDomain(cookie?.domain, domain)
  );
  const authSet = new Set(authCookieNames.map((item) => String(item || '').trim()).filter(Boolean));
  const hasAuthCookie = domainCookies.some((cookie) => authSet.has(String(cookie?.name || '').trim()));

  if (hasAuthCookie) {
    return {
      state: 'logged_in',
      label: '已检测到登录态'
    };
  }
  if (domainCookies.length > 0) {
    return {
      state: 'logged_out',
      label: '未检测到登录态'
    };
  }
  return {
    state: 'unknown',
    label: '未检测'
  };
}

function fetchTabsFromBrowserTarget(targetUrl) {
  return new Promise((resolve, reject) => {
    http.get(targetUrl, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          const tabs = JSON.parse(raw || '[]');
          resolve(Array.isArray(tabs) ? tabs : []);
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

async function readBrowserTabs(browser = {}) {
  const targets = buildBrowserTargets({
    browserMode: browser.mode,
    browserChannel: browser.channel,
    browserUrl: browser.browserUrl
  });
  const errors = [];

  for (const target of targets) {
    try {
      const tabs = await fetchTabsFromBrowserTarget(target);
      return { tabs, target };
    } catch (error) {
      errors.push(error);
    }
  }

  if (errors.length > 0) {
    throw errors[0];
  }
  return { tabs: [], target: '' };
}

function hasTabForPattern(tabs = [], pattern) {
  return (Array.isArray(tabs) ? tabs : []).some((tab) => pattern.test(String(tab?.url || '')));
}

async function getBrowserStatus({
  uiConfig
} = {}) {
  const browser = uiConfig?.browser && typeof uiConfig.browser === 'object'
    ? uiConfig.browser
    : {};
  const browserLabel = browser.mode === 'current-browser' ? '当前浏览器' : '项目浏览器';
  let ws;
  let tabs = [];
  let target = '';

  try {
    try {
      const tabResult = await readBrowserTabs(browser);
      tabs = tabResult.tabs;
      target = tabResult.target;
    } catch (_) {
      tabs = [];
      target = '';
    }

    ws = await connectToChrome({
      browserMode: browser.mode,
      browserChannel: browser.channel,
      browserUrl: browser.browserUrl,
      wsEndpoint: browser.wsEndpoint,
      requireXiaohongshu: false
    });
    let cookies = [];

    try {
      const storageResult = await send(ws, 'Storage.getCookies');
      cookies = Array.isArray(storageResult?.cookies) ? storageResult.cookies : [];
    } catch (_) {
      cookies = [];
    }

    if (cookies.length === 0) {
      const networkResult = await send(ws, 'Network.getCookies', {
        urls: [
          'https://www.xiaohongshu.com/',
          'https://www.zhihu.com/',
          'https://zhuanlan.zhihu.com/'
        ]
      });
      cookies = Array.isArray(networkResult?.cookies) ? networkResult.cookies : [];
    }

    return {
      connected: true,
      browserLabel,
      browserDetail: target
        ? `已连接 ${target}`
        : '已连接 Chrome 调试会话',
      checkedAt: new Date().toISOString(),
      tabs: {
        xiaohongshu: hasTabForPattern(tabs, /xiaohongshu\.com/i),
        zhihu: hasTabForPattern(tabs, /zhihu\.com/i)
      },
      platforms: {
        xiaohongshu: resolveBrowserStatusForCookies({
          cookies,
          domain: 'xiaohongshu.com',
          authCookieNames: ['web_session']
        }),
        zhihu: resolveBrowserStatusForCookies({
          cookies,
          domain: 'zhihu.com',
          authCookieNames: ['z_c0']
        })
      }
    };
  } catch (error) {
    return {
      connected: false,
      browserLabel: '未连接浏览器',
      browserDetail: error.message || '未检测到可复用的 Chrome 调试会话',
      checkedAt: new Date().toISOString(),
      tabs: {
        xiaohongshu: false,
        zhihu: false
      },
      platforms: {
        xiaohongshu: {
          state: 'unknown',
          label: '未检测'
        },
        zhihu: {
          state: 'unknown',
          label: '未检测'
        }
      }
    };
  } finally {
    closeSocketQuietly(ws);
  }
}

async function runZhihuFavoritesExport({
  collectionUrl,
  title,
  limit,
  uiConfig
} = {}) {
  const resolvedConfig = uiConfig && typeof uiConfig === 'object' ? uiConfig : {};
  const browser = resolvedConfig.browser && typeof resolvedConfig.browser === 'object'
    ? resolvedConfig.browser
    : {};
  const outputRoot = String(resolvedConfig?.paths?.collectionOutputRoot || '').trim() || PATHS.outputDir;
  const parsed = {
    collectionUrl: String(collectionUrl || '').trim(),
    title: String(title || '').trim(),
    outputRoot
  };
  if (limit) {
    parsed.limit = Math.max(1, Number(limit) || 0);
  }

  return runZhihuFavoritesCli([], {
    parsed,
    outputRoot,
    browserCandidates: buildZhihuFavoritesBrowserCandidates(browser),
    saveLinksTextFn: (text, options = {}) => saveLinksText(text, {
      ...options,
      source: 'ui',
      browser,
      outputRoot: options.outputRoot || undefined,
      imagesRoot: resolvedConfig?.paths?.saveLinksImagesRoot || undefined,
      conflictStrategy: resolvedConfig?.naming?.conflictStrategy,
      maxTitleLength: resolvedConfig?.naming?.maxTitleLength,
      uiRuntime: resolvedConfig?.runtime,
      classificationCategories: resolvedConfig?.inbox?.categories
    })
  });
}

function createUiServer({
  saveLinksText: saveLinks = saveLinksText,
  resumeNoteSave: resumeNoteSave = resumeNoteSaveFromCheckpoint,
  runCollectionExport: runCollection = runCollectionExport,
  runZhihuFavoritesExport: runZhihuFavorites = runZhihuFavoritesExport,
  getBrowserStatus: resolveBrowserStatus = getBrowserStatus,
  runInboxSync: runInbox = syncInbox,
  runInboxSave,
  testAiApi = defaultTestAiApi,
  saveIngressLink,
  enqueueIngressLink,
  handleFeishuWebhook: runFeishuWebhook = handleFeishuWebhook,
  openOutputFolder = defaultOpenOutputFolder,
  openVideoNotesFolder: openVideoNotesWorkspace = openVideoNotesFolder,
  startVideoNotesWeb: startVideoNotesWorkspace = startVideoNotesWeb,
  openLoginBrowser = async ({ browser, url }) => launchProjectChromeSession({
    url: url || DEFAULT_LAUNCH_URL,
    browser: {
      channel: browser?.channel || '',
      headless: false
    }
  }),
  exportLinksList = defaultExportLinksList,
  uiDir = UI_DIR,
  uiConfigPath = DEFAULT_UI_CONFIG_PATH,
  pushbulletConfigPath = DEFAULT_PUSHBULLET_CONFIG_PATH,
  openrouterConfigPath = DEFAULT_OPENROUTER_CONFIG_PATH
} = {}) {
  let activeTask = '';
  const runInboxSaveWithConfig = runInboxSave
    || (async ({ uiConfig, urls, syncReport, onProgress }) => {
      const summaryResult = await saveInboxUrls({
        pushbulletConfigPath,
        uiConfig,
        urls,
        syncReport,
        onProgress,
        saveLinksText: (text, options = {}) => saveLinks(text, {
          ...options,
          source: 'ui',
          browser: options.browser || uiConfig.browser,
          outputRoot: options.outputRoot || uiConfig.paths.saveLinksOutputRoot || undefined,
          imagesRoot: options.imagesRoot || uiConfig.paths.saveLinksImagesRoot || undefined,
          conflictStrategy: uiConfig.naming.conflictStrategy,
          maxTitleLength: uiConfig.naming.maxTitleLength,
          uiRuntime: uiConfig.runtime
        })
      });
      return summaryResult;
    });
  const runIngressSaveLink = saveIngressLink
    || (async ({ payload, uiConfig }) => saveLinkViaIngress({
      payload,
      saveLinksText: saveLinks,
      saveOptions: {
        browser: uiConfig.browser,
        outputRoot: uiConfig.paths.saveLinksOutputRoot || undefined,
        imagesRoot: uiConfig.paths.saveLinksImagesRoot || undefined,
        conflictStrategy: uiConfig.naming.conflictStrategy,
        maxTitleLength: uiConfig.naming.maxTitleLength,
        uiRuntime: uiConfig.runtime,
        classificationCategories: uiConfig.inbox?.categories
      }
    }));
  const runIngressEnqueueLink = enqueueIngressLink
    || (async ({ payload }) => {
      const config = loadPushbulletConfig({ configPath: pushbulletConfigPath });
      const inboxPath = resolveInboxPath(PATHS.projectDir, config.inboxPath);
      const store = createInboxStore({
        filePath: inboxPath,
        archiveRoot: DEFAULT_INBOX_ARCHIVE_ROOT
      });
      return enqueueLinkViaIngress({
        payload,
        store
      });
    });

  async function runExclusive(taskName, task) {
    if (activeTask) {
      const error = new Error(`已有任务正在运行中：${activeTask}`);
      error.statusCode = 409;
      throw error;
    }

    activeTask = taskName;
    try {
      return await task();
    } finally {
      activeTask = '';
    }
  }

  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');

      if (request.method === 'GET') {
        if (url.pathname === '/api/ui-config') {
          const config = buildMergedUiConfig({
            uiConfigPath,
            pushbulletConfigPath,
            openrouterConfigPath
          });
          sendJson(response, 200, { ok: true, config });
          return;
        }
        serveStatic(request, response, uiDir);
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/ui-config') {
        const payload = await readJsonBody(request);
        const incoming = extractIncomingConfig(payload);
        const runtimeIncomingRaw = incoming.runtime && typeof incoming.runtime === 'object'
          ? incoming.runtime
          : undefined;
        const openRouterIncoming = extractOpenRouterRuntimePayload(runtimeIncomingRaw);

        const storedUi = loadUiConfig({ configPath: uiConfigPath });
        const inboxSection = incoming.inbox && typeof incoming.inbox === 'object'
          && incoming.inbox.categories && typeof incoming.inbox.categories === 'object'
          && !Array.isArray(incoming.inbox.categories)
          ? { categories: incoming.inbox.categories }
          : undefined;
        const uiIncoming = {
          paths: incoming.paths,
          browser: incoming.browser,
          naming: incoming.naming,
          runtime: stripOpenRouterRuntimeFields(runtimeIncomingRaw),
          ingress: incoming.ingress,
          inbox: inboxSection,
          ui: incoming.ui
        };
        const uiMerged = mergeUiConfig(storedUi, uiIncoming);
        saveUiConfig({ configPath: uiConfigPath, payload: uiMerged });

        if (Object.keys(openRouterIncoming).length > 0) {
          saveOpenRouterConfig({
            configPath: openrouterConfigPath,
            projectDir: PROJECT_DIR,
            payload: openRouterIncoming
          });
        }

        const storedPushbullet = loadPushbulletConfig({ configPath: pushbulletConfigPath });
        const incomingPushbullet = incoming.pushbullet && typeof incoming.pushbullet === 'object'
          ? incoming.pushbullet
          : {};

        const nextPushbullet = {
          enabled: storedPushbullet.enabled === true,
          accessToken: String(storedPushbullet.accessToken || ''),
          lastModified: Number(storedPushbullet.lastModified || 0) || 0,
          inboxPath: typeof storedPushbullet.inboxPath === 'string'
            ? storedPushbullet.inboxPath
            : 'data/inbox_links.jsonl'
        };

        if (typeof incomingPushbullet.enabled === 'boolean') {
          nextPushbullet.enabled = incomingPushbullet.enabled;
        }

        if (Object.prototype.hasOwnProperty.call(incomingPushbullet, 'inboxPath')) {
          nextPushbullet.inboxPath = String(incomingPushbullet.inboxPath || '').trim();
        } else if (incoming.inbox && Object.prototype.hasOwnProperty.call(incoming.inbox, 'path')) {
          // Backward compatible: older UI versions posted inbox.path instead of pushbullet.inboxPath.
          nextPushbullet.inboxPath = String(incoming.inbox.path || '').trim();
        }

        if (Object.prototype.hasOwnProperty.call(incomingPushbullet, 'accessToken')) {
          const token = String(incomingPushbullet.accessToken || '').trim();
          if (token) {
            nextPushbullet.accessToken = token;
          }
        }

        savePushbulletConfig({ configPath: pushbulletConfigPath, payload: nextPushbullet });

        const config = buildMergedUiConfig({
          uiConfigPath,
          pushbulletConfigPath,
          openrouterConfigPath
        });
        sendJson(response, 200, { ok: true, config });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/runtime/test-ai-api') {
        const payload = await readJsonBody(request);
        const config = resolveOpenRouterConfigForRequest({ payload, openrouterConfigPath });
        const result = await testAiApi({ config });
        if (result?.reachable) {
          sendJson(response, 200, {
            ok: true,
            reachable: true,
            message: result.message || 'AI API 联通正常',
            baseUrl: result.baseUrl || config.baseUrl || '',
            model: result.model || config.model || '',
            statusCode: result.statusCode || 200
          });
          return;
        }
        sendJson(response, Number(result?.statusCode || 502) || 502, {
          ok: false,
          reachable: false,
          error: result?.message || 'AI API 请求失败',
          baseUrl: result?.baseUrl || config.baseUrl || '',
          model: result?.model || config.model || '',
          statusCode: result?.statusCode || 502
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/save-links-stream') {
        response.writeHead(200, {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive'
        });

        try {
          const payload = await readJsonBody(request);
          const text = String(payload.text || '').trim();
          if (!text) {
            sendNdjson(response, {
              type: 'error',
              error: '请输入包含小红书链接的文本'
            });
            response.end();
            return;
          }

          const uiConfig = resolveUiConfig(uiConfigPath, payload);
          await runExclusive('save-links', async () => {
            const { task, report } = await runSaveLinksWithProgress({
              text,
              uiConfig,
              onEvent: (event) => sendNdjson(response, event)
            });
            sendNdjson(response, { type: 'done', task: task.type, report });
          });
        } catch (error) {
          sendNdjson(response, {
            type: 'error',
            error: error.message || 'Internal Server Error'
          });
        } finally {
          response.end();
        }
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/save-links') {
        const payload = await readJsonBody(request);
        const text = String(payload.text || '').trim();
        if (!text) {
          sendJson(response, 400, {
            ok: false,
            error: '请输入包含小红书链接的文本'
          });
          return;
        }

        const uiConfig = resolveUiConfig(uiConfigPath, payload);
        const task = buildNoteSaveTask({ input: text, source: 'ui' });
        assertValidTask(task);
        const summary = await runExclusive('save-links', () => saveLinks(text, {
          task,
          source: 'ui',
          browser: uiConfig.browser,
          outputRoot: uiConfig.paths.saveLinksOutputRoot || undefined,
          imagesRoot: uiConfig.paths.saveLinksImagesRoot || undefined,
          conflictStrategy: uiConfig.naming.conflictStrategy,
          maxTitleLength: uiConfig.naming.maxTitleLength,
          uiRuntime: uiConfig.runtime,
          classificationCategories: uiConfig.inbox?.categories
        }));
        const report = buildTaskSummary(summary.results || [], { includeWarnings: true });
        sendJson(response, 200, {
          ok: true,
          task: task.type,
          report
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/ingress/save-link') {
        const payload = await readJsonBody(request);
        const uiConfig = resolveUiConfig(uiConfigPath, payload);
        const result = await runExclusive('ingress-save-link', () => runIngressSaveLink({
          payload,
          uiConfig
        }));
        sendJson(response, 200, {
          ok: true,
          accepted: result.accepted === true,
          execution: result.execution || 'immediate',
          task: result.task?.type || 'note-save',
          report: result.report || null
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/ingress/enqueue-link') {
        const payload = await readJsonBody(request);
        const result = await runExclusive('ingress-enqueue-link', () => runIngressEnqueueLink({
          payload
        }));
        sendJson(response, 200, {
          ok: true,
          accepted: result.accepted === true,
          execution: result.execution || 'queued',
          task: result.task?.type || 'note-save',
          queue: result.queue || { added: 0, skipped: 0 }
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/ingress/webhook/feishu') {
        const payload = await readJsonBody(request);
        const uiConfig = resolveUiConfig(uiConfigPath, payload);
        const result = await runExclusive('ingress-webhook-feishu', () => runFeishuWebhook({
          payload,
          enqueueIngressLink: runIngressEnqueueLink,
          defaults: {
            defaultRoute: uiConfig?.ingress?.defaultRoute || 'cloud'
          },
          verificationToken: process.env.XHS_INGRESS_WEBHOOK_TOKEN || ''
        }));

        if (result.mode === 'verification') {
          sendJson(response, 200, {
            ok: true,
            mode: 'verification',
            challenge: result.challenge || ''
          });
          return;
        }

        sendJson(response, 200, {
          ok: true,
          accepted: result.accepted === true,
          execution: result.execution || 'queued',
          task: result.task?.type || 'note-save',
          queue: result.queue || { added: 0, skipped: 0 }
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/save-links-resume') {
        const payload = await readJsonBody(request);
        const runId = String(payload.runId || payload.run_id || '').trim();
        if (!runId) {
          sendJson(response, 400, {
            ok: false,
            error: '请输入需要继续执行的 runId'
          });
          return;
        }

        const uiConfig = resolveUiConfig(uiConfigPath, payload);
        const report = await runExclusive('save-links-resume', async () => {
          try {
            const saved = await resumeNoteSave(runId, {
              source: 'ui',
              browser: uiConfig.browser,
              outputRoot: uiConfig.paths.saveLinksOutputRoot || undefined,
              imagesRoot: uiConfig.paths.saveLinksImagesRoot || undefined,
              conflictStrategy: uiConfig.naming.conflictStrategy,
              maxTitleLength: uiConfig.naming.maxTitleLength,
              uiRuntime: uiConfig.runtime,
              classificationCategories: uiConfig.inbox?.categories
            });
            const item = buildSuccessfulSaveSummaryItem(
              buildBaseResultFromMode(saved?.mode, runId),
              saved
            );
            return buildTaskSummary([item], { includeWarnings: true });
          } catch (error) {
            const baseResult = error?.resume_base_result && typeof error.resume_base_result === 'object'
              ? {
                index: 0,
                noteId: error.resume_base_result.noteId || '',
                input: error.resume_base_result.input || runId,
                canonicalUrl: error.resume_base_result.canonicalUrl || '',
                navigationUrl: error.resume_base_result.navigationUrl || ''
              }
              : buildBaseResultFromMode(error?.resume_mode, runId);
            const item = buildFailedSaveSummaryItem(baseResult, error, {
              orchestration: {
                checkpointRoot: path.join(PATHS.cacheDir, 'browser-task-checkpoints')
              }
            });
            return buildTaskSummary([item], { includeWarnings: true });
          }
        });
        sendJson(response, 200, {
          ok: true,
          task: 'note-save',
          report
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/save-collection') {
        const payload = await readJsonBody(request);
        const uiConfig = resolveUiConfig(uiConfigPath, payload);
        const task = buildCollectionTask({ source: 'ui' });
        assertValidTask(task);
        const result = await runExclusive('save-collection', () => runCollection(task, {
          overrides: {
            collectionOutputRoot: uiConfig.paths.collectionOutputRoot || undefined,
            collectionRawPath: uiConfig.paths.collectionRawPath || undefined,
            conflictStrategy: uiConfig.naming.conflictStrategy,
            maxTitleLength: uiConfig.naming.maxTitleLength,
            runtime: uiConfig.runtime
          }
        }));
        const report = buildTaskResult({
          status: 'success',
          task,
          output: result,
          warnings: result?.warnings || []
        });
        sendJson(response, 200, {
          ok: true,
          task: task.type,
          report
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/save-zhihu-favorites') {
        const payload = await readJsonBody(request);
        const collectionUrl = String(payload.collectionUrl || '').trim();
        if (!collectionUrl) {
          sendJson(response, 400, {
            ok: false,
            error: '请输入知乎收藏夹链接'
          });
          return;
        }

        const uiConfig = resolveUiConfig(uiConfigPath, payload);
        const result = await runExclusive('save-zhihu-favorites', () => runZhihuFavorites({
          collectionUrl,
          title: String(payload.title || '').trim(),
          limit: Number.isFinite(Number(payload.limit)) && Number(payload.limit) > 0
            ? Math.trunc(Number(payload.limit))
            : undefined,
          uiConfig
        }));
        sendJson(response, 200, {
          ok: true,
          task: 'zhihu-favorites-export',
          report: buildZhihuFavoritesReport(result)
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/browser/status') {
        const payload = await readJsonBody(request);
        const uiConfig = resolveUiConfig(uiConfigPath, payload);
        const status = await resolveBrowserStatus({ uiConfig });
        sendJson(response, 200, {
          ok: true,
          status
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/inbox/sync') {
        const payload = await readJsonBody(request);
        const mode = payload?.mode === 'all'
          ? 'all'
          : payload?.mode === 'bootstrap'
            ? 'bootstrap'
            : payload?.mode === 'recent'
              ? 'recent'
              : payload?.mode === 'window'
                ? 'window'
            : 'latest';
        const limit = Number.isFinite(Number(payload?.limit)) && Number(payload.limit) > 0
          ? Math.trunc(Number(payload.limit))
          : undefined;
        const timeWindow = normalize_time_window(payload?.timeWindow);
        const maxPages = Number.isFinite(Number(payload?.maxPages)) && Number(payload.maxPages) > 0
          ? Math.trunc(Number(payload.maxPages))
          : undefined;
        const result = await runExclusive('inbox-sync', () => runInbox({
          pushbulletConfigPath,
          mode,
          limit,
          timeWindow,
          maxPages
        }));
        sendJson(response, 200, {
          ok: true,
          report: result
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/inbox/sync-stream') {
        response.writeHead(200, {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive'
        });

        try {
          const payload = await readJsonBody(request);
          const mode = payload?.mode === 'all'
            ? 'all'
            : payload?.mode === 'bootstrap'
              ? 'bootstrap'
              : payload?.mode === 'recent'
                ? 'recent'
                : payload?.mode === 'window'
                  ? 'window'
                  : 'latest';
          const limit = Number.isFinite(Number(payload?.limit)) && Number(payload.limit) > 0
            ? Math.trunc(Number(payload.limit))
            : undefined;
          const timeWindow = normalize_time_window(payload?.timeWindow);
          const maxPages = Number.isFinite(Number(payload?.maxPages)) && Number(payload.maxPages) > 0
            ? Math.trunc(Number(payload.maxPages))
            : undefined;

          await runExclusive('inbox-sync', async () => {
            const result = await runInbox({
              pushbulletConfigPath,
              mode,
              limit,
              timeWindow,
              maxPages,
              onProgress: (event) => sendNdjson(response, event)
            });
            sendNdjson(response, { type: 'done', task: 'inbox-sync', report: result });
          });
        } catch (error) {
          sendNdjson(response, {
            type: 'error',
            error: error.message || 'Internal Server Error'
          });
        } finally {
          response.end();
        }
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/inbox/save-stream') {
        response.writeHead(200, {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive'
        });

        try {
          const payload = await readJsonBody(request);
          const uiConfig = resolveUiConfig(uiConfigPath, payload);
          await runExclusive('inbox-save', async () => {
            const result = await runInboxSaveWithConfig({
              uiConfig,
              urls: Array.isArray(payload?.urls) ? payload.urls : undefined,
              syncReport: payload?.syncReport && typeof payload.syncReport === 'object'
                ? payload.syncReport
                : undefined,
              onProgress: (event) => sendNdjson(response, event)
            });
            const report = result?.summary || {
              total: result?.total || 0,
              successCount: 0,
              failureCount: 0,
              results: []
            };
            sendNdjson(response, { type: 'done', task: 'inbox-save', report });
          });
        } catch (error) {
          sendNdjson(response, {
            type: 'error',
            error: error.message || 'Internal Server Error'
          });
        } finally {
          response.end();
        }
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/inbox/save') {
        const payload = await readJsonBody(request);
        const uiConfig = resolveUiConfig(uiConfigPath, payload);
        const result = await runExclusive('inbox-save', () => runInboxSaveWithConfig({
          uiConfig,
          urls: Array.isArray(payload?.urls) ? payload.urls : undefined,
          syncReport: payload?.syncReport && typeof payload.syncReport === 'object'
            ? payload.syncReport
            : undefined
        }));
        const report = result?.summary || {
          total: result?.total || 0,
          successCount: 0,
          failureCount: 0,
          results: []
        };
        sendJson(response, 200, {
          ok: true,
          report
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/video-notes/open-folder') {
        const folderPath = await openVideoNotesWorkspace({
          folderPath: DEFAULT_VIDEO_NOTES_DIR
        });
        sendJson(response, 200, {
          ok: true,
          folderPath
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/video-notes/start-web') {
        const result = await startVideoNotesWorkspace({
          folderPath: DEFAULT_VIDEO_NOTES_DIR,
          scriptPath: DEFAULT_VIDEO_NOTES_SCRIPT_PATH,
          url: DEFAULT_VIDEO_NOTES_URL
        });
        sendJson(response, 200, {
          ok: true,
          folderPath: result.folderPath,
          scriptPath: result.scriptPath,
          url: result.url
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/open-output') {
        const payload = await readJsonBody(request);
        const uiConfig = resolveUiConfig(uiConfigPath, payload);
        const folderPath = await openOutputFolder({
          report: payload.report || {},
          uiConfig,
          projectDir: PROJECT_DIR,
          defaultOutputDir: PATHS.outputDir
        });
        sendJson(response, 200, {
          ok: true,
          folderPath
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/browser/login') {
        const payload = await readJsonBody(request);
        const uiConfig = resolveUiConfig(uiConfigPath, payload);
        const opened = await runExclusive('browser-login', () => openLoginBrowser({
          browser: {
            ...(uiConfig.browser || {}),
            headless: false
          },
          url: String(payload.url || '').trim() || DEFAULT_LAUNCH_URL
        }));
        sendJson(response, 200, {
          ok: true,
          profileDir: opened.profileDir || opened.userDataDir || '',
          userDataDir: opened.userDataDir || opened.profileDir || '',
          debugUrl: opened.debugUrl || '',
          url: opened.url || '',
          pid: opened.pid || 0
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/export-links-list') {
        const payload = await readJsonBody(request);
        const uiConfig = resolveUiConfig(uiConfigPath, payload);
        const groupKey = String(payload.groupKey || '').trim();
        if (!groupKey) {
          sendJson(response, 400, {
            ok: false,
            error: '缺少分组标识'
          });
          return;
        }
        const result = await exportLinksList({
          report: payload.report || {},
          groupKey,
          uiConfig,
          projectDir: PROJECT_DIR,
          defaultOutputDir: PATHS.outputDir
        });
        sendJson(response, 200, {
          ok: true,
          filePath: result.filePath,
          count: result.count,
          groupKey: result.groupKey
        });
        return;
      }

      sendJson(response, 404, {
        ok: false,
        error: 'Not Found'
      });
    } catch (error) {
      sendJson(response, error.statusCode || 500, {
        ok: false,
        error: summarizeErrorMessage(error)
      });
    }
  });
}

function startUiServer(port = DEFAULT_PORT, options = {}) {
  const server = createUiServer(options);
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

if (require.main === module) {
  startUiServer()
    .then((server) => {
      const address = server.address();
      logInfo(`UI server running at http://127.0.0.1:${address.port}`);
    })
    .catch((error) => {
      logError(`UI server failed: ${error.message}`);
      process.exitCode = 1;
    });
}

module.exports = {
  DEFAULT_PORT,
  buildCollectionEnv,
  createUiServer,
  openVideoNotesFolder,
  readJsonBody,
  resolveStaticFile,
  runCollectionExport,
  runNodeScript,
  summarizeErrorMessage,
  sendJson,
  startVideoNotesWeb,
  startUiServer
};

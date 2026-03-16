const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const {
  buildSuccessfulSaveSummaryItem,
  formatSaveNoteError,
  getNavigationUrl,
  resolveRunModes,
  saveLinksText,
  saveMode
} = require('./save_note');
const { runTaskPipeline } = require('./lib/pipeline');
const { resolveProjectPaths } = require('./lib/config');
const { saveInboxUrls } = require('./lib/inbox_save');
const { loadUiConfig, mergeUiConfig, saveUiConfig } = require('./lib/ui_config');
const { loadPushbulletConfig, savePushbulletConfig } = require('./lib/pushbullet_config');
const { syncInbox } = require('./lib/inbox_sync');
const { logError, logInfo } = require('./lib/logger');
const { buildTaskResult, buildTaskSummary } = require('./lib/report');
const {
  assertValidTask,
  buildCollectionTask,
  buildNoteSaveTask
} = require('./lib/task');

const PATHS = resolveProjectPaths(path.resolve(__dirname, '..'));
const PROJECT_DIR = PATHS.projectDir;
const UI_DIR = path.join(PROJECT_DIR, 'ui');
const DEFAULT_PORT = Number(process.env.XHS_UI_PORT || 3030);
const DEFAULT_UI_CONFIG_PATH = path.join(PATHS.configDir, 'ui.json');
const DEFAULT_PUSHBULLET_CONFIG_PATH = path.join(PATHS.configDir, 'pushbullet.json');

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

function buildMergedUiConfig({ uiConfigPath, pushbulletConfigPath }) {
  const storedUi = loadUiConfig({ configPath: uiConfigPath });
  const merged = mergeUiConfig(storedUi, {});
  const pushbullet = loadPushbulletConfig({ configPath: pushbulletConfigPath });
  merged.pushbullet = sanitizePushbulletForUi(pushbullet);
  return merged;
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

async function runSaveLinksWithProgress({ text, uiConfig, onEvent }) {
  const task = buildNoteSaveTask({ input: text, source: 'ui' });
  assertValidTask(task);

  const modes = await resolveRunModes({ mode: 'input', input: text });
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
        uiRuntime: uiConfig.runtime
      });
      const item = buildSuccessfulSaveSummaryItem(baseResult, saved);
      results.push(item);
      if (onEvent) onEvent({ type: 'progress', index, total: modes.length, result: item });
    } catch (error) {
      const item = {
        ...baseResult,
        status: 'failed',
        error: formatSaveNoteError(error)
      };
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

function createUiServer({
  saveLinksText: saveLinks = saveLinksText,
  runCollectionExport: runCollection = runCollectionExport,
  runInboxSync: runInbox = syncInbox,
  runInboxSave,
  uiDir = UI_DIR,
  uiConfigPath = DEFAULT_UI_CONFIG_PATH,
  pushbulletConfigPath = DEFAULT_PUSHBULLET_CONFIG_PATH
} = {}) {
  let activeTask = '';
  const runInboxSaveWithConfig = runInboxSave
    || (async ({ uiConfig }) => {
      const summaryResult = await saveInboxUrls({
        pushbulletConfigPath,
        uiConfig,
        saveLinksText: (text, options = {}) => saveLinks(text, {
          ...options,
          source: 'ui',
          outputRoot: options.outputRoot || uiConfig.paths.saveLinksOutputRoot || undefined,
          imagesRoot: options.imagesRoot || uiConfig.paths.saveLinksImagesRoot || undefined,
          conflictStrategy: uiConfig.naming.conflictStrategy,
          maxTitleLength: uiConfig.naming.maxTitleLength,
          uiRuntime: uiConfig.runtime
        })
      });
      return summaryResult;
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
          const config = buildMergedUiConfig({ uiConfigPath, pushbulletConfigPath });
          sendJson(response, 200, { ok: true, config });
          return;
        }
        serveStatic(request, response, uiDir);
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/ui-config') {
        const payload = await readJsonBody(request);
        const incoming = extractIncomingConfig(payload);

        const storedUi = loadUiConfig({ configPath: uiConfigPath });
        const inboxSection = incoming.inbox && typeof incoming.inbox === 'object'
          && incoming.inbox.categories && typeof incoming.inbox.categories === 'object'
          && !Array.isArray(incoming.inbox.categories)
          ? { categories: incoming.inbox.categories }
          : undefined;
        const uiIncoming = {
          paths: incoming.paths,
          naming: incoming.naming,
          runtime: incoming.runtime,
          inbox: inboxSection,
          ui: incoming.ui
        };
        const uiMerged = mergeUiConfig(storedUi, uiIncoming);
        saveUiConfig({ configPath: uiConfigPath, payload: uiMerged });

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

        const config = buildMergedUiConfig({ uiConfigPath, pushbulletConfigPath });
        sendJson(response, 200, { ok: true, config });
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
          outputRoot: uiConfig.paths.saveLinksOutputRoot || undefined,
          imagesRoot: uiConfig.paths.saveLinksImagesRoot || undefined,
          conflictStrategy: uiConfig.naming.conflictStrategy,
          maxTitleLength: uiConfig.naming.maxTitleLength,
          uiRuntime: uiConfig.runtime
        }));
        const report = buildTaskSummary(summary.results || [], { includeWarnings: true });
        sendJson(response, 200, {
          ok: true,
          task: task.type,
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

      if (request.method === 'POST' && url.pathname === '/api/inbox/sync') {
        const payload = await readJsonBody(request);
        const mode = payload && payload.mode === 'all' ? 'all' : 'latest';
        const result = await runExclusive('inbox-sync', () => runInbox({
          pushbulletConfigPath,
          mode
        }));
        sendJson(response, 200, {
          ok: true,
          report: result
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/inbox/save') {
        const payload = await readJsonBody(request);
        const uiConfig = resolveUiConfig(uiConfigPath, payload);
        const result = await runExclusive('inbox-save', () => runInboxSaveWithConfig({
          uiConfig
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
  readJsonBody,
  resolveStaticFile,
  runCollectionExport,
  runNodeScript,
  summarizeErrorMessage,
  sendJson,
  startUiServer
};

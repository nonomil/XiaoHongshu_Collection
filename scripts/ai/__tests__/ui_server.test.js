const { afterEach, test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('fs');
const http = require('http');
const Module = require('module');
const path = require('path');

const { createUiServer, startVideoNotesWeb } = require('../../ui_server');
const { createTempDir } = require('./test_tmp');

const activeServers = new Set();

afterEach(async () => {
  await Promise.all(Array.from(activeServers, (server) => new Promise((resolve) => {
    server.close(() => resolve());
  })));
  activeServers.clear();
});

async function startServer(overrides = {}) {
  const pushbulletConfigPath = overrides.pushbulletConfigPath
    || path.join(createTempDir('xhs-pushbullet-config-'), 'pushbullet.json');
  const openrouterConfigPath = overrides.openrouterConfigPath
    || path.join(createTempDir('xhs-openrouter-config-'), 'openrouter.json');
  const server = createUiServer({
    saveLinksText: overrides.saveLinksText || (async () => ({
      total: 1,
      successCount: 1,
      failureCount: 0,
      results: [{ status: 'success', filepath: 'G:/output/abc123.md' }]
    })),
    resumeNoteSave: overrides.resumeNoteSave,
    runCollectionExport: overrides.runCollectionExport || (async () => ({
      steps: [
        { script: 'extract_v4.js', code: 0 },
        { script: 'ocr_and_write.js', code: 0 }
      ]
    })),
    runZhihuFavoritesExport: overrides.runZhihuFavoritesExport,
    getBrowserStatus: overrides.getBrowserStatus,
    runInboxSync: overrides.runInboxSync,
    runInboxSave: overrides.runInboxSave,
    saveIngressLink: overrides.saveIngressLink,
    enqueueIngressLink: overrides.enqueueIngressLink,
    handleFeishuWebhook: overrides.handleFeishuWebhook,
    openOutputFolder: overrides.openOutputFolder,
    openLoginBrowser: overrides.openLoginBrowser,
    openVideoNotesFolder: overrides.openVideoNotesFolder,
    startVideoNotesWeb: overrides.startVideoNotesWeb,
    exportLinksList: overrides.exportLinksList,
    uiConfigPath: overrides.uiConfigPath,
    pushbulletConfigPath,
    openrouterConfigPath,
    testAiApi: overrides.testAiApi
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  activeServers.add(server);
  return {
    server,
    baseUrl: `http://127.0.0.1:${server.address().port}`
  };
}

function requestJson(url, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const request = http.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (response) => {
      let raw = '';
      response.on('data', (chunk) => { raw += chunk; });
      response.on('end', () => {
        resolve({
          statusCode: response.statusCode,
          body: raw ? JSON.parse(raw) : {}
        });
      });
    });

    request.on('error', reject);
    request.write(payload);
    request.end();
  });
}

function requestGet(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      let raw = '';
      response.on('data', (chunk) => { raw += chunk; });
      response.on('end', () => {
        resolve({
          statusCode: response.statusCode,
          body: raw ? JSON.parse(raw) : {}
        });
      });
    });

    request.on('error', reject);
  });
}

function requestNdjson(url, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const request = http.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (response) => {
      let raw = '';
      response.on('data', (chunk) => { raw += chunk; });
      response.on('end', () => {
        resolve({
          statusCode: response.statusCode,
          contentType: response.headers['content-type'] || '',
          events: raw.trim()
            ? raw.trim().split('\n').map((line) => JSON.parse(line))
            : []
        });
      });
    });

    request.on('error', reject);
    request.write(payload);
    request.end();
  });
}

function createSpawnedChild() {
  const child = new EventEmitter();
  child.unref = () => {};
  process.nextTick(() => child.emit('spawn'));
  return child;
}

function loadUiServerInternals({ saveNoteOverrides = {} } = {}) {
  const filename = path.resolve(__dirname, '..', '..', 'ui_server.js');
  const source = `${fs.readFileSync(filename, 'utf-8')}\nmodule.exports.__runSaveLinksWithProgress = runSaveLinksWithProgress;\n`;
  const internalModule = new Module(filename, module);
  const projectRequire = Module.createRequire(filename);

  internalModule.filename = filename;
  internalModule.paths = Module._nodeModulePaths(path.dirname(filename));
  internalModule.require = (specifier) => {
    if (specifier === './save_note') {
      return {
        ...projectRequire(specifier),
        ...saveNoteOverrides
      };
    }
    return projectRequire(specifier);
  };

  internalModule._compile(source, filename);
  return internalModule.exports;
}

test('save-links api rejects empty text payloads', async () => {
  const { baseUrl } = await startServer();
  const response = await requestJson(`${baseUrl}/api/save-links`, { text: '   ' });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.ok, false);
  assert.match(response.body.error, /请输入|链接/);
});

test('ui server rejects concurrent tasks while one request is still running', async () => {
  let releaseTask;
  let markStarted;
  const taskStarted = new Promise((resolve) => { markStarted = resolve; });
  const taskFinished = new Promise((resolve) => { releaseTask = resolve; });

  const { baseUrl } = await startServer({
    saveLinksText: async () => {
      markStarted();
      await taskFinished;
      return {
        total: 1,
        successCount: 1,
        failureCount: 0,
        results: [{ status: 'success', filepath: 'G:/output/abc123.md' }]
      };
    }
  });

  const firstRequest = requestJson(`${baseUrl}/api/save-links`, {
    text: 'https://www.xiaohongshu.com/explore/abc123'
  });
  await taskStarted;

  const secondResponse = await requestJson(`${baseUrl}/api/save-links`, {
    text: 'https://www.xiaohongshu.com/explore/def456'
  });

  releaseTask();
  const firstResponse = await firstRequest;

  assert.equal(secondResponse.statusCode, 409);
  assert.equal(secondResponse.body.ok, false);
  assert.match(secondResponse.body.error, /任务|运行中/);
  assert.equal(firstResponse.statusCode, 200);
});

test('save-links api returns a normalized success payload', async () => {
  let capturedTask;
  const { baseUrl } = await startServer({
    saveLinksText: async (text, options = {}) => {
      assert.match(text, /abc123/);
      capturedTask = options.task;
      return {
        total: 2,
        successCount: 1,
        failureCount: 1,
        results: [
          { status: 'success', filepath: 'G:/output/abc123.md' },
          { status: 'failed', error: 'mock failure' }
        ]
      };
    }
  });

  const response = await requestJson(`${baseUrl}/api/save-links`, {
    text: 'https://www.xiaohongshu.com/explore/abc123\nhttps://www.xiaohongshu.com/explore/def456'
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.task, 'note-save');
  assert.equal(response.body.report.total, 2);
  assert.equal(response.body.report.successCount, 1);
  assert.equal(response.body.report.failureCount, 1);
  assert.equal(response.body.report.results.length, 2);
  assert.equal(capturedTask.type, 'note-save');
  assert.equal(capturedTask.source, 'ui');
});

test('ingress save-link api rejects invalid urls', async () => {
  const { baseUrl } = await startServer();

  const response = await requestJson(`${baseUrl}/api/ingress/save-link`, {
    url: 'not-a-url',
    source: 'chrome-extension'
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.ok, false);
  assert.match(response.body.error, /url/i);
});

test('ingress save-link api returns accepted immediate report', async () => {
  let capturedPayload = null;
  let capturedUiConfig = null;
  const { baseUrl } = await startServer({
    saveIngressLink: async ({ payload, uiConfig }) => {
      capturedPayload = payload;
      capturedUiConfig = uiConfig;
      return {
        accepted: true,
        execution: 'immediate',
        task: {
          type: 'note-save',
          source: 'chrome-extension',
          route: 'local',
          deliveryMode: 'immediate'
        },
        report: {
          total: 1,
          successCount: 1,
          failureCount: 0,
          results: [{ status: 'success', filepath: 'G:/output/abc123.md' }]
        }
      };
    }
  });

  const response = await requestJson(`${baseUrl}/api/ingress/save-link`, {
    url: 'https://www.xiaohongshu.com/explore/abc123',
    source: 'chrome-extension',
    route: 'local',
    delivery_mode: 'immediate',
    metadata: {
      page_title: '标题'
    },
    uiConfig: {
      browser: {
        mode: 'current-browser'
      }
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.accepted, true);
  assert.equal(response.body.execution, 'immediate');
  assert.equal(response.body.task, 'note-save');
  assert.equal(response.body.report.total, 1);
  assert.equal(capturedPayload.source, 'chrome-extension');
  assert.equal(capturedPayload.delivery_mode, 'immediate');
  assert.equal(capturedUiConfig.browser.mode, 'current-browser');
});

test('ingress enqueue-link api returns queued result', async () => {
  let capturedPayload = null;
  const { baseUrl } = await startServer({
    enqueueIngressLink: async ({ payload }) => {
      capturedPayload = payload;
      return {
        accepted: true,
        execution: 'queued',
        task: {
          type: 'note-save'
        },
        queue: {
          added: 1,
          skipped: 0
        }
      };
    }
  });

  const response = await requestJson(`${baseUrl}/api/ingress/enqueue-link`, {
    url: 'https://mp.weixin.qq.com/s/demo',
    source: 'feishu',
    route: 'cloud',
    delivery_mode: 'queue',
    metadata: {
      event_id: 'evt_1'
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.accepted, true);
  assert.equal(response.body.execution, 'queued');
  assert.equal(response.body.task, 'note-save');
  assert.equal(response.body.queue.added, 1);
  assert.equal(capturedPayload.source, 'feishu');
});

test('save-links-resume api resumes a checkpointed task and returns a single-item report', async () => {
  let capturedRunId = '';
  let capturedOptions;
  const { baseUrl } = await startServer({
    resumeNoteSave: async (runId, options = {}) => {
      capturedRunId = runId;
      capturedOptions = options;
      return {
        mode: {
          mode: 'url',
          noteId: 'abc123',
          canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/abc123',
          navigationUrl: 'https://www.xiaohongshu.com/explore/abc123'
        },
        note: {
          noteId: 'abc123',
          platform: 'xiaohongshu',
          sourceType: 'xiaohongshu',
          browser_orchestration: {
            run_id: runId,
            status: 'done',
            state: 'validate_result',
            warnings: []
          }
        },
        result: {
          filepath: 'G:/output/abc123.md'
        }
      };
    }
  });

  const response = await requestJson(`${baseUrl}/api/save-links-resume`, {
    runId: 'note-save-ui-2026-04-06T120000000Z',
    uiConfig: {
      browser: {
        mode: 'current-browser',
        browserUrl: 'http://127.0.0.1:9333'
      },
      paths: {
        saveLinksOutputRoot: 'G:/custom/output',
        saveLinksImagesRoot: 'G:/custom/images'
      },
      naming: {
        conflictStrategy: 'content-aware',
        maxTitleLength: 64
      },
      runtime: {
        autoClassifyLinksEnabled: true
      },
      inbox: {
        categories: {
          AI: ['AI']
        }
      }
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.task, 'note-save');
  assert.equal(response.body.report.total, 1);
  assert.equal(response.body.report.successCount, 1);
  assert.equal(response.body.report.failureCount, 0);
  assert.equal(response.body.report.results[0].filepath, 'G:/output/abc123.md');
  assert.equal(capturedRunId, 'note-save-ui-2026-04-06T120000000Z');
  assert.equal(capturedOptions.outputRoot, 'G:/custom/output');
  assert.equal(capturedOptions.imagesRoot, 'G:/custom/images');
  assert.equal(capturedOptions.browser.mode, 'current-browser');
  assert.equal(capturedOptions.conflictStrategy, 'content-aware');
  assert.equal(capturedOptions.maxTitleLength, 64);
  assert.equal(capturedOptions.uiRuntime.autoClassifyLinksEnabled, true);
  assert.deepEqual(capturedOptions.classificationCategories, { AI: ['AI'] });
});

test('save-collection api returns a normalized success payload', async () => {
  const { baseUrl } = await startServer({
    runCollectionExport: async () => ({
      steps: [
        { script: 'extract_v4.js', code: 0 },
        { script: 'ocr_and_write.js', code: 0 }
      ],
      logs: ['extract ok', 'ocr ok']
    })
  });

  const response = await requestJson(`${baseUrl}/api/save-collection`, {});

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.task, 'collection-export');
  assert.equal(response.body.report.status, 'success');
  assert.equal(response.body.report.output.steps.length, 2);
  assert.deepEqual(response.body.report.output.logs, ['extract ok', 'ocr ok']);
});

test('save-zhihu-favorites api rejects empty collection urls', async () => {
  const { baseUrl } = await startServer();

  const response = await requestJson(`${baseUrl}/api/save-zhihu-favorites`, {
    collectionUrl: '   '
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.ok, false);
  assert.match(response.body.error, /知乎收藏夹链接|URL/);
});

test('save-zhihu-favorites api returns a normalized success payload', async () => {
  let capturedArgs;
  const { baseUrl } = await startServer({
    runZhihuFavoritesExport: async (args) => {
      capturedArgs = args;
      return {
        collectionId: '123456789',
        collectionTitle: 'AI 收藏夹',
        paths: {
          rootDir: 'G:/output/知乎收藏夹/AI 收藏夹'
        },
        collect: {
          warnings: ['部分条目暂不支持']
        },
        summary: {
          total: 2,
          successCount: 2,
          failureCount: 0,
          results: [
            { status: 'success', filepath: 'G:/output/知乎收藏夹/AI 收藏夹/文章 1.md' },
            { status: 'success', filepath: 'G:/output/知乎收藏夹/AI 收藏夹/文章 2.md' }
          ]
        }
      };
    }
  });

  const response = await requestJson(`${baseUrl}/api/save-zhihu-favorites`, {
    collectionUrl: 'https://www.zhihu.com/collection/123456789',
    title: 'AI 收藏夹',
    limit: 30,
    uiConfig: {
      browser: {
        mode: 'current-browser',
        browserUrl: 'http://127.0.0.1:9333'
      },
      paths: {
        collectionOutputRoot: 'G:/output'
      }
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.task, 'zhihu-favorites-export');
  assert.equal(response.body.report.total, 2);
  assert.equal(response.body.report.collectionTitle, 'AI 收藏夹');
  assert.equal(response.body.report.outputFolder, 'G:/output/知乎收藏夹/AI 收藏夹');
  assert.equal(response.body.report.warnings.length, 1);
  assert.equal(capturedArgs.collectionUrl, 'https://www.zhihu.com/collection/123456789');
  assert.equal(capturedArgs.title, 'AI 收藏夹');
  assert.equal(capturedArgs.limit, 30);
  assert.equal(capturedArgs.uiConfig.browser.browserUrl, 'http://127.0.0.1:9333');
});

test('browser status api returns normalized browser connection payload', async () => {
  let capturedConfig;
  const { baseUrl } = await startServer({
    getBrowserStatus: async ({ uiConfig }) => {
      capturedConfig = uiConfig;
      return {
        connected: true,
        browserLabel: '当前浏览器',
        browserDetail: '已连接 Chrome 146 调试会话',
        platforms: {
          xiaohongshu: {
            state: 'logged_in',
            label: '已检测到登录态'
          },
          zhihu: {
            state: 'logged_out',
            label: '未检测到登录态'
          }
        },
        tabs: {
          xiaohongshu: true,
          zhihu: false
        }
      };
    }
  });

  const response = await requestJson(`${baseUrl}/api/browser/status`, {
    uiConfig: {
      browser: {
        mode: 'current-browser',
        browserUrl: 'http://127.0.0.1:9333'
      }
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.status.connected, true);
  assert.equal(response.body.status.browserLabel, '当前浏览器');
  assert.equal(response.body.status.platforms.xiaohongshu.state, 'logged_in');
  assert.equal(response.body.status.platforms.zhihu.state, 'logged_out');
  assert.equal(capturedConfig.browser.browserUrl, 'http://127.0.0.1:9333');
});

test('inbox sync api returns a normalized success payload', async () => {
  const { baseUrl } = await startServer({
    runInboxSync: async () => ({
      added: 2,
      skipped: 1,
      total: 3,
      nextModified: 20
    })
  });

  const response = await requestJson(`${baseUrl}/api/inbox/sync`, {});

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.report.added, 2);
  assert.equal(response.body.report.skipped, 1);
  assert.equal(response.body.report.total, 3);
});

test('inbox sync api forwards recent mode and limit', async () => {
  let capturedArgs;
  const { baseUrl } = await startServer({
    runInboxSync: async (args) => {
      capturedArgs = args;
      return {
        mode: 'recent',
        limit: 20,
        added: 2,
        skipped: 0,
        total: 2
      };
    }
  });

  const response = await requestJson(`${baseUrl}/api/inbox/sync`, {
    mode: 'recent',
    limit: 20
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.report.mode, 'recent');
  assert.equal(response.body.report.limit, 20);
  assert.equal(capturedArgs.mode, 'recent');
  assert.equal(capturedArgs.limit, 20);
});

test('inbox sync api forwards custom time window payload', async () => {
  let capturedArgs;
  const { baseUrl } = await startServer({
    runInboxSync: async (args) => {
      capturedArgs = args;
      return {
        mode: 'window',
        timeWindow: {
          value: 2,
          unit: 'month'
        },
        windowLabel: '最近 2 个月',
        added: 4,
        skipped: 1,
        total: 5
      };
    }
  });

  const response = await requestJson(`${baseUrl}/api/inbox/sync`, {
    mode: 'window',
    timeWindow: {
      value: 2,
      unit: 'month'
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.report.mode, 'window');
  assert.equal(response.body.report.windowLabel, '最近 2 个月');
  assert.equal(capturedArgs.mode, 'window');
  assert.deepEqual(capturedArgs.timeWindow, { value: 2, unit: 'month' });
});

test('inbox sync stream api emits ndjson progress events and final report', async () => {
  let capturedArgs;
  const { baseUrl } = await startServer({
    runInboxSync: async (args) => {
      capturedArgs = args;
      args.onProgress({
        type: 'start',
        mode: 'window',
        timeWindow: { value: 2, unit: 'month' }
      });
      args.onProgress({
        type: 'page',
        page: 1,
        pushesCount: 2,
        accumulatedItems: 2,
        nextCursor: 'cursor-1'
      });
      args.onProgress({
        type: 'store',
        added: 1,
        skipped: 1,
        total: 2
      });
      return {
        mode: 'window',
        timeWindow: {
          value: 2,
          unit: 'month'
        },
        windowLabel: '最近 2 个月',
        added: 1,
        skipped: 1,
        total: 2
      };
    }
  });

  const response = await requestNdjson(`${baseUrl}/api/inbox/sync-stream`, {
    mode: 'window',
    timeWindow: {
      value: 2,
      unit: 'month'
    }
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.contentType, /application\/x-ndjson/);
  assert.equal(response.events[0].type, 'start');
  assert.equal(response.events[1].type, 'page');
  assert.equal(response.events[2].type, 'store');
  assert.equal(response.events.at(-1).type, 'done');
  assert.equal(response.events.at(-1).task, 'inbox-sync');
  assert.equal(response.events.at(-1).report.total, 2);
  assert.equal(capturedArgs.mode, 'window');
  assert.deepEqual(capturedArgs.timeWindow, { value: 2, unit: 'month' });
  assert.equal(typeof capturedArgs.onProgress, 'function');
});

test('inbox save api returns a normalized success payload', async () => {
  const { baseUrl } = await startServer({
    runInboxSave: async () => ({
      total: 2,
      summary: { total: 2, successCount: 2, failureCount: 0, results: [] }
    })
  });

  const response = await requestJson(`${baseUrl}/api/inbox/save`, {});

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.report.total, 2);
  assert.equal(response.body.report.successCount, 2);
});

test('inbox save stream api emits ndjson progress events and final report', async () => {
  let capturedArgs;
  const { baseUrl } = await startServer({
    runInboxSave: async (args) => {
      capturedArgs = args;
      args.onProgress({
        type: 'start',
        total: 2,
        targets: [
          { index: 0, navigationUrl: 'https://mp.weixin.qq.com/s/demo-a' },
          { index: 1, navigationUrl: 'https://mp.weixin.qq.com/s/demo-b' }
        ]
      });
      args.onProgress({
        type: 'tick',
        index: 0,
        total: 2,
        target: { index: 0, navigationUrl: 'https://mp.weixin.qq.com/s/demo-a' }
      });
      args.onProgress({
        type: 'progress',
        index: 0,
        total: 2,
        result: { status: 'success', filepath: 'G:/output/demo-a.md', input: 'https://mp.weixin.qq.com/s/demo-a' }
      });
      return {
        total: 2,
        summary: {
          total: 2,
          successCount: 1,
          failureCount: 1,
          results: [
            { status: 'success', filepath: 'G:/output/demo-a.md', input: 'https://mp.weixin.qq.com/s/demo-a' },
            { status: 'failed', error: 'mock failure', input: 'https://mp.weixin.qq.com/s/demo-b' }
          ]
        }
      };
    }
  });

  const response = await requestNdjson(`${baseUrl}/api/inbox/save-stream`, {
    urls: ['https://mp.weixin.qq.com/s/demo-a', 'https://mp.weixin.qq.com/s/demo-b'],
    syncReport: {
      mode: 'window',
      timeWindow: { value: 2, unit: 'month' }
    }
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.contentType, /application\/x-ndjson/);
  assert.equal(response.events[0].type, 'start');
  assert.equal(response.events[1].type, 'tick');
  assert.equal(response.events[2].type, 'progress');
  assert.equal(response.events.at(-1).type, 'done');
  assert.equal(response.events.at(-1).task, 'inbox-save');
  assert.equal(response.events.at(-1).report.total, 2);
  assert.deepEqual(capturedArgs.urls, ['https://mp.weixin.qq.com/s/demo-a', 'https://mp.weixin.qq.com/s/demo-b']);
});

test('inbox save api forwards selected urls from the last sync context', async () => {
  let capturedArgs;
  const { baseUrl } = await startServer({
    runInboxSave: async (args) => {
      capturedArgs = args;
      return {
        total: 1,
        summary: { total: 1, successCount: 1, failureCount: 0, results: [] }
      };
    }
  });

  const response = await requestJson(`${baseUrl}/api/inbox/save`, {
    urls: ['https://mp.weixin.qq.com/s/demo'],
    syncReport: {
      mode: 'recent',
      limit: 30
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.deepEqual(capturedArgs.urls, ['https://mp.weixin.qq.com/s/demo']);
  assert.deepEqual(capturedArgs.syncReport, { mode: 'recent', limit: 30 });
});

test('inbox save path forwards browser settings into saveLinksText wrapper', async () => {
  let capturedOptions;
  const { baseUrl } = await startServer({
    saveLinksText: async (_text, options = {}) => {
      capturedOptions = options;
      return {
        total: 1,
        successCount: 1,
        failureCount: 0,
        results: [{ status: 'success', filepath: 'G:/output/demo.md' }]
      };
    }
  });

  const response = await requestJson(`${baseUrl}/api/inbox/save`, {
    urls: ['http://xhslink.com/o/demo'],
    uiConfig: {
      browser: {
        headless: true,
        mode: 'isolated',
        channel: 'beta'
      }
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.ok(capturedOptions);
  assert.equal(capturedOptions.browser.headless, true);
  assert.equal(capturedOptions.browser.mode, 'isolated');
  assert.equal(capturedOptions.browser.channel, 'beta');
});

test('save-collection api surfaces login-related errors in response', async () => {
  const { baseUrl } = await startServer({
    runCollectionExport: async () => {
      const error = new Error('Script failed: scripts/extract_v4.js');
      error.logs = ['Fatal error: \u672a\u68c0\u6d4b\u5230\u767b\u5f55\u8d26\u53f7\uff0c\u8bf7\u5728 Chrome \u8c03\u8bd5\u7a97\u53e3\u767b\u5f55\u540e\u91cd\u8bd5\u3002'];
      throw error;
    }
  });

  const response = await requestJson(`${baseUrl}/api/save-collection`, {});

  assert.equal(response.statusCode, 500);
  assert.equal(response.body.ok, false);
  assert.match(response.body.error, /\u767b\u5f55/);
});

test('ui config api returns defaults when missing', async () => {
  const tempDir = createTempDir('xhs-ui-config-');
  const uiConfigPath = path.join(tempDir, 'ui.json');
  const { baseUrl } = await startServer({ uiConfigPath });

  const response = await requestGet(`${baseUrl}/api/ui-config`);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.ok(response.body.config);
  assert.ok(response.body.config.paths);
  assert.ok(response.body.config.ingress);
  assert.equal(response.body.config.ingress.localBaseUrl, 'http://127.0.0.1:3030');
  assert.equal(response.body.config.ingress.defaultRoute, 'local');
});

test('ui config api persists updates', async () => {
  const tempDir = createTempDir('xhs-ui-config-');
  const uiConfigPath = path.join(tempDir, 'ui.json');
  const { baseUrl } = await startServer({ uiConfigPath });

  const postResponse = await requestJson(`${baseUrl}/api/ui-config`, {
    config: {
      paths: { saveLinksOutputRoot: 'G:/custom/output' },
      ingress: {
        cloudBaseUrl: 'https://example.com',
        defaultRoute: 'cloud'
      }
    }
  });
  assert.equal(postResponse.statusCode, 200);
  assert.equal(postResponse.body.ok, true);
  assert.equal(postResponse.body.config.paths.saveLinksOutputRoot, 'G:/custom/output');
  assert.equal(postResponse.body.config.ingress.cloudBaseUrl, 'https://example.com');
  assert.equal(postResponse.body.config.ingress.defaultRoute, 'cloud');

  const getResponse = await requestGet(`${baseUrl}/api/ui-config`);
  assert.equal(getResponse.body.config.paths.saveLinksOutputRoot, 'G:/custom/output');
  assert.equal(getResponse.body.config.ingress.cloudBaseUrl, 'https://example.com');
  assert.equal(getResponse.body.config.ingress.defaultRoute, 'cloud');
});

test('ingress feishu webhook api returns challenge response during verification', async () => {
  const { baseUrl } = await startServer();

  const response = await requestJson(`${baseUrl}/api/ingress/webhook/feishu`, {
    type: 'url_verification',
    challenge: 'challenge-token'
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, {
    ok: true,
    mode: 'verification',
    challenge: 'challenge-token'
  });
});

test('ingress feishu webhook api enqueues parsed message payload', async () => {
  let capturedPayload = null;
  const { baseUrl } = await startServer({
    handleFeishuWebhook: async ({ payload }) => {
      capturedPayload = payload;
      return {
        accepted: true,
        execution: 'queued',
        task: {
          type: 'note-save',
          source: 'feishu'
        },
        queue: {
          added: 1,
          skipped: 0
        }
      };
    }
  });

  const response = await requestJson(`${baseUrl}/api/ingress/webhook/feishu`, {
    header: {
      event_id: 'evt_1',
      event_type: 'im.message.receive_v1'
    },
    event: {
      message: {
        content: JSON.stringify({
          text: 'https://mp.weixin.qq.com/s/demo'
        })
      }
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.accepted, true);
  assert.equal(response.body.execution, 'queued');
  assert.equal(response.body.task, 'note-save');
  assert.equal(response.body.queue.added, 1);
  assert.equal(capturedPayload.header.event_id, 'evt_1');
});

test('browser login api opens a headed project session using stored browser settings', async () => {
  let capturedArgs;
  const { baseUrl } = await startServer({
    openLoginBrowser: async (args) => {
      capturedArgs = args;
      return {
        profileDir: 'G:/UserCode/XiaoHongshu_Collection/cache/chrome-debug',
        debugUrl: 'http://127.0.0.1:9222/json',
        url: 'https://www.xiaohongshu.com/explore',
        pid: 1234
      };
    }
  });

  const response = await requestJson(`${baseUrl}/api/browser/login`, {
    uiConfig: {
      browser: {
        channel: 'beta',
        headless: true
      }
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.profileDir, 'G:/UserCode/XiaoHongshu_Collection/cache/chrome-debug');
  assert.equal(response.body.pid, 1234);
  assert.equal(capturedArgs.browser.channel, 'beta');
  assert.equal(capturedArgs.browser.headless, false);
});

test('save-links passes ui config overrides to saveLinksText', async () => {
  let capturedOptions;
  const { baseUrl } = await startServer({
    saveLinksText: async (_text, options = {}) => {
      capturedOptions = options;
      return {
        total: 1,
        successCount: 1,
        failureCount: 0,
        results: [{ status: 'success', filepath: 'G:/output/abc123.md' }]
      };
    }
  });

  const response = await requestJson(`${baseUrl}/api/save-links`, {
    text: 'https://www.xiaohongshu.com/explore/abc123',
    uiConfig: {
      browser: {
        mode: 'current-browser',
        browserUrl: 'http://127.0.0.1:9333',
        channel: 'beta'
      },
      paths: {
        saveLinksOutputRoot: 'G:/custom/output',
        saveLinksImagesRoot: 'G:/custom/images'
      },
      naming: {
        conflictStrategy: 'content-aware',
        maxTitleLength: 60
      },
      runtime: {
        autoClassifyLinksEnabled: true
      },
      inbox: {
        categories: {
          AI: ['AI', 'Agent']
        }
      }
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(capturedOptions.outputRoot, 'G:/custom/output');
  assert.equal(capturedOptions.imagesRoot, 'G:/custom/images');
  assert.equal(capturedOptions.browser.mode, 'current-browser');
  assert.equal(capturedOptions.browser.browserUrl, 'http://127.0.0.1:9333');
  assert.equal(capturedOptions.browser.channel, 'beta');
  assert.equal(capturedOptions.conflictStrategy, 'content-aware');
  assert.equal(capturedOptions.maxTitleLength, 60);
  assert.equal(capturedOptions.uiRuntime.autoClassifyLinksEnabled, true);
  assert.deepEqual(capturedOptions.classificationCategories, { AI: ['AI', 'Agent'] });
});

test('stream save-links path forwards current-browser settings into resolved modes', async () => {
  let capturedParsed;
  let capturedMode;
  let capturedOptions;
  const browser = {
    mode: 'current-browser',
    browserUrl: 'http://127.0.0.1:9333',
    channel: 'beta'
  };
  const uiServer = loadUiServerInternals({
    saveNoteOverrides: {
      resolveRunModes: async (parsed) => {
        capturedParsed = parsed;
        return [{
          mode: 'url',
          noteId: 'abc123',
          canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/abc123',
          navigationUrl: 'https://www.xiaohongshu.com/explore/abc123',
          browser: parsed.browser
        }];
      },
      saveMode: async (mode, options) => {
        capturedMode = mode;
        capturedOptions = options;
        return { result: { filepath: 'G:/output/abc123.md' } };
      }
    }
  });

  const result = await uiServer.__runSaveLinksWithProgress({
    text: 'https://www.xiaohongshu.com/explore/abc123',
    uiConfig: {
      browser,
      paths: {},
      naming: {},
      runtime: {
        autoClassifyLinksEnabled: true
      },
      inbox: {
        categories: {
          AI: ['AI']
        }
      }
    }
  });

  assert.equal(result.report.successCount, 1);
  assert.deepEqual(capturedParsed.browser, browser);
  assert.deepEqual(capturedMode.browser, browser);
  assert.equal(capturedOptions.uiRuntime.autoClassifyLinksEnabled, true);
  assert.deepEqual(capturedOptions.classificationCategories, { AI: ['AI'] });
});

test('save-collection passes ui config overrides to runCollectionExport', async () => {
  let capturedOptions;
  const { baseUrl } = await startServer({
    runCollectionExport: async (_task, options = {}) => {
      capturedOptions = options;
      return {
        steps: [
          { script: 'extract_v4.js', code: 0 },
          { script: 'ocr_and_write.js', code: 0 }
        ]
      };
    }
  });

  const response = await requestJson(`${baseUrl}/api/save-collection`, {
    uiConfig: {
      paths: {
        collectionOutputRoot: 'G:/custom/output',
        collectionRawPath: 'G:/custom/raw.json'
      }
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(capturedOptions.overrides.collectionOutputRoot, 'G:/custom/output');
  assert.equal(capturedOptions.overrides.collectionRawPath, 'G:/custom/raw.json');
});

test('open-output api opens the directory for successful save-links results', async () => {
  let capturedArgs;
  const { baseUrl } = await startServer({
    openOutputFolder: async (params) => {
      capturedArgs = params;
      return path.normalize('G:/output/单条笔记保存');
    }
  });

  const response = await requestJson(`${baseUrl}/api/open-output`, {
    report: {
      total: 1,
      successCount: 1,
      failureCount: 0,
      results: [
        { status: 'success', filepath: 'G:/output/单条笔记保存/测试标题.md' }
      ]
    },
    uiConfig: {
      paths: {
        saveLinksOutputRoot: 'G:/output/单条笔记保存'
      }
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.folderPath, path.normalize('G:/output/单条笔记保存'));
  assert.ok(capturedArgs);
  assert.equal(capturedArgs.report.results[0].filepath, 'G:/output/单条笔记保存/测试标题.md');
});

test('open-output api falls back to configured collection output root', async () => {
  let capturedArgs;
  const { baseUrl } = await startServer({
    openOutputFolder: async (params) => {
      capturedArgs = params;
      return path.normalize('G:/custom/output');
    }
  });

  const response = await requestJson(`${baseUrl}/api/open-output`, {
    report: {
      status: 'success',
      output: {
        steps: [
          { script: 'extract_v4.js', code: 0 },
          { script: 'ocr_and_write.js', code: 0 }
        ]
      }
    },
    uiConfig: {
      paths: {
        collectionOutputRoot: 'G:/custom/output'
      }
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.folderPath, path.normalize('G:/custom/output'));
  assert.equal(capturedArgs.uiConfig.paths.collectionOutputRoot, 'G:/custom/output');
});

test('video-notes open-folder api opens the standalone notes workspace', async () => {
  const expectedFolderPath = path.normalize('G:/UserCode/XiaoHongshu_Collection/prj/Notes_Video_Collection');
  let capturedArgs;
  const { baseUrl } = await startServer({
    openVideoNotesFolder: async (params) => {
      capturedArgs = params;
      return expectedFolderPath;
    }
  });

  const response = await requestJson(`${baseUrl}/api/video-notes/open-folder`, {});

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.folderPath, expectedFolderPath);
  assert.match(response.body.folderPath, /Notes_Video_Collection/);
  assert.equal(capturedArgs.folderPath, expectedFolderPath);
  assert.ok(capturedArgs);
});

test('video-notes start-web api launches the standalone web workspace', async () => {
  const expectedFolderPath = path.normalize('G:/UserCode/XiaoHongshu_Collection/prj/Notes_Video_Collection');
  const expectedScriptPath = path.normalize('G:/UserCode/XiaoHongshu_Collection/prj/Notes_Video_Collection/start_web_ui.bat');
  let capturedArgs;
  const { baseUrl } = await startServer({
    startVideoNotesWeb: async (params) => {
      capturedArgs = params;
      return {
        scriptPath: expectedScriptPath,
        folderPath: expectedFolderPath,
        url: 'http://127.0.0.1:7860/'
      };
    }
  });

  const response = await requestJson(`${baseUrl}/api/video-notes/start-web`, {});

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.url, 'http://127.0.0.1:7860/');
  assert.equal(response.body.folderPath, expectedFolderPath);
  assert.equal(response.body.scriptPath, expectedScriptPath);
  assert.match(response.body.scriptPath, /start_web_ui\.bat$/);
  assert.equal(capturedArgs.folderPath, expectedFolderPath);
  assert.equal(capturedArgs.scriptPath, expectedScriptPath);
  assert.ok(capturedArgs);
});

test('startVideoNotesWeb waits for the detected web url to become reachable', async () => {
  const tempDir = createTempDir('xhs-video-notes-web-');
  const scriptPath = path.join(tempDir, 'start_web_ui.bat');
  fs.writeFileSync(scriptPath, '@echo off\r\n', 'utf-8');

  const waitedUrls = [];
  const result = await startVideoNotesWeb({
    folderPath: tempDir,
    scriptPath,
    url: 'http://127.0.0.1:7860/',
    fallbackUrl: 'http://127.0.0.1:7861/',
    spawnFn: () => createSpawnedChild(),
    isPortListeningFn: () => false,
    waitForUrlFn: async (urls) => {
      waitedUrls.push(...urls);
      return urls[0];
    }
  });

  assert.deepEqual(waitedUrls, ['http://127.0.0.1:7860/']);
  assert.equal(result.url, 'http://127.0.0.1:7860/');
});

test('startVideoNotesWeb returns fallback url when the default port is already occupied', async () => {
  const tempDir = createTempDir('xhs-video-notes-web-fallback-');
  const scriptPath = path.join(tempDir, 'start_web_ui.bat');
  fs.writeFileSync(scriptPath, '@echo off\r\n', 'utf-8');

  const waitedUrls = [];
  const result = await startVideoNotesWeb({
    folderPath: tempDir,
    scriptPath,
    url: 'http://127.0.0.1:7860/',
    fallbackUrl: 'http://127.0.0.1:7861/',
    spawnFn: () => createSpawnedChild(),
    isPortListeningFn: (port) => port === 7860,
    waitForUrlFn: async (urls) => {
      waitedUrls.push(...urls);
      return urls[0];
    }
  });

  assert.deepEqual(waitedUrls, ['http://127.0.0.1:7861/']);
  assert.equal(result.url, 'http://127.0.0.1:7861/');
});

test('export-links-list api returns exported txt path for one group', async () => {
  let capturedArgs;
  const { baseUrl } = await startServer({
    exportLinksList: async (params) => {
      capturedArgs = params;
      return {
        filePath: path.normalize('G:/output/_lists/20260321-AI-links.txt'),
        count: 2,
        groupKey: 'AI'
      };
    }
  });

  const response = await requestJson(`${baseUrl}/api/export-links-list`, {
    groupKey: 'AI',
    report: {
      results: [
        { status: 'success', filepath: 'G:/output/AI/a.md', input: 'https://mp.weixin.qq.com/s/abc123' },
        { status: 'success', filepath: 'G:/output/AI/b.md', canonicalUrl: 'https://www.zhihu.com/question/1/answer/2' }
      ]
    },
    uiConfig: {
      paths: {
        saveLinksOutputRoot: 'G:/output'
      }
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.filePath, path.normalize('G:/output/_lists/20260321-AI-links.txt'));
  assert.equal(response.body.count, 2);
  assert.equal(capturedArgs.groupKey, 'AI');
  assert.equal(capturedArgs.uiConfig.paths.saveLinksOutputRoot, 'G:/output');
});

test('ui config api merges pushbullet config but does not return access token', async () => {
  const tempDir = createTempDir('xhs-ui-config-pushbullet-');
  const uiConfigPath = path.join(tempDir, 'ui.json');
  const pushbulletConfigPath = path.join(tempDir, 'pushbullet.json');
  fs.writeFileSync(pushbulletConfigPath, JSON.stringify({
    enabled: true,
    accessToken: 'token-123',
    lastModified: 42,
    inboxPath: 'data/inbox.jsonl'
  }, null, 2), 'utf-8');

  const { baseUrl } = await startServer({ uiConfigPath, pushbulletConfigPath });
  const response = await requestGet(`${baseUrl}/api/ui-config`);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.config.pushbullet.enabled, true);
  assert.equal(response.body.config.pushbullet.lastModified, 42);
  assert.equal(response.body.config.pushbullet.inboxPath, 'data/inbox.jsonl');
  assert.equal(response.body.config.pushbullet.hasAccessToken, true);
  assert.equal(response.body.config.pushbullet.accessToken, undefined);
});

test('ui config api merges openrouter config but does not return api key', async () => {
  const tempDir = createTempDir('xhs-ui-config-openrouter-');
  const uiConfigPath = path.join(tempDir, 'ui.json');
  const openrouterConfigPath = path.join(tempDir, 'openrouter.json');
  fs.writeFileSync(openrouterConfigPath, JSON.stringify({
    enabled: true,
    apiKey: 'sk-secret-123',
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: 'qwen2.5:7b',
    timeoutMs: 45000
  }, null, 2), 'utf-8');

  const { baseUrl } = await startServer({ uiConfigPath, openrouterConfigPath });
  const response = await requestGet(`${baseUrl}/api/ui-config`);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.config.runtime.openRouterBaseUrl, 'http://127.0.0.1:11434/v1');
  assert.equal(response.body.config.runtime.openRouterModel, 'qwen2.5:7b');
  assert.equal(response.body.config.runtime.hasOpenRouterApiKey, true);
  assert.equal(response.body.config.runtime.openRouterApiKey, undefined);
});

test('ui config api persists pushbullet fields and keeps token/lastModified when omitted', async () => {
  const tempDir = createTempDir('xhs-ui-config-pushbullet-');
  const uiConfigPath = path.join(tempDir, 'ui.json');
  const pushbulletConfigPath = path.join(tempDir, 'pushbullet.json');
  fs.writeFileSync(pushbulletConfigPath, JSON.stringify({
    enabled: false,
    accessToken: 'keep-token',
    lastModified: 10,
    inboxPath: 'data/old.jsonl'
  }, null, 2), 'utf-8');

  const { baseUrl } = await startServer({ uiConfigPath, pushbulletConfigPath });
  const postResponse = await requestJson(`${baseUrl}/api/ui-config`, {
    config: {
      pushbullet: {
        enabled: true,
        inboxPath: 'data/new.jsonl'
      }
    }
  });

  assert.equal(postResponse.statusCode, 200);
  assert.equal(postResponse.body.ok, true);
  assert.equal(postResponse.body.config.pushbullet.hasAccessToken, true);

  const stored = JSON.parse(fs.readFileSync(pushbulletConfigPath, 'utf-8'));
  assert.equal(stored.enabled, true);
  assert.equal(stored.accessToken, 'keep-token');
  assert.equal(stored.inboxPath, 'data/new.jsonl');
  assert.equal(stored.lastModified, 10);
});

test('ui config api persists ai api fields into openrouter config and keeps key hidden in response', async () => {
  const tempDir = createTempDir('xhs-ui-config-openrouter-');
  const uiConfigPath = path.join(tempDir, 'ui.json');
  const openrouterConfigPath = path.join(tempDir, 'openrouter.json');
  fs.writeFileSync(openrouterConfigPath, JSON.stringify({
    enabled: true,
    apiKey: 'keep-key',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openrouter/free',
    timeoutMs: 30000
  }, null, 2), 'utf-8');

  const { baseUrl } = await startServer({ uiConfigPath, openrouterConfigPath });
  const postResponse = await requestJson(`${baseUrl}/api/ui-config`, {
    config: {
      runtime: {
        openRouterBaseUrl: 'http://127.0.0.1:12345/v1',
        openRouterModel: 'local-model',
        openRouterApiKey: 'new-secret-key'
      }
    }
  });

  assert.equal(postResponse.statusCode, 200);
  assert.equal(postResponse.body.ok, true);
  assert.equal(postResponse.body.config.runtime.openRouterBaseUrl, 'http://127.0.0.1:12345/v1');
  assert.equal(postResponse.body.config.runtime.openRouterModel, 'local-model');
  assert.equal(postResponse.body.config.runtime.hasOpenRouterApiKey, true);
  assert.equal(postResponse.body.config.runtime.openRouterApiKey, undefined);

  const stored = JSON.parse(fs.readFileSync(openrouterConfigPath, 'utf-8'));
  assert.equal(stored.baseUrl, 'http://127.0.0.1:12345/v1');
  assert.equal(stored.model, 'local-model');
  assert.equal(stored.apiKey, 'new-secret-key');
});

test('runtime ai api test route uses ui overrides and returns success payload', async () => {
  let capturedConfig = null;
  const { baseUrl } = await startServer({
    testAiApi: async ({ config }) => {
      capturedConfig = config;
      return {
        reachable: true,
        message: 'AI API 联通正常',
        baseUrl: config.baseUrl,
        model: config.model,
        statusCode: 200
      };
    }
  });

  const response = await requestJson(`${baseUrl}/api/runtime/test-ai-api`, {
    uiConfig: {
      runtime: {
        openRouterBaseUrl: 'http://127.0.0.1:12345/v1',
        openRouterApiKey: 'override-key',
        openRouterModel: 'local-model',
        openRouterTimeoutMs: 12000
      }
    }
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.reachable, true);
  assert.equal(response.body.baseUrl, 'http://127.0.0.1:12345/v1');
  assert.equal(response.body.model, 'local-model');
  assert.ok(capturedConfig);
  assert.equal(capturedConfig.baseUrl, 'http://127.0.0.1:12345/v1');
  assert.equal(capturedConfig.apiKey, 'override-key');
  assert.equal(capturedConfig.model, 'local-model');
  assert.equal(capturedConfig.timeoutMs, 12000);
});

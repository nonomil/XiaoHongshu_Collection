const { afterEach, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const Module = require('module');
const path = require('path');

const { createUiServer } = require('../../ui_server');
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
  const server = createUiServer({
    saveLinksText: overrides.saveLinksText || (async () => ({
      total: 1,
      successCount: 1,
      failureCount: 0,
      results: [{ status: 'success', filepath: 'G:/output/abc123.md' }]
    })),
    runCollectionExport: overrides.runCollectionExport || (async () => ({
      steps: [
        { script: 'extract_v4.js', code: 0 },
        { script: 'ocr_and_write.js', code: 0 }
      ]
    })),
    runInboxSync: overrides.runInboxSync,
    runInboxSave: overrides.runInboxSave,
    openOutputFolder: overrides.openOutputFolder,
    openLoginBrowser: overrides.openLoginBrowser,
    exportLinksList: overrides.exportLinksList,
    uiConfigPath: overrides.uiConfigPath,
    pushbulletConfigPath
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
});

test('ui config api persists updates', async () => {
  const tempDir = createTempDir('xhs-ui-config-');
  const uiConfigPath = path.join(tempDir, 'ui.json');
  const { baseUrl } = await startServer({ uiConfigPath });

  const postResponse = await requestJson(`${baseUrl}/api/ui-config`, {
    config: {
      paths: { saveLinksOutputRoot: 'G:/custom/output' }
    }
  });
  assert.equal(postResponse.statusCode, 200);
  assert.equal(postResponse.body.ok, true);
  assert.equal(postResponse.body.config.paths.saveLinksOutputRoot, 'G:/custom/output');

  const getResponse = await requestGet(`${baseUrl}/api/ui-config`);
  assert.equal(getResponse.body.config.paths.saveLinksOutputRoot, 'G:/custom/output');
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

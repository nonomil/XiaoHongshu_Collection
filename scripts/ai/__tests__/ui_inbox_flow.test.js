const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..', '..', '..');

function buildDom() {
  return new JSDOM(`<!DOCTYPE html>
<html>
<body>
  <form id="links-form"></form>
  <textarea id="links-text"></textarea>
  <button id="links-submit"></button>
  <button id="links-clear"></button>
  <button id="collection-submit"></button>
  <button id="inbox-sync-latest"></button>
  <button id="inbox-sync-all"></button>
  <button id="inbox-save"></button>
  <label><input type="radio" name="inbox-sync-window" value="today">今天</label>
  <label><input type="radio" name="inbox-sync-window" value="7d" checked>最近 7 天</label>
  <label><input type="radio" name="inbox-sync-window" value="30d">最近 30 天</label>
  <label><input type="radio" name="inbox-sync-window" value="60d">最近 60 天</label>
  <label><input type="radio" name="inbox-sync-window" value="2m">最近 2 个月</label>
  <label><input type="radio" name="inbox-sync-window" value="custom">自定义</label>
  <input id="inbox-sync-custom-value" />
  <select id="inbox-sync-custom-unit">
    <option value="day">天</option>
    <option value="month">月</option>
    <option value="year">年</option>
  </select>
  <p id="status-text"></p>
  <pre id="result-output"></pre>
  <div id="result-summary"></div>
  <details id="raw-report"></details>
  <div id="progress-list"></div>
  <section id="task-log-panel" hidden>
    <ol id="task-log-list" hidden></ol>
  </section>
  <section id="summary-row"></section>
  <button id="retry-failed-results"></button>
  <button id="open-output-folder"></button>

  <button id="open-settings"></button>
  <button id="close-settings"></button>
  <div id="settings-overlay"></div>
  <div id="settings-modal"></div>

  <form id="config-form"></form>
  <p id="config-status"></p>
  <button id="config-reload"></button>
  <button id="config-save"></button>

  <input id="path-links-output" />
  <input id="path-links-images" />
  <input id="path-collection-output" />
  <input id="path-collection-raw" />
  <select id="browser-mode">
    <option value="isolated">isolated</option>
    <option value="current-browser">current-browser</option>
  </select>
  <select id="browser-channel">
    <option value="stable">stable</option>
    <option value="beta">beta</option>
  </select>
  <input id="browser-url" />
  <select id="naming-strategy">
    <option value="content-aware">content-aware</option>
  </select>
  <input id="naming-max-length" />
  <input id="runtime-ai" type="checkbox" />
  <input id="runtime-auto-classify" type="checkbox" />
  <input id="runtime-vision" type="checkbox" />
  <input id="runtime-ocr-fallback" type="checkbox" />
  <input id="runtime-openrouter-base-url" />
  <input id="runtime-openrouter-api-key" />
  <input id="runtime-openrouter-model" />
  <input id="runtime-openrouter-timeout" />
  <input id="runtime-vision-timeout" />
  <input id="runtime-max-images" />
  <button id="runtime-openrouter-test" type="button"></button>
  <p id="runtime-openrouter-test-status"></p>
  <input id="pushbullet-enabled" type="checkbox" />
  <input id="pushbullet-token" />
  <input id="inbox-path" />
  <textarea id="inbox-categories"></textarea>
  <input id="ui-show-raw" type="checkbox" />

  <section id="error-banner" hidden>
    <strong id="error-title"></strong>
    <p id="error-message"></p>
    <ul id="error-hints"></ul>
    <div id="error-actions" hidden></div>
    <button id="error-dismiss"></button>
  </section>
</body>
</html>`, { url: 'http://localhost' });
}

function createJsonResponse(payload) {
  return {
    ok: true,
    json: async () => payload,
    headers: { get: () => 'application/json' }
  };
}

function createNdjsonResponse(messages = []) {
  const encoder = new TextEncoder();
  const chunks = messages.map((message) => encoder.encode(`${JSON.stringify(message)}\n`));
  let index = 0;
  return {
    ok: true,
    body: {
      getReader() {
        return {
          async read() {
            if (index >= chunks.length) {
              return { done: true, value: undefined };
            }
            const value = chunks[index];
            index += 1;
            return { done: false, value };
          }
        };
      }
    },
    headers: { get: () => 'application/x-ndjson' }
  };
}

function buildDefaultUiConfig() {
  return {
    paths: {},
    browser: {},
    naming: {},
    runtime: {
      aiSummaryEnabled: true,
      openRouterBaseUrl: 'https://openrouter.ai/api/v1',
      openRouterModel: 'openrouter/free',
      hasOpenRouterApiKey: true
    },
    pushbullet: {},
    inbox: {},
    ui: {}
  };
}

test('time-window inbox sync posts selected preset from inbox workspace', async () => {
  const dom = buildDom();
  global.window = dom.window;
  global.document = dom.window.document;

  const calls = [];
  const helpersPath = path.join(projectRoot, 'ui', 'ui_helpers.js');
  const appPath = path.join(projectRoot, 'ui', 'app.js');
  delete require.cache[helpersPath];
  delete require.cache[appPath];
  global.window.XhsUiHelpers = require(helpersPath);

  global.fetch = async (url, init) => {
    calls.push({ url: String(url), init: init || {} });
    const isGet = !init || init.method === 'GET';
    if (String(url).includes('/api/ui-config') && isGet) {
      return createJsonResponse({ config: buildDefaultUiConfig() });
    }
    if (String(url).includes('/api/inbox/sync-stream')) {
      return createNdjsonResponse([
        {
          type: 'start',
          mode: 'window',
          timeWindow: {
            preset: '7d'
          }
        },
        {
          type: 'page',
          page: 1,
          pushesCount: 3,
          accumulatedItems: 3
        },
        {
          type: 'store',
          added: 3,
          skipped: 0,
          total: 3
        },
        {
          type: 'done',
          task: 'inbox-sync',
          report: {
            mode: 'window',
            timeWindow: {
              preset: '7d'
            },
            windowLabel: '最近 7 天',
            added: 3,
            skipped: 0,
            total: 3
          }
        }
      ]);
    }
    return createJsonResponse({});
  };

  require(appPath);

  dom.window.document.getElementById('inbox-sync-latest').click();

  await new Promise((resolve) => setTimeout(resolve, 0));

  const syncCall = calls.find((entry) => entry.url.includes('/api/inbox/sync-stream'));
  assert.ok(syncCall);
  const payload = JSON.parse(syncCall.init.body);
  assert.equal(payload.mode, 'window');
  assert.deepEqual(payload.timeWindow, { preset: '7d' });
  assert.match(dom.window.document.getElementById('result-summary').textContent, /最近 7 天/);
  assert.match(dom.window.document.getElementById('task-log-list').textContent, /同步完成：新增 3 条/);
});

test('time-window inbox sync also supports custom month ranges', async () => {
  const dom = buildDom();
  global.window = dom.window;
  global.document = dom.window.document;

  const calls = [];
  const helpersPath = path.join(projectRoot, 'ui', 'ui_helpers.js');
  const appPath = path.join(projectRoot, 'ui', 'app.js');
  delete require.cache[helpersPath];
  delete require.cache[appPath];
  global.window.XhsUiHelpers = require(helpersPath);

  global.fetch = async (url, init) => {
    calls.push({ url: String(url), init: init || {} });
    const isGet = !init || init.method === 'GET';
    if (String(url).includes('/api/ui-config') && isGet) {
      return createJsonResponse({ config: buildDefaultUiConfig() });
    }
    if (String(url).includes('/api/inbox/sync-stream')) {
      return createNdjsonResponse([
        {
          type: 'start',
          mode: 'window',
          timeWindow: {
            value: 2,
            unit: 'month'
          }
        },
        {
          type: 'page',
          page: 1,
          pushesCount: 6,
          accumulatedItems: 6
        },
        {
          type: 'store',
          added: 6,
          skipped: 0,
          total: 6
        },
        {
          type: 'done',
          task: 'inbox-sync',
          report: {
            mode: 'window',
            timeWindow: {
              value: 2,
              unit: 'month'
            },
            windowLabel: '最近 2 个月',
            added: 6,
            skipped: 0,
            total: 6
          }
        }
      ]);
    }
    return createJsonResponse({});
  };

  require(appPath);

  dom.window.document.querySelector('input[name="inbox-sync-window"][value="custom"]').checked = true;
  dom.window.document.getElementById('inbox-sync-custom-value').value = '2';
  dom.window.document.getElementById('inbox-sync-custom-unit').value = 'month';
  dom.window.document.getElementById('inbox-sync-latest').click();

  await new Promise((resolve) => setTimeout(resolve, 0));

  const syncCall = calls.find((entry) => entry.url.includes('/api/inbox/sync-stream'));
  assert.ok(syncCall);
  const payload = JSON.parse(syncCall.init.body);
  assert.equal(payload.mode, 'window');
  assert.deepEqual(payload.timeWindow, { value: 2, unit: 'month' });
  assert.match(dom.window.document.getElementById('result-summary').textContent, /最近 2 个月/);
});

test('inbox save reuses the latest time-window sync urls instead of the whole inbox', async () => {
  const dom = buildDom();
  global.window = dom.window;
  global.document = dom.window.document;

  const calls = [];
  const helpersPath = path.join(projectRoot, 'ui', 'ui_helpers.js');
  const appPath = path.join(projectRoot, 'ui', 'app.js');
  delete require.cache[helpersPath];
  delete require.cache[appPath];
  global.window.XhsUiHelpers = require(helpersPath);

  global.fetch = async (url, init) => {
    calls.push({ url: String(url), init: init || {} });
    const isGet = !init || init.method === 'GET';
    if (String(url).includes('/api/ui-config') && isGet) {
      return createJsonResponse({ config: buildDefaultUiConfig() });
    }
    if (String(url).includes('/api/inbox/sync-stream')) {
      return createNdjsonResponse([
        {
          type: 'start',
          mode: 'window',
          timeWindow: {
            preset: 'today'
          }
        },
        {
          type: 'page',
          page: 1,
          pushesCount: 2,
          accumulatedItems: 2
        },
        {
          type: 'store',
          added: 2,
          skipped: 0,
          total: 2
        },
        {
          type: 'done',
          task: 'inbox-sync',
          report: {
            mode: 'window',
            timeWindow: {
              preset: 'today'
            },
            windowLabel: '今天',
            urls: [
              'http://xhslink.com/o/demo',
              'https://mp.weixin.qq.com/s/demo'
            ],
            added: 2,
            skipped: 0,
            total: 2
          }
        }
      ]);
    }
    if (String(url).includes('/api/inbox/save')) {
      return createJsonResponse({
        report: {
          total: 2,
          successCount: 2,
          failureCount: 0,
          results: []
        }
      });
    }
    return createJsonResponse({});
  };

  require(appPath);

  dom.window.document.querySelector('input[name="inbox-sync-window"][value="today"]').checked = true;
  dom.window.document.getElementById('inbox-sync-latest').click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  dom.window.document.getElementById('inbox-save').click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const saveCall = calls.find((entry) => entry.url.includes('/api/inbox/save'));
  assert.ok(saveCall);
  const payload = JSON.parse(saveCall.init.body);
  assert.deepEqual(payload.urls, [
    'http://xhslink.com/o/demo',
    'https://mp.weixin.qq.com/s/demo'
  ]);
  assert.equal(payload.syncReport.mode, 'window');
  assert.deepEqual(payload.syncReport.timeWindow, { preset: 'today' });
});

test('inbox save uses stream endpoint and renders per-item progress for larger batches', async () => {
  const dom = buildDom();
  global.window = dom.window;
  global.document = dom.window.document;

  const calls = [];
  const helpersPath = path.join(projectRoot, 'ui', 'ui_helpers.js');
  const appPath = path.join(projectRoot, 'ui', 'app.js');
  delete require.cache[helpersPath];
  delete require.cache[appPath];
  global.window.XhsUiHelpers = require(helpersPath);

  global.fetch = async (url, init) => {
    calls.push({ url: String(url), init: init || {} });
    const isGet = !init || init.method === 'GET';
    if (String(url).includes('/api/ui-config') && isGet) {
      return createJsonResponse({ config: buildDefaultUiConfig() });
    }
    if (String(url).includes('/api/inbox/sync-stream')) {
      return createNdjsonResponse([
        {
          type: 'start',
          mode: 'window',
          timeWindow: {
            value: 2,
            unit: 'month'
          }
        },
        {
          type: 'page',
          page: 1,
          pushesCount: 2,
          accumulatedItems: 2
        },
        {
          type: 'store',
          added: 2,
          skipped: 0,
          total: 2
        },
        {
          type: 'done',
          task: 'inbox-sync',
          report: {
            mode: 'window',
            timeWindow: {
              value: 2,
              unit: 'month'
            },
            windowLabel: '最近 2 个月',
            urls: [
              'https://mp.weixin.qq.com/s/demo-a',
              'https://mp.weixin.qq.com/s/demo-b'
            ],
            added: 2,
            skipped: 0,
            total: 2
          }
        }
      ]);
    }
    if (String(url).includes('/api/inbox/save-stream')) {
      return createNdjsonResponse([
        {
          type: 'start',
          total: 2,
          targets: [
            { index: 0, navigationUrl: 'https://mp.weixin.qq.com/s/demo-a' },
            { index: 1, navigationUrl: 'https://mp.weixin.qq.com/s/demo-b' }
          ]
        },
        {
          type: 'tick',
          index: 0,
          total: 2,
          target: { index: 0, navigationUrl: 'https://mp.weixin.qq.com/s/demo-a' }
        },
        {
          type: 'progress',
          index: 0,
          total: 2,
          result: {
            status: 'success',
            filepath: 'G:/output/demo-a.md',
            input: 'https://mp.weixin.qq.com/s/demo-a'
          }
        },
        {
          type: 'tick',
          index: 1,
          total: 2,
          target: { index: 1, navigationUrl: 'https://mp.weixin.qq.com/s/demo-b' }
        },
        {
          type: 'progress',
          index: 1,
          total: 2,
          result: {
            status: 'failed',
            input: 'https://mp.weixin.qq.com/s/demo-b',
            error: 'mock failure'
          }
        },
        {
          type: 'done',
          task: 'inbox-save',
          report: {
            total: 2,
            successCount: 1,
            failureCount: 1,
            results: [
              { status: 'success', filepath: 'G:/output/demo-a.md', input: 'https://mp.weixin.qq.com/s/demo-a' },
              { status: 'failed', input: 'https://mp.weixin.qq.com/s/demo-b', error: 'mock failure' }
            ]
          }
        }
      ]);
    }
    return createJsonResponse({});
  };

  require(appPath);

  dom.window.document.querySelector('input[name="inbox-sync-window"][value="custom"]').checked = true;
  dom.window.document.getElementById('inbox-sync-custom-value').value = '2';
  dom.window.document.getElementById('inbox-sync-custom-unit').value = 'month';
  dom.window.document.getElementById('inbox-sync-latest').click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  dom.window.document.getElementById('inbox-save').click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const saveCall = calls.find((entry) => entry.url.includes('/api/inbox/save-stream'));
  assert.ok(saveCall);
  const payload = JSON.parse(saveCall.init.body);
  assert.deepEqual(payload.urls, [
    'https://mp.weixin.qq.com/s/demo-a',
    'https://mp.weixin.qq.com/s/demo-b'
  ]);
  assert.equal(dom.window.document.getElementById('progress-list').children.length, 2);
  assert.match(dom.window.document.getElementById('task-log-list').textContent, /开始第 1\/2 条/);
  assert.match(dom.window.document.getElementById('task-log-list').textContent, /解析成功/);
  assert.match(dom.window.document.getElementById('task-log-list').textContent, /解析失败/);
  assert.match(dom.window.document.getElementById('task-log-list').textContent, /解析完成：成功 1 条，失败 1 条/);
  assert.match(dom.window.document.getElementById('status-text').textContent, /收件箱解析保存完成/);
  assert.match(dom.window.document.getElementById('result-summary').textContent, /成功/);
  assert.match(dom.window.document.getElementById('result-summary').textContent, /失败/);
});

test('inbox save writes interruption logs when stream closes before done', async () => {
  const dom = buildDom();
  global.window = dom.window;
  global.document = dom.window.document;

  const calls = [];
  const helpersPath = path.join(projectRoot, 'ui', 'ui_helpers.js');
  const appPath = path.join(projectRoot, 'ui', 'app.js');
  delete require.cache[helpersPath];
  delete require.cache[appPath];
  global.window.XhsUiHelpers = require(helpersPath);

  global.fetch = async (url, init) => {
    calls.push({ url: String(url), init: init || {} });
    const isGet = !init || init.method === 'GET';
    if (String(url).includes('/api/ui-config') && isGet) {
      return createJsonResponse({ config: buildDefaultUiConfig() });
    }
    if (String(url).includes('/api/inbox/sync-stream')) {
      return createNdjsonResponse([
        {
          type: 'start',
          mode: 'window',
          timeWindow: {
            value: 2,
            unit: 'month'
          }
        },
        {
          type: 'page',
          page: 1,
          pushesCount: 2,
          accumulatedItems: 2
        },
        {
          type: 'store',
          added: 2,
          skipped: 0,
          total: 2
        },
        {
          type: 'done',
          task: 'inbox-sync',
          report: {
            mode: 'window',
            timeWindow: {
              value: 2,
              unit: 'month'
            },
            windowLabel: '最近 2 个月',
            urls: [
              'https://mp.weixin.qq.com/s/demo-a',
              'https://mp.weixin.qq.com/s/demo-b'
            ],
            added: 2,
            skipped: 0,
            total: 2
          }
        }
      ]);
    }
    if (String(url).includes('/api/inbox/save-stream')) {
      return createNdjsonResponse([
        {
          type: 'start',
          total: 2,
          targets: [
            { index: 0, navigationUrl: 'https://mp.weixin.qq.com/s/demo-a' },
            { index: 1, navigationUrl: 'https://mp.weixin.qq.com/s/demo-b' }
          ]
        },
        {
          type: 'tick',
          index: 0,
          total: 2,
          target: { index: 0, navigationUrl: 'https://mp.weixin.qq.com/s/demo-a' }
        }
      ]);
    }
    return createJsonResponse({});
  };

  require(appPath);

  dom.window.document.querySelector('input[name="inbox-sync-window"][value="custom"]').checked = true;
  dom.window.document.getElementById('inbox-sync-custom-value').value = '2';
  dom.window.document.getElementById('inbox-sync-custom-unit').value = 'month';
  dom.window.document.getElementById('inbox-sync-latest').click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  dom.window.document.getElementById('inbox-save').click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const saveCall = calls.find((entry) => entry.url.includes('/api/inbox/save-stream'));
  assert.ok(saveCall);
  assert.match(dom.window.document.getElementById('status-text').textContent, /收件箱解析保存失败/);
  assert.match(dom.window.document.getElementById('task-log-list').textContent, /后台中断/);
  assert.match(dom.window.document.getElementById('task-log-list').textContent, /最近处理到第 1\/2 条/);
});

test('manual ai api test button calls runtime test endpoint and shows success status', async () => {
  const dom = buildDom();
  global.window = dom.window;
  global.document = dom.window.document;

  const calls = [];
  const helpersPath = path.join(projectRoot, 'ui', 'ui_helpers.js');
  const appPath = path.join(projectRoot, 'ui', 'app.js');
  delete require.cache[helpersPath];
  delete require.cache[appPath];
  global.window.XhsUiHelpers = require(helpersPath);

  global.fetch = async (url, init) => {
    calls.push({ url: String(url), init: init || {} });
    const isGet = !init || init.method === 'GET';
    if (String(url).includes('/api/ui-config') && isGet) {
      return createJsonResponse({ config: buildDefaultUiConfig() });
    }
    if (String(url).includes('/api/runtime/test-ai-api')) {
      return createJsonResponse({
        ok: true,
        reachable: true,
        message: 'AI API 联通正常：local-model',
        baseUrl: 'http://127.0.0.1:12345/v1',
        model: 'local-model'
      });
    }
    return createJsonResponse({});
  };

  require(appPath);
  await new Promise((resolve) => setTimeout(resolve, 0));

  dom.window.document.getElementById('runtime-openrouter-base-url').value = 'http://127.0.0.1:12345/v1';
  dom.window.document.getElementById('runtime-openrouter-api-key').value = 'local-key';
  dom.window.document.getElementById('runtime-openrouter-model').value = 'local-model';
  dom.window.document.getElementById('runtime-openrouter-test').click();

  await new Promise((resolve) => setTimeout(resolve, 0));

  const testCall = calls.find((entry) => entry.url.includes('/api/runtime/test-ai-api'));
  assert.ok(testCall);
  const payload = JSON.parse(testCall.init.body);
  assert.equal(payload.uiConfig.runtime.openRouterBaseUrl, 'http://127.0.0.1:12345/v1');
  assert.equal(payload.uiConfig.runtime.openRouterApiKey, 'local-key');
  assert.equal(payload.uiConfig.runtime.openRouterModel, 'local-model');
  assert.match(dom.window.document.getElementById('runtime-openrouter-test-status').textContent, /AI API 联通正常/);
});

test('inbox save blocks execution and logs when ai api precheck fails', async () => {
  const dom = buildDom();
  global.window = dom.window;
  global.document = dom.window.document;

  const calls = [];
  const helpersPath = path.join(projectRoot, 'ui', 'ui_helpers.js');
  const appPath = path.join(projectRoot, 'ui', 'app.js');
  delete require.cache[helpersPath];
  delete require.cache[appPath];
  global.window.XhsUiHelpers = require(helpersPath);

  global.fetch = async (url, init) => {
    calls.push({ url: String(url), init: init || {} });
    const isGet = !init || init.method === 'GET';
    if (String(url).includes('/api/ui-config') && isGet) {
      return createJsonResponse({ config: buildDefaultUiConfig() });
    }
    if (String(url).includes('/api/runtime/test-ai-api')) {
      return {
        ok: false,
        json: async () => ({ error: 'AI API 检查失败：HTTP 401 unauthorized' }),
        headers: { get: () => 'application/json' }
      };
    }
    if (String(url).includes('/api/inbox/save-stream')) {
      throw new Error('precheck failure should block inbox save request');
    }
    return createJsonResponse({});
  };

  require(appPath);
  await new Promise((resolve) => setTimeout(resolve, 0));

  dom.window.document.getElementById('inbox-save').click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(calls.some((entry) => entry.url.includes('/api/runtime/test-ai-api')), true);
  assert.equal(calls.some((entry) => entry.url.includes('/api/inbox/save-stream')), false);
  assert.match(dom.window.document.getElementById('status-text').textContent, /AI API|阻止|不可用/);
  assert.match(dom.window.document.getElementById('task-log-list').textContent, /开始检查 AI API 联通性/);
  assert.match(dom.window.document.getElementById('task-log-list').textContent, /检查失败/);
});

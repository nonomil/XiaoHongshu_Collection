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
  <select id="inbox-sync-range">
    <option value="10">最近 10 条</option>
    <option value="20">最近 20 条</option>
    <option value="30">最近 30 条</option>
  </select>
  <p id="status-text"></p>
  <pre id="result-output"></pre>
  <div id="result-summary"></div>
  <details id="raw-report"></details>
  <div id="progress-list"></div>
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
  <input id="runtime-openrouter-timeout" />
  <input id="runtime-vision-timeout" />
  <input id="runtime-max-images" />
  <input id="pushbullet-enabled" type="checkbox" />
  <input id="pushbullet-token" />
  <input id="inbox-path" />
  <textarea id="inbox-categories"></textarea>
  <input id="ui-show-raw" type="checkbox" />

  <section id="error-banner" hidden>
    <strong id="error-title"></strong>
    <p id="error-message"></p>
    <ul id="error-hints"></ul>
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

function buildDefaultUiConfig() {
  return {
    paths: {},
    browser: {},
    naming: {},
    runtime: {},
    pushbullet: {},
    inbox: {},
    ui: {}
  };
}

test('recent inbox sync posts selected 10/20/30 limit from entry 03', async () => {
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
    if (String(url).includes('/api/inbox/sync')) {
      return createJsonResponse({
        report: {
          mode: 'recent',
          limit: 20,
          added: 3,
          skipped: 0,
          total: 3
        }
      });
    }
    return createJsonResponse({});
  };

  require(appPath);

  const select = dom.window.document.getElementById('inbox-sync-range');
  select.value = '20';
  dom.window.document.getElementById('inbox-sync-latest').click();

  await new Promise((resolve) => setTimeout(resolve, 0));

  const syncCall = calls.find((entry) => entry.url.includes('/api/inbox/sync'));
  assert.ok(syncCall);
  const payload = JSON.parse(syncCall.init.body);
  assert.equal(payload.mode, 'recent');
  assert.equal(payload.limit, 20);
  assert.match(dom.window.document.getElementById('result-summary').textContent, /20/);
});

test('recent inbox sync also supports larger limits like 50/60', async () => {
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
    if (String(url).includes('/api/inbox/sync')) {
      return createJsonResponse({
        report: {
          mode: 'recent',
          limit: 60,
          added: 6,
          skipped: 0,
          total: 6
        }
      });
    }
    return createJsonResponse({});
  };

  require(appPath);

  const select = dom.window.document.getElementById('inbox-sync-range');
  select.insertAdjacentHTML('beforeend', '<option value="50">50</option><option value="60">60</option>');
  select.value = '60';
  dom.window.document.getElementById('inbox-sync-latest').click();

  await new Promise((resolve) => setTimeout(resolve, 0));

  const syncCall = calls.find((entry) => entry.url.includes('/api/inbox/sync'));
  assert.ok(syncCall);
  const payload = JSON.parse(syncCall.init.body);
  assert.equal(payload.mode, 'recent');
  assert.equal(payload.limit, 60);
  assert.match(dom.window.document.getElementById('result-summary').textContent, /60/);
});

test('inbox save reuses the latest recent-sync urls instead of the whole inbox', async () => {
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
    if (String(url).includes('/api/inbox/sync')) {
      return createJsonResponse({
        report: {
          mode: 'recent',
          limit: 30,
          urls: [
            'http://xhslink.com/o/demo',
            'https://mp.weixin.qq.com/s/demo'
          ],
          added: 2,
          skipped: 0,
          total: 2
        }
      });
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
  assert.equal(payload.syncReport.mode, 'recent');
  assert.equal(payload.syncReport.limit, 30);
});

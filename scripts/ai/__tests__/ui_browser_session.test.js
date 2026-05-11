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
  <input id="zhihu-favorites-url" />
  <input id="zhihu-favorites-title" />
  <input id="zhihu-favorites-limit" />
  <button id="zhihu-favorites-submit"></button>
  <div class="collection-source-switch">
    <button type="button" data-collection-source="xiaohongshu">小红书收藏</button>
    <button type="button" data-collection-source="zhihu">知乎收藏夹</button>
  </div>
  <section data-collection-panel="xiaohongshu"></section>
  <section data-collection-panel="zhihu"></section>
  <button id="refresh-browser-status"></button>
  <div id="browser-status-summary"></div>
  <p id="browser-status-detail"></p>
  <button id="inbox-sync-latest"></button>
  <button id="inbox-sync-all"></button>
  <button id="inbox-save"></button>
  <select id="inbox-sync-range">
    <option value="10">10</option>
    <option value="20">20</option>
    <option value="30">30</option>
  </select>
  <p id="status-text"></p>
  <pre id="result-output"></pre>
  <div id="result-summary"></div>
  <details id="raw-report"></details>
  <div id="progress-list"></div>
  <section id="summary-row"></section>
  <div id="task-history-list"></div>
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
  <input id="browser-headless" type="checkbox" />
  <button id="open-login-browser" type="button"></button>
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
    browser: {
      mode: 'current-browser',
      channel: 'stable',
      browserUrl: '',
      headless: true
    },
    naming: {},
    runtime: {},
    pushbullet: {},
    inbox: {},
    ui: {}
  };
}

test('app applies browser headless config and posts it back on save', async () => {
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
    if (String(url).includes('/api/ui-config')) {
      const payload = JSON.parse(init.body);
      return createJsonResponse({ config: payload.config });
    }
    return createJsonResponse({});
  };

  require(appPath);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const checkbox = dom.window.document.getElementById('browser-headless');
  assert.equal(checkbox.checked, true);
  assert.equal(dom.window.document.getElementById('browser-mode').value, 'current-browser');

  checkbox.checked = false;
  dom.window.document.getElementById('config-form').dispatchEvent(new dom.window.Event('submit', {
    bubbles: true,
    cancelable: true
  }));
  await new Promise((resolve) => setTimeout(resolve, 0));

  const saveCall = calls.find((entry) => entry.url.includes('/api/ui-config') && entry.init.method !== 'GET');
  assert.ok(saveCall);
  const payload = JSON.parse(saveCall.init.body);
  assert.equal(payload.config.browser.headless, false);
});

test('app can open project login browser from settings', async () => {
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
    if (String(url).includes('/api/browser/login')) {
      return createJsonResponse({
        profileDir: 'G:/UserCode/XiaoHongshu_Collection/cache/chrome-debug',
        debugUrl: 'http://127.0.0.1:9222/json',
        url: 'https://www.xiaohongshu.com/explore'
      });
    }
    return createJsonResponse({});
  };

  require(appPath);
  await new Promise((resolve) => setTimeout(resolve, 0));

  dom.window.document.getElementById('open-login-browser').click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const loginCall = calls.find((entry) => entry.url.includes('/api/browser/login'));
  assert.ok(loginCall);
  assert.match(dom.window.document.getElementById('status-text').textContent, /登录浏览器|项目会话/i);
});

test('app can refresh browser status and render connection summary', async () => {
  const dom = buildDom();
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.localStorage = dom.window.localStorage;

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
    if (String(url).includes('/api/browser/status')) {
      return createJsonResponse({
        status: {
          connected: true,
          browserLabel: '当前浏览器',
          browserDetail: '已连接 Chrome 146 调试会话',
          platforms: {
            xiaohongshu: { state: 'logged_in', label: '已检测到登录态' },
            zhihu: { state: 'logged_out', label: '未检测到登录态' }
          },
          tabs: {
            xiaohongshu: true,
            zhihu: false
          }
        }
      });
    }
    return createJsonResponse({});
  };

  require(appPath);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  dom.window.document.getElementById('refresh-browser-status').click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const statusCall = calls.find((entry) => entry.url.includes('/api/browser/status'));
  assert.ok(statusCall);
  assert.match(dom.window.document.getElementById('browser-status-summary').textContent, /当前浏览器|小红书|知乎/);
  assert.match(dom.window.document.getElementById('browser-status-detail').textContent, /Chrome 146|已连接/);
  assert.match(dom.window.document.getElementById('browser-status-detail').textContent, /小红书标签页已打开/);
  const pillTitles = Array.from(dom.window.document.querySelectorAll('.browser-status-pill strong'))
    .map((node) => node.textContent.trim())
    .filter(Boolean);
  assert.deepEqual(pillTitles, ['连接状态', '小红书', '知乎']);
});

test('app warns current-browser mode will fall back to project browser when Xiaohongshu tab is missing', async () => {
  const dom = buildDom();
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.localStorage = dom.window.localStorage;

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
    if (String(url).includes('/api/browser/status')) {
      return createJsonResponse({
        status: {
          connected: true,
          browserLabel: '当前浏览器',
          browserDetail: '已连接 Chrome 146 调试会话',
          platforms: {
            xiaohongshu: { state: 'logged_in', label: '已检测到登录态' },
            zhihu: { state: 'unknown', label: '未检测' }
          },
          tabs: {
            xiaohongshu: false,
            zhihu: false
          }
        }
      });
    }
    return createJsonResponse({});
  };

  require(appPath);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  dom.window.document.getElementById('refresh-browser-status').click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const statusCall = calls.find((entry) => entry.url.includes('/api/browser/status'));
  assert.ok(statusCall);
  const detailText = dom.window.document.getElementById('browser-status-detail').textContent;
  assert.match(detailText, /小红书标签页未打开/);
  assert.match(detailText, /项目浏览器|自动切换/);
});

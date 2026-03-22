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
      mode: 'isolated',
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

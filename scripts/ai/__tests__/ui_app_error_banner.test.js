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
  <button id="refresh-browser-status"></button>
  <div id="browser-status-summary"></div>
  <p id="browser-status-detail"></p>
  <button id="inbox-sync"></button>
  <button id="inbox-sync-all-top"></button>
  <button id="inbox-sync-latest"></button>
  <button id="inbox-sync-all"></button>
  <button id="inbox-save"></button>
  <p id="status-text"></p>
  <pre id="result-output"></pre>
  <div id="result-summary"></div>
  <details id="raw-report"></details>
  <div id="progress-list"></div>
  <section id="summary-row"></section>
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
    <div id="error-actions"></div>
    <button id="error-dismiss"></button>
  </section>
</body>
</html>`, { url: 'http://localhost' });
}

test('collection error triggers error banner', async () => {
  const dom = buildDom();
  global.window = dom.window;
  global.document = dom.window.document;

  const helpersPath = path.join(projectRoot, 'ui', 'ui_helpers.js');
  delete require.cache[helpersPath];
  const helpers = require(helpersPath);
  global.window.XhsUiHelpers = helpers;

  global.fetch = async (url, init) => {
    const isGet = !init || init.method === 'GET';
    if (String(url).includes('/api/ui-config') && isGet) {
      return {
        ok: true,
        json: async () => ({
          config: {
            paths: {},
            browser: {},
            naming: {},
            runtime: {},
            pushbullet: {},
            inbox: {},
            ui: {}
          }
        }),
        headers: { get: () => 'application/json' }
      };
    }
    if (String(url).includes('/api/save-collection')) {
      return {
        ok: false,
        json: async () => ({ error: '\u672a\u68c0\u6d4b\u5230\u767b\u5f55\u8d26\u53f7\uff0c\u8bf7\u5148\u767b\u5f55\u540e\u91cd\u8bd5\u3002' }),
        headers: { get: () => 'application/json' }
      };
    }
    return {
      ok: true,
      json: async () => ({}),
      headers: { get: () => 'application/json' }
    };
  };

  const appPath = path.join(projectRoot, 'ui', 'app.js');
  delete require.cache[appPath];
  require(appPath);

  const button = dom.window.document.getElementById('collection-submit');
  button.click();

  await new Promise((resolve) => setTimeout(resolve, 0));

  const banner = dom.window.document.getElementById('error-banner');
  const message = dom.window.document.getElementById('error-message');
  assert.equal(banner.hidden, false);
  assert.match(message.textContent, /\u767b\u5f55/);
});

test('browser connection error exposes repair actions and can auto-fix into isolated mode', async () => {
  const dom = buildDom();
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.localStorage = dom.window.localStorage;

  const helpersPath = path.join(projectRoot, 'ui', 'ui_helpers.js');
  delete require.cache[helpersPath];
  const helpers = require(helpersPath);
  global.window.XhsUiHelpers = helpers;

  const calls = [];
  const defaultConfig = {
    paths: {},
    browser: {
      mode: 'current-browser',
      channel: 'stable',
      browserUrl: '',
      headless: false
    },
    naming: {},
    runtime: {},
    pushbullet: {},
    inbox: {},
    ui: {}
  };

  global.fetch = async (url, init) => {
    calls.push({ url: String(url), init: init || {} });
    const isGet = !init || init.method === 'GET';
    if (String(url).includes('/api/ui-config') && isGet) {
      return {
        ok: true,
        json: async () => ({ config: defaultConfig }),
        headers: { get: () => 'application/json' }
      };
    }
    if (String(url).includes('/api/save-collection')) {
      return {
        ok: false,
        json: async () => ({ error: 'Chrome remote debugging is not available on port 9222.' }),
        headers: { get: () => 'application/json' }
      };
    }
    if (String(url).includes('/api/ui-config')) {
      const payload = JSON.parse(init.body);
      return {
        ok: true,
        json: async () => ({ config: payload.config }),
        headers: { get: () => 'application/json' }
      };
    }
    if (String(url).includes('/api/browser/login')) {
      return {
        ok: true,
        json: async () => ({
          profileDir: 'G:/UserCode/XiaoHongshu_Collection/.cache/chrome-debug'
        }),
        headers: { get: () => 'application/json' }
      };
    }
    if (String(url).includes('/api/browser/status')) {
      return {
        ok: true,
        json: async () => ({
          status: {
            connected: true,
            browserLabel: '项目浏览器',
            browserDetail: '已切换到项目浏览器并连接成功',
            platforms: {
              xiaohongshu: { state: 'unknown', label: '未检测' },
              zhihu: { state: 'unknown', label: '未检测' }
            },
            tabs: {
              xiaohongshu: false,
              zhihu: false
            }
          }
        }),
        headers: { get: () => 'application/json' }
      };
    }
    return {
      ok: true,
      json: async () => ({}),
      headers: { get: () => 'application/json' }
    };
  };

  const appPath = path.join(projectRoot, 'ui', 'app.js');
  delete require.cache[appPath];
  require(appPath);
  await new Promise((resolve) => setTimeout(resolve, 0));

  dom.window.document.getElementById('collection-submit').click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const repairButton = dom.window.document.querySelector('[data-error-action="repair_browser_session"]');
  assert.ok(repairButton);

  repairButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  const saveCall = calls.find((entry) => entry.url.includes('/api/ui-config') && entry.init.method === 'POST');
  assert.ok(saveCall);
  const savedPayload = JSON.parse(saveCall.init.body);
  assert.equal(savedPayload.config.browser.mode, 'isolated');

  const loginCall = calls.find((entry) => entry.url.includes('/api/browser/login'));
  assert.ok(loginCall);
  assert.match(dom.window.document.getElementById('status-text').textContent, /项目登录浏览器|隔离浏览器|浏览器状态已刷新/i);
});

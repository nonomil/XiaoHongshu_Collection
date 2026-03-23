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
  <button id="inbox-sync"></button>
  <button id="inbox-sync-all-top"></button>
  <button id="inbox-sync-latest"></button>
  <button id="inbox-sync-all"></button>
  <button id="inbox-save"></button>
  <select id="inbox-sync-range">
    <option value="10">10</option>
    <option value="20">20</option>
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
  <div id="settings-overlay" hidden></div>
  <div id="settings-modal" hidden></div>

  <form id="config-form"></form>
  <div class="settings-layout">
    <div class="settings-tablist" role="tablist" aria-label="设置分组">
      <button id="settings-tab-basic" data-settings-tab="basic" type="button" role="tab" aria-controls="settings-panel-basic">基础保存</button>
      <button id="settings-tab-browser" data-settings-tab="browser" type="button" role="tab" aria-controls="settings-panel-browser">浏览器接入</button>
      <button id="settings-tab-inbox" data-settings-tab="inbox" type="button" role="tab" aria-controls="settings-panel-inbox">外部入口</button>
      <button id="settings-tab-advanced" data-settings-tab="advanced" type="button" role="tab" aria-controls="settings-panel-advanced">高级参数</button>
    </div>
    <section id="settings-panel-basic" data-settings-panel="basic" role="tabpanel" aria-labelledby="settings-tab-basic"></section>
    <section id="settings-panel-browser" data-settings-panel="browser" role="tabpanel" aria-labelledby="settings-tab-browser"></section>
    <section id="settings-panel-inbox" data-settings-panel="inbox" role="tabpanel" aria-labelledby="settings-tab-inbox"></section>
    <section id="settings-panel-advanced" data-settings-panel="advanced" role="tabpanel" aria-labelledby="settings-tab-advanced"></section>
  </div>
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
  <button id="open-login-browser"></button>
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

test('settings tabs switch panels and keep current tab across modal reopen', async () => {
  const dom = buildDom();
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.localStorage = dom.window.localStorage;

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

  const basicTab = dom.window.document.getElementById('settings-tab-basic');
  const browserTab = dom.window.document.getElementById('settings-tab-browser');
  const basicPanel = dom.window.document.getElementById('settings-panel-basic');
  const browserPanel = dom.window.document.getElementById('settings-panel-browser');
  const openSettingsButton = dom.window.document.getElementById('open-settings');
  const closeSettingsButton = dom.window.document.getElementById('close-settings');
  const settingsModal = dom.window.document.getElementById('settings-modal');

  assert.equal(basicTab.getAttribute('aria-selected'), 'true');
  assert.equal(basicPanel.hidden, false);
  assert.equal(browserPanel.hidden, true);

  openSettingsButton.click();
  assert.equal(settingsModal.hidden, false);

  browserTab.click();
  assert.equal(browserTab.getAttribute('aria-selected'), 'true');
  assert.equal(basicTab.getAttribute('aria-selected'), 'false');
  assert.equal(browserPanel.hidden, false);
  assert.equal(basicPanel.hidden, true);

  closeSettingsButton.click();
  assert.equal(settingsModal.hidden, true);

  openSettingsButton.click();
  assert.equal(settingsModal.hidden, false);
  assert.equal(browserTab.getAttribute('aria-selected'), 'true');
  assert.equal(browserPanel.hidden, false);
});

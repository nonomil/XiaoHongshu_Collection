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
  <button id="inbox-sync"></button>
  <button id="inbox-sync-all-top"></button>
  <button id="inbox-sync-latest"></button>
  <button id="inbox-sync-all"></button>
  <button id="inbox-save"></button>
  <select id="inbox-sync-range"><option value="10">10</option></select>
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
  <nav>
    <a class="workspace-nav-link" href="#section-collection"></a>
    <a class="workspace-nav-link" href="#section-inbox"></a>
    <a class="workspace-nav-link" href="#section-links"></a>
    <a class="workspace-nav-link" href="#section-results"></a>
  </nav>
  <section id="section-collection"></section>
  <section id="section-inbox"></section>
  <section id="section-links"></section>
  <section id="section-results"></section>
  <form id="config-form"></form>
  <p id="config-status"></p>
  <button id="config-reload"></button>
  <button id="config-save"></button>
  <input id="path-links-output" />
  <input id="path-links-images" />
  <input id="path-collection-output" />
  <input id="path-collection-raw" />
  <select id="browser-mode"><option value="isolated">isolated</option><option value="current-browser">current-browser</option></select>
  <select id="browser-channel"><option value="stable">stable</option></select>
  <input id="browser-url" />
  <input id="browser-headless" type="checkbox" />
  <button id="open-login-browser"></button>
  <select id="naming-strategy"><option value="content-aware">content-aware</option></select>
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
  <div id="task-history-list"></div>
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

test('collection source switch toggles panels and keeps selected source in localStorage', async () => {
  const dom = buildDom();
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.localStorage = dom.window.localStorage;

  const helpersPath = path.join(projectRoot, 'ui', 'ui_helpers.js');
  const appPath = path.join(projectRoot, 'ui', 'app.js');
  delete require.cache[helpersPath];
  delete require.cache[appPath];
  global.window.XhsUiHelpers = require(helpersPath);

  global.fetch = async (url, init) => {
    const isGet = !init || init.method === 'GET';
    if (String(url).includes('/api/ui-config') && isGet) {
      return createJsonResponse({
        config: {
          paths: {},
          browser: {},
          naming: {},
          runtime: {},
          pushbullet: {},
          inbox: {},
          ui: {}
        }
      });
    }
    if (String(url).includes('/api/browser/status')) {
      return createJsonResponse({
        status: {
          connected: false,
          browserLabel: '未连接浏览器',
          browserDetail: '未检测到可复用的 Chrome 调试会话',
          platforms: {
            xiaohongshu: { state: 'unknown', label: '未检测' },
            zhihu: { state: 'unknown', label: '未检测' }
          },
          tabs: {}
        }
      });
    }
    return createJsonResponse({});
  };

  require(appPath);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  const xhsButton = document.querySelector('[data-collection-source="xiaohongshu"]');
  const zhihuButton = document.querySelector('[data-collection-source="zhihu"]');
  const xhsPanel = document.querySelector('[data-collection-panel="xiaohongshu"]');
  const zhihuPanel = document.querySelector('[data-collection-panel="zhihu"]');

  assert.equal(xhsButton.dataset.active, 'true');
  assert.equal(xhsPanel.hidden, false);
  assert.equal(zhihuPanel.hidden, true);

  zhihuButton.click();

  assert.equal(zhihuButton.dataset.active, 'true');
  assert.equal(xhsButton.dataset.active, 'false');
  assert.equal(zhihuPanel.hidden, false);
  assert.equal(xhsPanel.hidden, true);
  assert.equal(dom.window.localStorage.getItem('xhs-ui-collection-source'), 'zhihu');
});

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
  <div id="task-history-list"></div>
  <form id="config-form"></form>
  <p id="config-status"></p>
  <button id="config-reload"></button>
  <button id="config-save"></button>
  <input id="path-links-output" />
  <input id="path-links-images" />
  <input id="path-collection-output" />
  <input id="path-collection-raw" />
  <select id="browser-mode"><option value="isolated">isolated</option></select>
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

test('successful tasks are added to recent history and can restore the previous report', async () => {
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
          browserDetail: '未检测',
          platforms: {
            xiaohongshu: { state: 'unknown', label: '未检测' },
            zhihu: { state: 'unknown', label: '未检测' }
          }
        }
      });
    }
    if (String(url).includes('/api/save-collection')) {
      return createJsonResponse({
        ok: true,
        task: 'collection-export',
        report: {
          status: 'success',
          outputFolder: 'G:/output/小红书收藏',
          total: 3,
          successCount: 3,
          failureCount: 0,
          results: [
            { status: 'success', filepath: 'G:/output/小红书收藏/笔记 A.md' }
          ]
        }
      });
    }
    return createJsonResponse({});
  };

  require(appPath);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  document.getElementById('collection-submit').click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const historyList = document.getElementById('task-history-list');
  assert.match(historyList.textContent, /小红书收藏|收藏夹同步/);

  document.getElementById('result-output').textContent = '已清空';
  const restoreButton = historyList.querySelector('button');
  assert.ok(restoreButton);
  restoreButton.click();

  assert.match(document.getElementById('result-output').textContent, /小红书收藏|笔记 A/);
  assert.match(document.getElementById('status-text').textContent, /已恢复|最近任务/);
});

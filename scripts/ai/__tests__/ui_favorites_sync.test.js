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
  <button id="inbox-sync"></button>
  <button id="inbox-sync-all-top"></button>
  <button id="inbox-sync-latest"></button>
  <button id="inbox-sync-all"></button>
  <button id="inbox-save"></button>
  <select id="inbox-sync-range"><option value="10">10</option><option value="20">20</option></select>
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

test('zhihu favorites submit posts unified favorites payload to the ui api', async () => {
  const dom = buildDom();
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;

  const helpersPath = path.join(projectRoot, 'ui', 'ui_helpers.js');
  delete require.cache[helpersPath];
  const helpers = require(helpersPath);
  global.window.XhsUiHelpers = helpers;

  let capturedBody = null;
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
    if (String(url).includes('/api/save-zhihu-favorites')) {
      capturedBody = JSON.parse(init.body);
      return {
        ok: true,
        json: async () => ({
          ok: true,
          task: 'zhihu-favorites-export',
          report: {
            total: 1,
            successCount: 1,
            failureCount: 0,
            collectionTitle: 'AI 收藏夹',
            outputFolder: 'G:/output/知乎收藏夹/AI 收藏夹',
            results: [{ status: 'success', filepath: 'G:/output/知乎收藏夹/AI 收藏夹/文章.md' }]
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

  document.getElementById('zhihu-favorites-url').value = 'https://www.zhihu.com/collection/123456789';
  document.getElementById('zhihu-favorites-title').value = 'AI 收藏夹';
  document.getElementById('zhihu-favorites-limit').value = '30';
  document.getElementById('zhihu-favorites-submit').click();

  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.ok(capturedBody);
  assert.equal(capturedBody.collectionUrl, 'https://www.zhihu.com/collection/123456789');
  assert.equal(capturedBody.title, 'AI 收藏夹');
  assert.equal(capturedBody.limit, 30);
  assert.match(document.getElementById('status-text').textContent, /知乎收藏夹同步完成/);
});

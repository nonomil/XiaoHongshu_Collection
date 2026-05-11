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

test('result group can export one group link list through api', async () => {
  const dom = buildDom();
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;

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
    if (String(url).includes('/api/save-links-stream')) {
      return createJsonResponse({
        report: {
          total: 3,
          successCount: 3,
          failureCount: 0,
          results: [
            {
              status: 'success',
              filepath: 'G:/output/AI/Claude Code 入门.md',
              canonicalUrl: 'https://www.zhihu.com/question/1/answer/2',
              platform: 'zhihu',
              sourceType: 'zhihu_answer',
              warnings: []
            },
            {
              status: 'success',
              filepath: 'G:/output/AI/Chrome MCP 实测.md',
              input: 'https://mp.weixin.qq.com/s/abc123',
              platform: 'wechat',
              sourceType: 'wechat_article',
              warnings: []
            },
            {
              status: 'success',
              filepath: 'G:/output/工具/Playwright 技巧.md',
              navigationUrl: 'https://blog.csdn.net/test/article/details/123',
              platform: 'csdn',
              sourceType: 'csdn_article',
              warnings: []
            }
          ]
        }
      });
    }
    if (String(url).includes('/api/export-links-list')) {
      return createJsonResponse({
        ok: true,
        filePath: 'G:/output/_lists/20260321-AI-links.txt',
        count: 2,
        groupKey: 'AI'
      });
    }
    return createJsonResponse({});
  };

  require(appPath);

  const form = dom.window.document.getElementById('links-form');
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));

  await new Promise((resolve) => setTimeout(resolve, 0));

  const exportButton = dom.window.document.querySelector('[data-group-key="AI"] [data-group-action="export-links"]');
  assert.ok(exportButton);

  exportButton.click();

  await new Promise((resolve) => setTimeout(resolve, 0));

  const exportCall = calls.find((entry) => entry.url.includes('/api/export-links-list'));
  assert.ok(exportCall);
  const payload = JSON.parse(exportCall.init.body);
  assert.equal(payload.groupKey, 'AI');
  assert.match(dom.window.document.getElementById('status-text').textContent, /已导出 AI 2 条链接/);
});

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

test('link save summary surfaces login-gated comment warning for successful result', async () => {
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
      return createJsonResponse({ config: buildDefaultUiConfig() });
    }
    if (String(url).includes('/api/save-links-stream')) {
      return createJsonResponse({
        report: {
          total: 1,
          successCount: 1,
          failureCount: 0,
          results: [
            {
              status: 'success',
              filepath: 'G:/output/login-gated.md',
              warnings: [
                {
                  step: 'comments',
                  code: 'comment_login_required',
                  message: '评论剩余内容需要登录后查看。'
                }
              ]
            }
          ],
          warnings: [
            {
              step: 'comments',
              code: 'comment_login_required',
              message: '评论剩余内容需要登录后查看。'
            }
          ]
        }
      });
    }
    return createJsonResponse({});
  };

  const appPath = path.join(projectRoot, 'ui', 'app.js');
  delete require.cache[appPath];
  require(appPath);

  const form = dom.window.document.getElementById('links-form');
  const text = dom.window.document.getElementById('links-text');
  text.value = 'https://www.xiaohongshu.com/explore/login123';
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));

  await new Promise((resolve) => setTimeout(resolve, 0));

  const summaryText = dom.window.document.getElementById('result-summary').textContent;
  assert.match(summaryText, /登录/);
  assert.match(summaryText, /评论/);
});

test('link save summary shows platform label for article results', async () => {
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
      return createJsonResponse({ config: buildDefaultUiConfig() });
    }
    if (String(url).includes('/api/save-links-stream')) {
      return createJsonResponse({
        report: {
          total: 1,
          successCount: 1,
          failureCount: 0,
          results: [
            {
              status: 'success',
              filepath: 'G:/output/wechat-article.md',
              platform: 'wechat',
              sourceType: 'wechat_article',
              warnings: []
            }
          ]
        }
      });
    }
    return createJsonResponse({});
  };

  const appPath = path.join(projectRoot, 'ui', 'app.js');
  delete require.cache[appPath];
  require(appPath);

  const form = dom.window.document.getElementById('links-form');
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));

  await new Promise((resolve) => setTimeout(resolve, 0));

  const summaryText = dom.window.document.getElementById('result-summary').textContent;
  assert.match(summaryText, /公众号/);
});

test('link save summary surfaces note unavailable failure with short label', async () => {
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
      return createJsonResponse({ config: buildDefaultUiConfig() });
    }
    if (String(url).includes('/api/save-links-stream')) {
      return createJsonResponse({
        report: {
          total: 1,
          successCount: 0,
          failureCount: 1,
          results: [
            {
              status: 'failed',
              canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/abc123',
              error: '无法打开笔记详情页：当前笔记暂时无法浏览（error_code=300031）。'
            }
          ]
        }
      });
    }
    return createJsonResponse({});
  };

  const appPath = path.join(projectRoot, 'ui', 'app.js');
  delete require.cache[appPath];
  require(appPath);

  const form = dom.window.document.getElementById('links-form');
  const text = dom.window.document.getElementById('links-text');
  text.value = 'https://www.xiaohongshu.com/explore/abc123';
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));

  await new Promise((resolve) => setTimeout(resolve, 0));

  const summaryText = dom.window.document.getElementById('result-summary').textContent;
  assert.match(summaryText, /300031|暂时无法浏览|不可见/);
});

test('link save summary shows final collection for successful article results', async () => {
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
      return createJsonResponse({ config: buildDefaultUiConfig() });
    }
    if (String(url).includes('/api/save-links-stream')) {
      return createJsonResponse({
        report: {
          total: 1,
          successCount: 1,
          failureCount: 0,
          results: [
            {
              status: 'success',
              filepath: 'G:/output/工具/告别美工.md',
              platform: 'wechat',
              sourceType: 'wechat_article',
              warnings: []
            }
          ]
        }
      });
    }
    return createJsonResponse({});
  };

  const appPath = path.join(projectRoot, 'ui', 'app.js');
  delete require.cache[appPath];
  require(appPath);

  const form = dom.window.document.getElementById('links-form');
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));

  await new Promise((resolve) => setTimeout(resolve, 0));

  const summaryText = dom.window.document.getElementById('result-summary').textContent;
  assert.match(summaryText, /工具/);
});

test('result summary can filter warning rows and shows warning badge on affected group', async () => {
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
              filepath: 'G:/output/AI/with-warning.md',
              platform: 'wechat',
              sourceType: 'wechat_article',
              warnings: [
                {
                  step: 'comments',
                  code: 'comment_incomplete',
                  message: '评论未完整加载'
                }
              ]
            },
            {
              status: 'success',
              filepath: 'G:/output/AI/normal-item.md',
              platform: 'zhihu',
              sourceType: 'zhihu_article',
              warnings: []
            },
            {
              status: 'success',
              filepath: 'G:/output/工具/normal-item.md',
              platform: 'csdn',
              sourceType: 'csdn_article',
              warnings: []
            }
          ]
        }
      });
    }
    return createJsonResponse({});
  };

  const appPath = path.join(projectRoot, 'ui', 'app.js');
  delete require.cache[appPath];
  require(appPath);

  const form = dom.window.document.getElementById('links-form');
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));

  await new Promise((resolve) => setTimeout(resolve, 0));

  const warningsFilter = dom.window.document.querySelector('[data-filter-key="warnings"]');
  assert.ok(warningsFilter);
  assert.match(warningsFilter.textContent, /1/);

  const warningBadge = dom.window.document.querySelector('[data-group-key="AI"] .result-group-warning-count');
  assert.ok(warningBadge);
  assert.match(warningBadge.textContent, /提示/);
  assert.match(warningBadge.textContent, /1/);

  warningsFilter.dispatchEvent(new dom.window.Event('click', { bubbles: true }));

  const visibleGroups = Array.from(dom.window.document.querySelectorAll('[data-group-key]'))
    .filter((node) => !node.hidden)
    .map((node) => node.dataset.groupKey);
  assert.deepEqual(visibleGroups, ['AI']);

  const visibleRows = dom.window.document.querySelectorAll('[data-group-key="AI"] .result-row');
  assert.equal(visibleRows.length, 1);
  assert.match(visibleRows[0].textContent, /with-warning/);
});

test('config form binds auto classify toggle', async () => {
  const dom = buildDom();
  global.window = dom.window;
  global.document = dom.window.document;

  const helpersPath = path.join(projectRoot, 'ui', 'ui_helpers.js');
  delete require.cache[helpersPath];
  const helpers = require(helpersPath);
  global.window.XhsUiHelpers = helpers;

  let savedConfig = null;
  global.fetch = async (url, init) => {
    const isGet = !init || init.method === 'GET';
    if (String(url).includes('/api/ui-config') && isGet) {
      return createJsonResponse({
        config: {
          ...buildDefaultUiConfig(),
          runtime: {
            autoClassifyLinksEnabled: false,
            aiSummaryEnabled: true,
            visionOcrEnabled: true,
            ocrFallbackEnabled: true
          }
        }
      });
    }
    if (String(url).includes('/api/ui-config') && init && init.method === 'POST') {
      savedConfig = JSON.parse(init.body || '{}');
      return createJsonResponse({ ok: true, config: savedConfig.config });
    }
    return createJsonResponse({});
  };

  const appPath = path.join(projectRoot, 'ui', 'app.js');
  delete require.cache[appPath];
  require(appPath);

  await new Promise((resolve) => setTimeout(resolve, 0));

  const toggle = dom.window.document.getElementById('runtime-auto-classify');
  assert.equal(toggle.checked, false);

  toggle.checked = true;
  const form = dom.window.document.getElementById('config-form');
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));

  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(savedConfig.config.runtime.autoClassifyLinksEnabled, true);
});

test('result summary renders group filters and can switch visible group', async () => {
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
      return createJsonResponse({ config: buildDefaultUiConfig() });
    }
    if (String(url).includes('/api/save-links-stream')) {
      return createJsonResponse({
        report: {
          total: 3,
          successCount: 2,
          failureCount: 1,
          results: [
            {
              status: 'success',
              filepath: 'G:/output/AI/Claude Code 入门.md',
              platform: 'csdn',
              sourceType: 'csdn_article',
              warnings: []
            },
            {
              status: 'success',
              filepath: 'G:/output/工具/告别美工.md',
              platform: 'wechat',
              sourceType: 'wechat_article',
              warnings: []
            },
            {
              status: 'failed',
              canonicalUrl: 'https://example.com/fail',
              error: '无法打开页面'
            }
          ]
        }
      });
    }
    return createJsonResponse({});
  };

  const appPath = path.join(projectRoot, 'ui', 'app.js');
  delete require.cache[appPath];
  require(appPath);

  const form = dom.window.document.getElementById('links-form');
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));

  await new Promise((resolve) => setTimeout(resolve, 0));

  const allFilter = dom.window.document.querySelector('[data-filter-key="all"]');
  const aiFilter = dom.window.document.querySelector('[data-filter-key="AI"]');
  const toolFilter = dom.window.document.querySelector('[data-filter-key="工具"]');
  const failureFilter = dom.window.document.querySelector('[data-filter-key="failure"]');
  assert.ok(allFilter);
  assert.ok(aiFilter);
  assert.ok(toolFilter);
  assert.ok(failureFilter);

  const aiGroup = dom.window.document.querySelector('[data-group-key="AI"]');
  const toolGroup = dom.window.document.querySelector('[data-group-key="工具"]');
  const failureGroup = dom.window.document.querySelector('[data-group-key="failure"]');
  assert.ok(aiGroup);
  assert.ok(toolGroup);
  assert.ok(failureGroup);

  aiFilter.dispatchEvent(new dom.window.Event('click', { bubbles: true }));

  const visibleGroups = Array.from(dom.window.document.querySelectorAll('[data-group-key]'))
    .filter((node) => !node.hidden)
    .map((node) => node.dataset.groupKey);

  assert.deepEqual(visibleGroups, ['AI']);
});

test('result summary sorts failure first, success groups by size, and warning rows first inside a group', async () => {
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
      return createJsonResponse({ config: buildDefaultUiConfig() });
    }
    if (String(url).includes('/api/save-links-stream')) {
      return createJsonResponse({
        report: {
          total: 5,
          successCount: 4,
          failureCount: 1,
          results: [
            {
              status: 'success',
              filepath: 'G:/output/工具/无警告.md',
              platform: 'wechat',
              sourceType: 'wechat_article',
              warnings: []
            },
            {
              status: 'success',
              filepath: 'G:/output/AI/有警告.md',
              platform: 'csdn',
              sourceType: 'csdn_article',
              warnings: [
                {
                  step: 'comments',
                  code: 'comment_incomplete',
                  message: '评论未完整加载'
                }
              ]
            },
            {
              status: 'failed',
              canonicalUrl: 'https://example.com/fail',
              error: '无法打开页面'
            },
            {
              status: 'success',
              filepath: 'G:/output/AI/无警告2.md',
              platform: 'zhihu',
              sourceType: 'zhihu_article',
              warnings: []
            },
            {
              status: 'success',
              filepath: 'G:/output/AI/无警告3.md',
              platform: 'wechat',
              sourceType: 'wechat_article',
              warnings: []
            }
          ]
        }
      });
    }
    return createJsonResponse({});
  };

  const appPath = path.join(projectRoot, 'ui', 'app.js');
  delete require.cache[appPath];
  require(appPath);

  const form = dom.window.document.getElementById('links-form');
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));

  await new Promise((resolve) => setTimeout(resolve, 0));

  const groupKeys = Array.from(dom.window.document.querySelectorAll('[data-group-key]'))
    .map((node) => node.dataset.groupKey);
  assert.deepEqual(groupKeys, ['failure', 'AI', '工具']);

  const firstAiRow = dom.window.document.querySelector('[data-group-key="AI"] .result-row .result-title');
  assert.ok(firstAiRow);
  assert.match(firstAiRow.textContent, /有警告/);
});

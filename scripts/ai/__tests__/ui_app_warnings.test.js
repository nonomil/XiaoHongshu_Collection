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

function createDeferredJsonResponse() {
  let resolveResponse = null;
  const promise = new Promise((resolve) => {
    resolveResponse = (payload) => resolve(createJsonResponse(payload));
  });
  return {
    promise,
    resolve(payload) {
      resolveResponse(payload);
    }
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

test('link save summary surfaces comment diagnostics and manual handoff in result row', async () => {
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
              filepath: 'G:/output/AI/login-gated.md',
              warnings: [
                {
                  step: 'comments',
                  code: 'comment_login_required',
                  message: '评论剩余内容需要登录后查看。'
                }
              ],
              comment_warning_code: 'comment_login_required',
              comment_total: 86,
              comment_collected: 19,
              manual_action_required: true,
              manual_action_reason: 'login_required',
              comment_error: '当前网页端提示“登录查看全部评论内容”，请先在当前 Chrome 会话中登录后重试。'
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

  const row = dom.window.document.querySelector('.result-row');
  assert.ok(row);
  assert.match(row.textContent, /comment_login_required/);
  assert.match(row.textContent, /86/);
  assert.match(row.textContent, /19/);
  assert.match(row.textContent, /人工处理|登录后继续|登录门槛/);
});

test('login-gated result row shows next-step guidance before manual retry', async () => {
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
              filepath: 'G:/output/AI/login-gated-next-steps.md',
              canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/login-next-steps',
              warnings: [{ step: 'comments', code: 'comment_login_required', message: '需要登录' }],
              comment_warning_code: 'comment_login_required',
              comment_total: 42,
              comment_collected: 8,
              manual_action_required: true,
              manual_action_reason: 'login_required'
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

  const nextSteps = dom.window.document.querySelector('.result-row [data-result-next-steps="row"]');
  assert.ok(nextSteps);
  assert.match(nextSteps.textContent, /下一步建议/);
  assert.match(nextSteps.textContent, /一键修复/);
  assert.match(nextSteps.textContent, /项目登录浏览器/);
  assert.match(nextSteps.textContent, /处理后重试/);
});

test('manual handoff row shows browser orchestration run id and checkpoint details', async () => {
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
              canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/login123',
              error: '无登录信息或登录已失效，请重新登录',
              warnings: [{ step: 'comments', code: 'comment_login_required', message: '需要登录' }],
              manual_action_required: true,
              manual_action_reason: 'login_required',
              browser_orchestration: {
                run_id: 'note-save-ui-2026-04-06T120000000Z',
                status: 'need_human',
                state: 'expand_comments',
                checkpoint_path: 'G:/UserCode/XiaoHongshu_Collection/.cache/browser-task-checkpoints/note-save-ui-2026-04-06T120000000Z.json',
                warnings: [{ code: 'comment_login_required', message: '需要登录' }]
              }
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

  const row = dom.window.document.querySelector('.result-row');
  assert.ok(row);
  assert.match(row.textContent, /编排/);
  assert.match(row.textContent, /expand_comments/);
  assert.match(row.textContent, /运行 ID/);
  assert.match(row.textContent, /note-save-ui-2026-04-06T120000000Z/);
  assert.match(row.textContent, /检查点/);
});

test('manual handoff row exposes continue action and refreshes the report after resume', async () => {
  const dom = buildDom();
  global.window = dom.window;
  global.document = dom.window.document;

  const helpersPath = path.join(projectRoot, 'ui', 'ui_helpers.js');
  delete require.cache[helpersPath];
  const helpers = require(helpersPath);
  global.window.XhsUiHelpers = helpers;

  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({
      url: String(url),
      init: init || {},
      body: init?.body ? JSON.parse(init.body) : null
    });
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
              canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/login123',
              error: '无登录信息或登录已失效，请重新登录',
              warnings: [{ step: 'comments', code: 'comment_login_required', message: '需要登录' }],
              manual_action_required: true,
              manual_action_reason: 'login_required',
              browser_orchestration: {
                run_id: 'note-save-ui-2026-04-06T120000000Z',
                status: 'need_human',
                state: 'expand_comments',
                checkpoint_path: 'G:/UserCode/XiaoHongshu_Collection/.cache/browser-task-checkpoints/note-save-ui-2026-04-06T120000000Z.json',
                warnings: [{ code: 'comment_login_required', message: '需要登录' }]
              }
            }
          ]
        }
      });
    }
    if (String(url).includes('/api/save-links-resume')) {
      return createJsonResponse({
        task: 'note-save',
        report: {
          total: 1,
          successCount: 1,
          failureCount: 0,
          results: [
            {
              status: 'success',
              filepath: 'G:/output/AI/login123.md',
              canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/login123',
              browser_orchestration: {
                run_id: 'note-save-ui-2026-04-06T120000000Z',
                status: 'done',
                state: 'validate_result',
                warnings: []
              }
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

  const resumeButton = dom.window.document.querySelector('[data-result-action="resume_result_item"]');
  assert.ok(resumeButton);

  resumeButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  const resumeCall = calls.find((entry) => entry.url.includes('/api/save-links-resume'));
  assert.ok(resumeCall);
  assert.equal(resumeCall.body.runId, 'note-save-ui-2026-04-06T120000000Z');
  assert.match(dom.window.document.querySelector('.result-row').textContent, /login123\.md/);
  assert.match(dom.window.document.getElementById('status-text').textContent, /继续执行完成/);
});

test('manual handoff row exposes refresh and retry actions', async () => {
  const dom = buildDom();
  global.window = dom.window;
  global.document = dom.window.document;

  const helpersPath = path.join(projectRoot, 'ui', 'ui_helpers.js');
  delete require.cache[helpersPath];
  const helpers = require(helpersPath);
  global.window.XhsUiHelpers = helpers;

  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), init: init || {} });
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
              filepath: 'G:/output/AI/login-gated.md',
              canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/login123',
              warnings: [
                {
                  step: 'comments',
                  code: 'comment_login_required',
                  message: '评论剩余内容需要登录后查看。'
                }
              ],
              comment_warning_code: 'comment_login_required',
              comment_total: 86,
              comment_collected: 19,
              manual_action_required: true,
              manual_action_reason: 'login_required',
              comment_error: '当前网页端提示“登录查看全部评论内容”，请先在当前 Chrome 会话中登录后重试。'
            }
          ]
        }
      });
    }
    if (String(url).includes('/api/browser/status')) {
      return createJsonResponse({
        status: {
          connected: true,
          browserLabel: '项目浏览器',
          browserDetail: '已完成重新检测',
          platforms: {
            xiaohongshu: { state: 'alive', label: '已登录' },
            zhihu: { state: 'unknown', label: '未检测' }
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

  const appPath = path.join(projectRoot, 'ui', 'app.js');
  delete require.cache[appPath];
  require(appPath);

  const form = dom.window.document.getElementById('links-form');
  const text = dom.window.document.getElementById('links-text');
  text.value = 'https://www.xiaohongshu.com/explore/login123';
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));

  await new Promise((resolve) => setTimeout(resolve, 0));

  const refreshButton = dom.window.document.querySelector('[data-result-action="refresh_browser_status"]');
  const retryButton = dom.window.document.querySelector('[data-result-action="retry_result_item"]');
  const analyzeButton = dom.window.document.querySelector('[data-result-action="analyze_result_item"]');
  const repairButton = dom.window.document.querySelector('[data-result-action="repair_manual_session"]');
  assert.ok(analyzeButton);
  assert.ok(repairButton);
  assert.ok(refreshButton);
  assert.ok(retryButton);

  refreshButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(calls.some((entry) => entry.url.includes('/api/browser/status')), true);
  assert.match(dom.window.document.getElementById('status-text').textContent, /浏览器状态已刷新|已完成重新检测/);

  retryButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  const saveCalls = calls.filter((entry) => entry.url.includes('/api/save-links-stream'));
  assert.equal(saveCalls.length >= 2, true);
  assert.match(dom.window.document.getElementById('links-text').value, /login123/);
});

test('manual handoff row shows inline refresh status while browser check is running', async () => {
  const dom = buildDom();
  global.window = dom.window;
  global.document = dom.window.document;

  const helpersPath = path.join(projectRoot, 'ui', 'ui_helpers.js');
  delete require.cache[helpersPath];
  const helpers = require(helpersPath);
  global.window.XhsUiHelpers = helpers;

  const deferredStatus = createDeferredJsonResponse();
  let browserStatusCallCount = 0;
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
              filepath: 'G:/output/AI/login-gated.md',
              canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/login123',
              warnings: [{ step: 'comments', code: 'comment_login_required', message: '需要登录' }],
              comment_warning_code: 'comment_login_required',
              manual_action_required: true,
              manual_action_reason: 'login_required'
            }
          ]
        }
      });
    }
    if (String(url).includes('/api/browser/status')) {
      browserStatusCallCount += 1;
      if (browserStatusCallCount === 1) {
        return createJsonResponse({
          status: {
            connected: false,
            browserLabel: '未连接浏览器',
            browserDetail: '未检测到会话',
            platforms: {
              xiaohongshu: { state: 'unknown', label: '未检测' },
              zhihu: { state: 'unknown', label: '未检测' }
            },
            tabs: {}
          }
        });
      }
      return deferredStatus.promise;
    }
    return createJsonResponse({});
  };

  const appPath = path.join(projectRoot, 'ui', 'app.js');
  delete require.cache[appPath];
  require(appPath);

  const form = dom.window.document.getElementById('links-form');
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));

  const refreshButton = dom.window.document.querySelector('[data-result-action="refresh_browser_status"]');
  assert.ok(refreshButton);
  refreshButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const runningStatus = dom.window.document.querySelector('[data-result-action-status]');
  assert.ok(runningStatus);
  assert.match(runningStatus.textContent, /正在重新检测/);

  deferredStatus.resolve({
    status: {
      connected: true,
      browserLabel: '项目浏览器',
      browserDetail: '已完成重新检测',
      platforms: {
        xiaohongshu: { state: 'alive', label: '已登录' },
        zhihu: { state: 'unknown', label: '未检测' }
      },
      tabs: {
        xiaohongshu: true,
        zhihu: false
      }
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  const finishedStatus = dom.window.document.querySelector('[data-result-action-status]');
  assert.ok(finishedStatus);
  assert.match(finishedStatus.textContent, /已重新检测/);
});

test('analyze action shows inline diagnosis for login gate result', async () => {
  const dom = buildDom();
  global.window = dom.window;
  global.document = dom.window.document;

  const helpersPath = path.join(projectRoot, 'ui', 'ui_helpers.js');
  delete require.cache[helpersPath];
  const helpers = require(helpersPath);
  global.window.XhsUiHelpers = helpers;

  let browserStatusCallCount = 0;
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
              filepath: 'G:/output/AI/login-gated.md',
              canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/login123',
              warnings: [{ step: 'comments', code: 'comment_login_required', message: '需要登录' }],
              comment_warning_code: 'comment_login_required',
              manual_action_required: true,
              manual_action_reason: 'login_required'
            }
          ]
        }
      });
    }
    if (String(url).includes('/api/browser/status')) {
      browserStatusCallCount += 1;
      return createJsonResponse({
        status: {
          connected: true,
          browserLabel: '项目浏览器',
          browserDetail: browserStatusCallCount > 1 ? '分析完成' : '初始化检测',
          platforms: {
            xiaohongshu: { state: 'unknown', label: '未登录' },
            zhihu: { state: 'unknown', label: '未检测' }
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

  const appPath = path.join(projectRoot, 'ui', 'app.js');
  delete require.cache[appPath];
  require(appPath);

  const form = dom.window.document.getElementById('links-form');
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));

  const analyzeButton = dom.window.document.querySelector('[data-result-action="analyze_result_item"]');
  assert.ok(analyzeButton);
  analyzeButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  const analysisStatus = dom.window.document.querySelector('[data-result-action-status]');
  assert.ok(analysisStatus);
  assert.match(analysisStatus.textContent, /分析完成/);
  assert.match(analysisStatus.textContent, /未登录|一键修复|打开项目登录浏览器/);
});

test('filtered results expose bulk analyze and repair actions', async () => {
  const dom = buildDom();
  global.window = dom.window;
  global.document = dom.window.document;

  const helpersPath = path.join(projectRoot, 'ui', 'ui_helpers.js');
  delete require.cache[helpersPath];
  const helpers = require(helpersPath);
  global.window.XhsUiHelpers = helpers;

  const calls = [];
  let browserStatusCallCount = 0;
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
              filepath: 'G:/output/AI/login-gated-a.md',
              canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/login-a',
              warnings: [{ step: 'comments', code: 'comment_login_required', message: '需要登录' }],
              comment_warning_code: 'comment_login_required',
              manual_action_required: true,
              manual_action_reason: 'login_required'
            },
            {
              status: 'success',
              filepath: 'G:/output/AI/login-gated-b.md',
              canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/login-b',
              warnings: [{ step: 'comments', code: 'comment_login_required', message: '需要登录' }],
              comment_warning_code: 'comment_login_required',
              manual_action_required: true,
              manual_action_reason: 'login_required'
            },
            {
              status: 'success',
              filepath: 'G:/output/AI/normal.md',
              canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/normal',
              warnings: []
            }
          ]
        }
      });
    }
    if (String(url).includes('/api/browser/status')) {
      browserStatusCallCount += 1;
      const hasLogin = browserStatusCallCount >= 3;
      return createJsonResponse({
        status: {
          connected: true,
          browserLabel: '项目浏览器',
          browserDetail: hasLogin ? '已检测到登录态' : '浏览器已连接但尚未登录',
          platforms: {
            xiaohongshu: { state: hasLogin ? 'alive' : 'unknown', label: hasLogin ? '已登录' : '未登录' },
            zhihu: { state: 'unknown', label: '未检测' }
          },
          tabs: {
            xiaohongshu: true,
            zhihu: false
          }
        }
      });
    }
    if (String(url).includes('/api/browser/login')) {
      return createJsonResponse({
        profileDir: 'G:/UserCode/XiaoHongshu_Collection/.cache/chrome-debug'
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

  const warningFilterButton = dom.window.document.querySelector('[data-warning-code="comment_login_required"]');
  assert.ok(warningFilterButton);
  warningFilterButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const bulkAnalyzeButton = dom.window.document.querySelector('[data-result-bulk-action="analyze_visible_results"]');
  const bulkRepairButton = dom.window.document.querySelector('[data-result-bulk-action="repair_visible_results"]');
  assert.ok(bulkAnalyzeButton);
  assert.ok(bulkRepairButton);

  bulkAnalyzeButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  const analysisStatuses = Array.from(dom.window.document.querySelectorAll('[data-result-action-status]'))
    .map((node) => node.textContent);
  assert.equal(analysisStatuses.filter((text) => /分析完成/.test(text)).length, 2);
  assert.match(dom.window.document.getElementById('status-text').textContent, /已完成批量分析 2 条结果/);

  bulkRepairButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  const repairStatuses = Array.from(dom.window.document.querySelectorAll('[data-result-action-status]'))
    .map((node) => node.textContent);
  assert.equal(calls.filter((entry) => entry.url.includes('/api/browser/login')).length, 1);
  assert.equal(repairStatuses.filter((text) => /已打开项目登录浏览器/.test(text)).length, 2);
  assert.match(dom.window.document.getElementById('status-text').textContent, /已完成批量修复 2 条结果/);
});

test('filtered warning results show bulk next-step guidance for current visible items', async () => {
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
              filepath: 'G:/output/AI/login-guidance-a.md',
              canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/login-guidance-a',
              warnings: [{ step: 'comments', code: 'comment_login_required', message: '需要登录' }],
              comment_warning_code: 'comment_login_required',
              manual_action_required: true,
              manual_action_reason: 'login_required'
            },
            {
              status: 'success',
              filepath: 'G:/output/AI/login-guidance-b.md',
              canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/login-guidance-b',
              warnings: [{ step: 'comments', code: 'comment_login_required', message: '需要登录' }],
              comment_warning_code: 'comment_login_required',
              manual_action_required: true,
              manual_action_reason: 'login_required'
            },
            {
              status: 'success',
              filepath: 'G:/output/AI/normal-guidance.md',
              canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/normal-guidance',
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

  const warningFilterButton = dom.window.document.querySelector('[data-warning-code="comment_login_required"]');
  assert.ok(warningFilterButton);
  warningFilterButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const bulkGuidance = dom.window.document.querySelector('.result-bulk-actions [data-result-next-steps="bulk"]');
  assert.ok(bulkGuidance);
  assert.match(bulkGuidance.textContent, /当前建议路径/);
  assert.match(bulkGuidance.textContent, /登录门槛”有 2 条|登录门槛 2 条|需要登录 2 条/);
  assert.match(bulkGuidance.textContent, /项目登录浏览器/);
  assert.match(bulkGuidance.textContent, /处理后重试当前 2 条|处理后重试/);
});

test('filtered results can bulk retry only current visible items', async () => {
  const dom = buildDom();
  global.window = dom.window;
  global.document = dom.window.document;

  const helpersPath = path.join(projectRoot, 'ui', 'ui_helpers.js');
  delete require.cache[helpersPath];
  const helpers = require(helpersPath);
  global.window.XhsUiHelpers = helpers;

  const saveRequests = [];
  global.fetch = async (url, init) => {
    const isGet = !init || init.method === 'GET';
    if (String(url).includes('/api/ui-config') && isGet) {
      return createJsonResponse({ config: buildDefaultUiConfig() });
    }
    if (String(url).includes('/api/save-links-stream')) {
      saveRequests.push(JSON.parse(init?.body || '{}'));
      if (saveRequests.length === 1) {
        return createJsonResponse({
          report: {
            total: 3,
            successCount: 3,
            failureCount: 0,
            results: [
              {
                status: 'success',
                filepath: 'G:/output/AI/login-gated-a.md',
                canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/login-a',
                warnings: [{ step: 'comments', code: 'comment_login_required', message: '需要登录' }],
                comment_warning_code: 'comment_login_required',
                manual_action_required: true,
                manual_action_reason: 'login_required'
              },
              {
                status: 'success',
                filepath: 'G:/output/AI/login-gated-b.md',
                canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/login-b',
                warnings: [{ step: 'comments', code: 'comment_login_required', message: '需要登录' }],
                comment_warning_code: 'comment_login_required',
                manual_action_required: true,
                manual_action_reason: 'login_required'
              },
              {
                status: 'success',
                filepath: 'G:/output/AI/normal.md',
                canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/normal',
                warnings: []
              }
            ]
          }
        });
      }
      return createJsonResponse({
        report: {
          total: 2,
          successCount: 2,
          failureCount: 0,
          results: [
            {
              status: 'success',
              filepath: 'G:/output/AI/login-gated-a.md',
              canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/login-a',
              warnings: []
            },
            {
              status: 'success',
              filepath: 'G:/output/AI/login-gated-b.md',
              canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/login-b',
              warnings: []
            }
          ]
        }
      });
    }
    if (String(url).includes('/api/browser/status')) {
      return createJsonResponse({
        status: {
          connected: true,
          browserLabel: '项目浏览器',
          browserDetail: '已检测到登录态',
          platforms: {
            xiaohongshu: { state: 'alive', label: '已登录' },
            zhihu: { state: 'unknown', label: '未检测' }
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

  const appPath = path.join(projectRoot, 'ui', 'app.js');
  delete require.cache[appPath];
  require(appPath);

  const form = dom.window.document.getElementById('links-form');
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));

  const warningFilterButton = dom.window.document.querySelector('[data-warning-code="comment_login_required"]');
  assert.ok(warningFilterButton);
  warningFilterButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const bulkRetryButton = dom.window.document.querySelector('[data-result-bulk-action="retry_visible_results"]');
  assert.ok(bulkRetryButton);
  bulkRetryButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(saveRequests.length, 2);
  assert.match(saveRequests[1].text, /login-a/);
  assert.match(saveRequests[1].text, /login-b/);
  assert.doesNotMatch(saveRequests[1].text, /normal/);
  assert.match(dom.window.document.getElementById('links-text').value, /login-a/);
  assert.match(dom.window.document.getElementById('links-text').value, /login-b/);
  assert.doesNotMatch(dom.window.document.getElementById('links-text').value, /normal/);
});

test('result head retry button follows anomaly scope and current filters', async () => {
  const dom = buildDom();
  global.window = dom.window;
  global.document = dom.window.document;

  const helpersPath = path.join(projectRoot, 'ui', 'ui_helpers.js');
  delete require.cache[helpersPath];
  const helpers = require(helpersPath);
  global.window.XhsUiHelpers = helpers;

  const saveRequests = [];
  global.fetch = async (url, init) => {
    const isGet = !init || init.method === 'GET';
    if (String(url).includes('/api/ui-config') && isGet) {
      return createJsonResponse({ config: buildDefaultUiConfig() });
    }
    if (String(url).includes('/api/save-links-stream')) {
      saveRequests.push(JSON.parse(init?.body || '{}'));
      if (saveRequests.length === 1) {
        return createJsonResponse({
          report: {
            total: 3,
            successCount: 2,
            failureCount: 1,
            results: [
              {
                status: 'success',
                filepath: 'G:/output/AI/login-gated-a.md',
                canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/login-a',
                warnings: [{ step: 'comments', code: 'comment_login_required', message: '需要登录' }],
                comment_warning_code: 'comment_login_required',
                manual_action_required: true,
                manual_action_reason: 'login_required'
              },
              {
                status: 'failed',
                canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/fail-a',
                error: 'Chrome remote debugging is not available on port 9222.'
              },
              {
                status: 'success',
                filepath: 'G:/output/AI/normal.md',
                canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/normal',
                warnings: []
              }
            ]
          }
        });
      }
      return createJsonResponse({
        report: {
          total: 2,
          successCount: 2,
          failureCount: 0,
          results: [
            {
              status: 'success',
              filepath: 'G:/output/AI/login-gated-a.md',
              canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/login-a',
              warnings: []
            },
            {
              status: 'success',
              filepath: 'G:/output/AI/fail-a.md',
              canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/fail-a',
              warnings: []
            }
          ]
        }
      });
    }
    if (String(url).includes('/api/browser/status')) {
      return createJsonResponse({
        status: {
          connected: true,
          browserLabel: '项目浏览器',
          browserDetail: '已检测到登录态',
          platforms: {
            xiaohongshu: { state: 'alive', label: '已登录' },
            zhihu: { state: 'unknown', label: '未检测' }
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

  const appPath = path.join(projectRoot, 'ui', 'app.js');
  delete require.cache[appPath];
  require(appPath);

  const form = dom.window.document.getElementById('links-form');
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));

  const retryButton = dom.window.document.getElementById('retry-failed-results');
  assert.ok(retryButton);
  assert.match(retryButton.textContent, /重试异常项 2 条/);
  assert.equal(retryButton.disabled, false);

  const warningFilterButton = dom.window.document.querySelector('[data-warning-code="comment_login_required"]');
  assert.ok(warningFilterButton);
  warningFilterButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.match(retryButton.textContent, /重试当前筛选 1 条/);
  retryButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(saveRequests.length, 2);
  assert.match(saveRequests[1].text, /login-a/);
  assert.doesNotMatch(saveRequests[1].text, /fail-a/);
  assert.doesNotMatch(saveRequests[1].text, /normal/);
});

test('result head retry button keeps failed label when only failures are retryable', async () => {
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
          successCount: 1,
          failureCount: 2,
          results: [
            {
              status: 'failed',
              canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/fail-a',
              error: 'mock failure A'
            },
            {
              status: 'failed',
              canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/fail-b',
              error: 'mock failure B'
            },
            {
              status: 'success',
              filepath: 'G:/output/AI/normal.md',
              canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/normal',
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

  const retryButton = dom.window.document.getElementById('retry-failed-results');
  assert.ok(retryButton);
  assert.match(retryButton.textContent, /重试失败项 2 条/);
  assert.equal(retryButton.disabled, false);
});

test('browser connection filter bulk repair switches isolated browser once', async () => {
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
      return createJsonResponse({ config: defaultConfig });
    }
    if (String(url).includes('/api/save-links-stream')) {
      return createJsonResponse({
        report: {
          total: 3,
          successCount: 1,
          failureCount: 2,
          results: [
            {
              status: 'failed',
              canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/browser-a',
              error: 'Chrome remote debugging is not available on port 9222.'
            },
            {
              status: 'failed',
              canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/browser-b',
              error: 'Chrome remote debugging is not available on port 9222.'
            },
            {
              status: 'success',
              filepath: 'G:/output/AI/login-gated.md',
              canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/login123',
              warnings: [{ step: 'comments', code: 'comment_login_required', message: '需要登录' }],
              comment_warning_code: 'comment_login_required',
              manual_action_required: true,
              manual_action_reason: 'login_required'
            }
          ]
        }
      });
    }
    if (String(url).includes('/api/ui-config') && init && init.method === 'POST') {
      const payload = JSON.parse(init.body || '{}');
      return createJsonResponse({ config: payload.config });
    }
    if (String(url).includes('/api/browser/login')) {
      return createJsonResponse({
        profileDir: 'G:/UserCode/XiaoHongshu_Collection/.cache/chrome-debug'
      });
    }
    if (String(url).includes('/api/browser/status')) {
      return createJsonResponse({
        status: {
          connected: true,
          browserLabel: '项目浏览器',
          browserDetail: '已切换到隔离浏览器并连接成功',
          platforms: {
            xiaohongshu: { state: 'alive', label: '已登录' },
            zhihu: { state: 'unknown', label: '未检测' }
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

  const appPath = path.join(projectRoot, 'ui', 'app.js');
  delete require.cache[appPath];
  require(appPath);

  const form = dom.window.document.getElementById('links-form');
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));

  const stageFilterButton = dom.window.document.querySelector('[data-failure-stage="浏览器接入"]');
  assert.ok(stageFilterButton);
  stageFilterButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const bulkRepairButton = dom.window.document.querySelector('[data-result-bulk-action="repair_visible_results"]');
  assert.ok(bulkRepairButton);
  bulkRepairButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  const configSaveCall = calls.find((entry) => entry.url.includes('/api/ui-config') && entry.init.method === 'POST');
  assert.ok(configSaveCall);
  const savedConfig = JSON.parse(configSaveCall.init.body || '{}').config;
  assert.equal(savedConfig.browser.mode, 'isolated');
  assert.equal(calls.filter((entry) => entry.url.includes('/api/browser/login')).length, 1);
  assert.match(dom.window.document.getElementById('status-text').textContent, /已完成批量修复 2 条结果/);

  const repairStatuses = Array.from(dom.window.document.querySelectorAll('[data-result-action-status]'))
    .map((node) => node.textContent);
  assert.equal(repairStatuses.filter((text) => /已切换到隔离浏览器/.test(text)).length, 2);
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
  assert.match(summaryText, /详情页|打开详情页/);
});

test('link save summary surfaces layered stage for browser connection failures', async () => {
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
              error: 'Chrome remote debugging is not available on port 9222.'
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
  assert.match(summaryText, /浏览器接入/);
});

test('failed browser connection row exposes repair actions', async () => {
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
      return createJsonResponse({ config: defaultConfig });
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
              error: 'Chrome remote debugging is not available on port 9222.'
            }
          ]
        }
      });
    }
    if (String(url).includes('/api/ui-config') && init && init.method === 'POST') {
      const payload = JSON.parse(init.body || '{}');
      return createJsonResponse({ config: payload.config });
    }
    if (String(url).includes('/api/browser/login')) {
      return createJsonResponse({
        profileDir: 'G:/UserCode/XiaoHongshu_Collection/.cache/chrome-debug'
      });
    }
    if (String(url).includes('/api/browser/status')) {
      return createJsonResponse({
        status: {
          connected: true,
          browserLabel: '项目浏览器',
          browserDetail: '已切换到项目浏览器并连接成功',
          platforms: {
            xiaohongshu: { state: 'alive', label: '已登录' },
            zhihu: { state: 'unknown', label: '未检测' }
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

  const appPath = path.join(projectRoot, 'ui', 'app.js');
  delete require.cache[appPath];
  require(appPath);

  const form = dom.window.document.getElementById('links-form');
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));

  await new Promise((resolve) => setTimeout(resolve, 0));

  const repairButton = dom.window.document.querySelector('[data-result-action="repair_browser_session"]');
  const refreshButton = dom.window.document.querySelector('[data-result-action="refresh_browser_status"]');
  assert.ok(repairButton);
  assert.ok(refreshButton);

  repairButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  const saveCall = calls.find((entry) => entry.url.includes('/api/ui-config') && entry.init.method === 'POST');
  assert.ok(saveCall);
  const savedPayload = JSON.parse(saveCall.init.body);
  assert.equal(savedPayload.config.browser.mode, 'isolated');
  assert.equal(calls.some((entry) => entry.url.includes('/api/browser/login')), true);
});

test('repair action shows inline status while switching to isolated browser', async () => {
  const dom = buildDom();
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.localStorage = dom.window.localStorage;

  const helpersPath = path.join(projectRoot, 'ui', 'ui_helpers.js');
  delete require.cache[helpersPath];
  const helpers = require(helpersPath);
  global.window.XhsUiHelpers = helpers;

  const deferredLogin = createDeferredJsonResponse();
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
  let browserStatusCallCount = 0;

  global.fetch = async (url, init) => {
    const isGet = !init || init.method === 'GET';
    if (String(url).includes('/api/ui-config') && isGet) {
      return createJsonResponse({ config: defaultConfig });
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
              error: 'Chrome remote debugging is not available on port 9222.'
            }
          ]
        }
      });
    }
    if (String(url).includes('/api/ui-config') && init && init.method === 'POST') {
      const payload = JSON.parse(init.body || '{}');
      return createJsonResponse({ config: payload.config });
    }
    if (String(url).includes('/api/browser/login')) {
      return deferredLogin.promise;
    }
    if (String(url).includes('/api/browser/status')) {
      browserStatusCallCount += 1;
      return createJsonResponse({
        status: {
          connected: browserStatusCallCount > 1,
          browserLabel: browserStatusCallCount > 1 ? '项目浏览器' : '未连接浏览器',
          browserDetail: browserStatusCallCount > 1 ? '已切换到项目浏览器并连接成功' : '未检测到会话',
          platforms: {
            xiaohongshu: { state: browserStatusCallCount > 1 ? 'alive' : 'unknown', label: browserStatusCallCount > 1 ? '已登录' : '未检测' },
            zhihu: { state: 'unknown', label: '未检测' }
          },
          tabs: browserStatusCallCount > 1 ? { xiaohongshu: true, zhihu: false } : {}
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

  const repairButton = dom.window.document.querySelector('[data-result-action="repair_browser_session"]');
  assert.ok(repairButton);
  repairButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const runningStatus = dom.window.document.querySelector('[data-result-action-status]');
  assert.ok(runningStatus);
  assert.match(runningStatus.textContent, /正在切换到隔离浏览器|正在打开项目登录浏览器/);

  deferredLogin.resolve({
    profileDir: 'G:/UserCode/XiaoHongshu_Collection/.cache/chrome-debug'
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  const finishedStatus = dom.window.document.querySelector('[data-result-action-status]');
  assert.ok(finishedStatus);
  assert.match(finishedStatus.textContent, /已切换到隔离浏览器/);
});

test('failed login gate row exposes retry action', async () => {
  const dom = buildDom();
  global.window = dom.window;
  global.document = dom.window.document;

  const helpersPath = path.join(projectRoot, 'ui', 'ui_helpers.js');
  delete require.cache[helpersPath];
  const helpers = require(helpersPath);
  global.window.XhsUiHelpers = helpers;

  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), init: init || {} });
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
              canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/login123',
              error: '当前网页端提示“登录查看全部评论内容”，请先在当前 Chrome 会话中登录后重试。'
            }
          ]
        }
      });
    }
    if (String(url).includes('/api/browser/status')) {
      return createJsonResponse({
        status: {
          connected: true,
          browserLabel: '项目浏览器',
          browserDetail: '已刷新',
          platforms: {
            xiaohongshu: { state: 'alive', label: '已登录' },
            zhihu: { state: 'unknown', label: '未检测' }
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

  const appPath = path.join(projectRoot, 'ui', 'app.js');
  delete require.cache[appPath];
  require(appPath);

  const form = dom.window.document.getElementById('links-form');
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));

  await new Promise((resolve) => setTimeout(resolve, 0));

  const retryButton = dom.window.document.querySelector('[data-result-action="retry_result_item"]');
  const refreshButton = dom.window.document.querySelector('[data-result-action="refresh_browser_status"]');
  const analyzeButton = dom.window.document.querySelector('[data-result-action="analyze_result_item"]');
  const repairButton = dom.window.document.querySelector('[data-result-action="repair_manual_session"]');
  assert.ok(analyzeButton);
  assert.ok(repairButton);
  assert.ok(retryButton);
  assert.ok(refreshButton);

  retryButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  const saveCalls = calls.filter((entry) => entry.url.includes('/api/save-links-stream'));
  assert.equal(saveCalls.length >= 2, true);
  assert.match(dom.window.document.getElementById('links-text').value, /login123/);
});

test('repair action opens login browser for login gate result and updates inline guidance', async () => {
  const dom = buildDom();
  global.window = dom.window;
  global.document = dom.window.document;

  const helpersPath = path.join(projectRoot, 'ui', 'ui_helpers.js');
  delete require.cache[helpersPath];
  const helpers = require(helpersPath);
  global.window.XhsUiHelpers = helpers;

  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), init: init || {} });
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
              filepath: 'G:/output/AI/login-gated.md',
              canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/login123',
              warnings: [{ step: 'comments', code: 'comment_login_required', message: '需要登录' }],
              comment_warning_code: 'comment_login_required',
              manual_action_required: true,
              manual_action_reason: 'login_required'
            }
          ]
        }
      });
    }
    if (String(url).includes('/api/browser/login')) {
      return createJsonResponse({
        profileDir: 'G:/UserCode/XiaoHongshu_Collection/.cache/chrome-debug'
      });
    }
    if (String(url).includes('/api/browser/status')) {
      return createJsonResponse({
        status: {
          connected: true,
          browserLabel: '项目浏览器',
          browserDetail: '已刷新',
          platforms: {
            xiaohongshu: { state: 'unknown', label: '未登录' },
            zhihu: { state: 'unknown', label: '未检测' }
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

  const appPath = path.join(projectRoot, 'ui', 'app.js');
  delete require.cache[appPath];
  require(appPath);

  const form = dom.window.document.getElementById('links-form');
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));

  const repairButton = dom.window.document.querySelector('[data-result-action="repair_manual_session"]');
  assert.ok(repairButton);
  repairButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(calls.some((entry) => entry.url.includes('/api/browser/login')), true);
  assert.equal(calls.filter((entry) => entry.url.includes('/api/browser/status')).length >= 2, true);

  const repairStatus = dom.window.document.querySelector('[data-result-action-status]');
  assert.ok(repairStatus);
  assert.match(repairStatus.textContent, /已打开项目登录浏览器/);
  assert.match(repairStatus.textContent, /登录|处理后重试/);
});

test('retry action shows inline handoff status before save returns', async () => {
  const dom = buildDom();
  global.window = dom.window;
  global.document = dom.window.document;

  const helpersPath = path.join(projectRoot, 'ui', 'ui_helpers.js');
  delete require.cache[helpersPath];
  const helpers = require(helpersPath);
  global.window.XhsUiHelpers = helpers;

  const deferredRetry = createDeferredJsonResponse();
  let saveLinksCallCount = 0;
  global.fetch = async (url, init) => {
    const isGet = !init || init.method === 'GET';
    if (String(url).includes('/api/ui-config') && isGet) {
      return createJsonResponse({ config: buildDefaultUiConfig() });
    }
    if (String(url).includes('/api/save-links-stream')) {
      saveLinksCallCount += 1;
      if (saveLinksCallCount === 1) {
        return createJsonResponse({
          report: {
            total: 1,
            successCount: 0,
            failureCount: 1,
            results: [
              {
                status: 'failed',
                canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/login123',
                error: '当前网页端提示“登录查看全部评论内容”，请先在当前 Chrome 会话中登录后重试。'
              }
            ]
          }
        });
      }
      return deferredRetry.promise;
    }
    return createJsonResponse({});
  };

  const appPath = path.join(projectRoot, 'ui', 'app.js');
  delete require.cache[appPath];
  require(appPath);

  const form = dom.window.document.getElementById('links-form');
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));

  const retryButton = dom.window.document.querySelector('[data-result-action="retry_result_item"]');
  assert.ok(retryButton);
  retryButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const runningStatus = dom.window.document.querySelector('[data-result-action-status]');
  assert.ok(runningStatus);
  assert.match(runningStatus.textContent, /已回填当前结果.*正在重试|正在重试当前结果/);
  assert.match(dom.window.document.getElementById('links-text').value, /login123/);

  deferredRetry.resolve({
    report: {
      total: 1,
      successCount: 1,
      failureCount: 0,
      results: [
        {
          status: 'success',
          filepath: 'G:/output/AI/login123.md',
          canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/login123',
          warnings: []
        }
      ]
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
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

test('result summary aggregates warning codes into a top card', async () => {
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
              filepath: 'G:/output/AI/login-gated.md',
              warnings: [{ step: 'comments', code: 'comment_login_required', message: '需要登录' }],
              comment_warning_code: 'comment_login_required'
            },
            {
              status: 'success',
              filepath: 'G:/output/AI/incomplete-a.md',
              warnings: [{ step: 'comments', code: 'comment_incomplete', message: '未抓全' }],
              comment_warning_code: 'comment_incomplete'
            },
            {
              status: 'success',
              filepath: 'G:/output/工具/incomplete-b.md',
              warnings: [{ step: 'comments', code: 'comment_incomplete', message: '未抓全' }],
              comment_warning_code: 'comment_incomplete'
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

  const summaryCard = dom.window.document.querySelector('[data-warning-code-summary="true"]');
  assert.ok(summaryCard);
  assert.match(summaryCard.textContent, /comment_login_required/);
  assert.match(summaryCard.textContent, /comment_incomplete/);
  assert.match(summaryCard.textContent, /1/);
  assert.match(summaryCard.textContent, /2/);
});

test('warning code summary card can filter and toggle result rows', async () => {
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
          total: 4,
          successCount: 4,
          failureCount: 0,
          results: [
            {
              status: 'success',
              filepath: 'G:/output/AI/login-gated.md',
              warnings: [{ step: 'comments', code: 'comment_login_required', message: '需要登录' }],
              comment_warning_code: 'comment_login_required'
            },
            {
              status: 'success',
              filepath: 'G:/output/AI/incomplete-a.md',
              warnings: [{ step: 'comments', code: 'comment_incomplete', message: '未抓全' }],
              comment_warning_code: 'comment_incomplete'
            },
            {
              status: 'success',
              filepath: 'G:/output/工具/incomplete-b.md',
              warnings: [{ step: 'comments', code: 'comment_incomplete', message: '未抓全' }],
              comment_warning_code: 'comment_incomplete'
            },
            {
              status: 'success',
              filepath: 'G:/output/工具/normal.md',
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

  const incompleteCard = dom.window.document.querySelector('[data-warning-code="comment_incomplete"]');
  assert.ok(incompleteCard);

  incompleteCard.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));

  const visibleGroupsAfterFilter = Array.from(dom.window.document.querySelectorAll('[data-group-key]'))
    .filter((node) => !node.hidden)
    .map((node) => node.dataset.groupKey)
    .sort();
  assert.deepEqual(visibleGroupsAfterFilter, ['AI', '工具']);

  const visibleRowsAfterFilter = Array.from(dom.window.document.querySelectorAll('.result-row'))
    .filter((node) => node.offsetParent !== null || node.closest('[data-group-key]:not([hidden])'))
    .map((node) => node.textContent);
  assert.equal(visibleRowsAfterFilter.some((text) => /login-gated/.test(text)), false);
  assert.equal(visibleRowsAfterFilter.some((text) => /incomplete-a/.test(text)), true);
  assert.equal(visibleRowsAfterFilter.some((text) => /incomplete-b/.test(text)), true);
  assert.equal(visibleRowsAfterFilter.some((text) => /normal\.md/.test(text)), false);

  incompleteCard.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));

  const visibleRowsAfterReset = Array.from(dom.window.document.querySelectorAll('.result-row'))
    .filter((node) => node.offsetParent !== null || node.closest('[data-group-key]:not([hidden])'))
    .map((node) => node.textContent);
  assert.equal(visibleRowsAfterReset.some((text) => /login-gated/.test(text)), true);
  assert.equal(visibleRowsAfterReset.some((text) => /normal\.md/.test(text)), true);
});

test('failure stage summary card aggregates failed rows and can filter them', async () => {
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
          total: 4,
          successCount: 1,
          failureCount: 3,
          results: [
            {
              status: 'failed',
              canonicalUrl: 'https://example.com/browser-connect',
              error: '未检测到可复用的 Chrome 调试会话，9222 连接失败。'
            },
            {
              status: 'failed',
              canonicalUrl: 'https://example.com/login-a',
              error: '当前网页端提示“登录查看全部评论内容”，请先在当前 Chrome 会话中登录后重试。',
              comment_warning_code: 'comment_login_required',
              manual_action_required: true,
              manual_action_reason: 'login_required'
            },
            {
              status: 'failed',
              canonicalUrl: 'https://example.com/login-b',
              error: '请先登录后查看全部评论内容。',
              comment_warning_code: 'comment_login_required'
            },
            {
              status: 'success',
              filepath: 'G:/output/AI/success.md',
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

  const summaryCard = dom.window.document.querySelector('[data-failure-stage-summary="true"]');
  assert.ok(summaryCard);
  assert.match(summaryCard.textContent, /浏览器接入/);
  assert.match(summaryCard.textContent, /登录门槛/);
  assert.match(summaryCard.textContent, /1/);
  assert.match(summaryCard.textContent, /2/);

  const loginGateCard = dom.window.document.querySelector('[data-failure-stage="登录门槛"]');
  assert.ok(loginGateCard);
  loginGateCard.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));

  const activeFilterBar = dom.window.document.querySelector('[data-active-filters="true"]');
  assert.ok(activeFilterBar);
  assert.match(activeFilterBar.textContent, /失败层级/);
  assert.match(activeFilterBar.textContent, /2 条结果/);

  const visibleGroupsAfterFilter = Array.from(dom.window.document.querySelectorAll('[data-group-key]'))
    .filter((node) => !node.hidden)
    .map((node) => node.dataset.groupKey);
  assert.deepEqual(visibleGroupsAfterFilter, ['failure']);

  const visibleRowsAfterFilter = Array.from(dom.window.document.querySelectorAll('.result-row'))
    .filter((node) => node.offsetParent !== null || node.closest('[data-group-key]:not([hidden])'))
    .map((node) => node.textContent);
  assert.equal(visibleRowsAfterFilter.some((text) => /browser-connect/.test(text)), false);
  assert.equal(visibleRowsAfterFilter.some((text) => /login-a/.test(text)), true);
  assert.equal(visibleRowsAfterFilter.some((text) => /login-b/.test(text)), true);
  assert.equal(visibleRowsAfterFilter.some((text) => /success\.md/.test(text)), false);

  const clearStageChip = dom.window.document.querySelector('[data-active-filter-kind="failure_stage"]');
  assert.ok(clearStageChip);
  clearStageChip.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));

  const visibleRowsAfterReset = Array.from(dom.window.document.querySelectorAll('.result-row'))
    .filter((node) => node.offsetParent !== null || node.closest('[data-group-key]:not([hidden])'))
    .map((node) => node.textContent);
  assert.equal(visibleRowsAfterReset.some((text) => /browser-connect/.test(text)), true);
  assert.equal(visibleRowsAfterReset.some((text) => /success\.md/.test(text)), true);
});

test('active filter bar reflects combined warning and group filters and can clear them', async () => {
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
          total: 4,
          successCount: 4,
          failureCount: 0,
          results: [
            {
              status: 'success',
              filepath: 'G:/output/AI/incomplete-a.md',
              warnings: [{ step: 'comments', code: 'comment_incomplete', message: '未抓全' }],
              comment_warning_code: 'comment_incomplete'
            },
            {
              status: 'success',
              filepath: 'G:/output/AI/normal-a.md',
              warnings: []
            },
            {
              status: 'success',
              filepath: 'G:/output/工具/incomplete-b.md',
              warnings: [{ step: 'comments', code: 'comment_incomplete', message: '未抓全' }],
              comment_warning_code: 'comment_incomplete'
            },
            {
              status: 'success',
              filepath: 'G:/output/工具/normal-b.md',
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

  const incompleteCard = dom.window.document.querySelector('[data-warning-code="comment_incomplete"]');
  assert.ok(incompleteCard);
  incompleteCard.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));

  const aiFilter = dom.window.document.querySelector('[data-filter-key="AI"]');
  assert.ok(aiFilter);
  aiFilter.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));

  const activeFilterBar = dom.window.document.querySelector('[data-active-filters="true"]');
  assert.ok(activeFilterBar);
  assert.match(activeFilterBar.textContent, /当前筛选中/);
  assert.match(activeFilterBar.textContent, /1 条结果/);

  const warningChip = dom.window.document.querySelector('[data-active-filter-kind="warning_code"]');
  const groupChip = dom.window.document.querySelector('[data-active-filter-kind="group"]');
  const clearAllButton = dom.window.document.querySelector('[data-active-filter-kind="all"]');
  assert.ok(warningChip);
  assert.ok(groupChip);
  assert.ok(clearAllButton);

  clearAllButton.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(dom.window.document.querySelector('[data-active-filters="true"]'), null);
  const visibleRowsAfterReset = Array.from(dom.window.document.querySelectorAll('.result-row'))
    .filter((node) => node.offsetParent !== null || node.closest('[data-group-key]:not([hidden])'))
    .map((node) => node.textContent);
  assert.equal(visibleRowsAfterReset.some((text) => /normal-a/.test(text)), true);
  assert.equal(visibleRowsAfterReset.some((text) => /normal-b/.test(text)), true);
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

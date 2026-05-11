const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

function createDom(url = 'http://127.0.0.1:3030/') {
  const html = fs.readFileSync(path.resolve(__dirname, '../../../ui/index.html'), 'utf-8');
  return new JSDOM(html, { url });
}

test('open output button becomes available after save and calls api when clicked', async () => {
  const dom = createDom();
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;

  const helpersPath = path.resolve(__dirname, '../../../ui/ui_helpers.js');
  const appPath = path.resolve(__dirname, '../../../ui/app.js');
  delete require.cache[helpersPath];
  delete require.cache[appPath];
  global.window.XhsUiHelpers = require(helpersPath);

  const calls = [];
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), init: init || {} });
    const isGet = !init || init.method === 'GET';
    if (String(url).includes('/api/ui-config') && isGet) {
      return {
        ok: true,
        json: async () => ({ config: { paths: {}, naming: {}, runtime: {}, ui: {} } }),
        headers: { get: () => 'application/json' }
      };
    }
    if (String(url).includes('/api/save-collection')) {
      return {
        ok: true,
        json: async () => ({
          ok: true,
          task: 'collection-export',
          report: {
            status: 'success',
            outputFolder: 'G:/output',
            output: {
              steps: [
                { script: 'extract_v4.js', code: 0 },
                { script: 'ocr_and_write.js', code: 0 }
              ]
            }
          }
        }),
        headers: { get: () => 'application/json' }
      };
    }
    if (String(url).includes('/api/open-output')) {
      return {
        ok: true,
        json: async () => ({ ok: true, folderPath: 'G:/output' }),
        headers: { get: () => 'application/json' }
      };
    }
    return {
      ok: true,
      json: async () => ({}),
      headers: { get: () => 'application/json' }
    };
  };

  require(appPath);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const runButton = document.getElementById('collection-submit');
  const openButton = document.getElementById('open-output-folder');
  assert.ok(openButton);
  assert.equal(openButton.disabled, true);

  runButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(openButton.disabled, false);

  openButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  const openCall = calls.find((entry) => entry.url.includes('/api/open-output'));
  assert.ok(openCall);
});

test('open output fallback copies the suggested folder path when system open fails', async () => {
  const dom = createDom();
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;
  global.navigator.clipboard = {
    writes: [],
    async writeText(value) {
      this.writes.push(String(value));
    }
  };

  const helpersPath = path.resolve(__dirname, '../../../ui/ui_helpers.js');
  const appPath = path.resolve(__dirname, '../../../ui/app.js');
  delete require.cache[helpersPath];
  delete require.cache[appPath];
  global.window.XhsUiHelpers = require(helpersPath);

  global.fetch = async (url, init) => {
    const isGet = !init || init.method === 'GET';
    if (String(url).includes('/api/ui-config') && isGet) {
      return {
        ok: true,
        json: async () => ({ config: { paths: {}, naming: {}, runtime: {}, ui: {} } }),
        headers: { get: () => 'application/json' }
      };
    }
    if (String(url).includes('/api/save-collection')) {
      return {
        ok: true,
        json: async () => ({
          ok: true,
          task: 'collection-export',
          report: {
            status: 'success',
            outputFolder: 'G:/output/收藏导出',
            output: {
              steps: [
                { script: 'extract_v4.js', code: 0 },
                { script: 'ocr_and_write.js', code: 0 }
              ]
            }
          }
        }),
        headers: { get: () => 'application/json' }
      };
    }
    if (String(url).includes('/api/open-output')) {
      return {
        ok: false,
        json: async () => ({ error: '输出目录不存在' }),
        headers: { get: () => 'application/json' }
      };
    }
    return {
      ok: true,
      json: async () => ({}),
      headers: { get: () => 'application/json' }
    };
  };

  require(appPath);
  await new Promise((resolve) => setTimeout(resolve, 0));

  document.getElementById('collection-submit').click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  document.getElementById('open-output-folder').click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(global.navigator.clipboard.writes, ['G:/output/收藏导出']);
  assert.match(document.getElementById('status-text').textContent, /已复制输出路径/);
  assert.match(document.getElementById('error-message').textContent, /可手动打开/);
});

test('workspace navigation tracks the current hash section', async () => {
  const dom = createDom('http://127.0.0.1:3030/#section-links');
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;

  const helpersPath = path.resolve(__dirname, '../../../ui/ui_helpers.js');
  const appPath = path.resolve(__dirname, '../../../ui/app.js');
  delete require.cache[helpersPath];
  delete require.cache[appPath];
  global.window.XhsUiHelpers = require(helpersPath);

  global.fetch = async (url, init) => {
    const isGet = !init || init.method === 'GET';
    if (String(url).includes('/api/ui-config') && isGet) {
      return {
        ok: true,
        json: async () => ({ config: { paths: {}, browser: {}, naming: {}, runtime: {}, ui: {} } }),
        headers: { get: () => 'application/json' }
      };
    }
    return {
      ok: true,
      json: async () => ({}),
      headers: { get: () => 'application/json' }
    };
  };

  require(appPath);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const linksNav = document.querySelector('.workspace-nav-link[href="#section-links"]');
  const collectionNav = document.querySelector('.workspace-nav-link[href="#section-collection"]');
  assert.equal(linksNav.dataset.active, 'true');
  assert.equal(linksNav.getAttribute('aria-current'), 'location');
  assert.equal(collectionNav.dataset.active, 'false');

  dom.window.location.hash = '#section-results';
  dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange'));
  await new Promise((resolve) => setTimeout(resolve, 0));

  const resultsNav = document.querySelector('.workspace-nav-link[href="#section-results"]');
  assert.equal(resultsNav.dataset.active, 'true');
  assert.equal(linksNav.dataset.active, 'false');
});

test('retry failed button becomes available after failed link save and reuses failed urls', async () => {
  const dom = createDom();
  global.window = dom.window;
  global.document = dom.window.document;
  global.navigator = dom.window.navigator;

  const helpersPath = path.resolve(__dirname, '../../../ui/ui_helpers.js');
  const appPath = path.resolve(__dirname, '../../../ui/app.js');
  delete require.cache[helpersPath];
  delete require.cache[appPath];
  global.window.XhsUiHelpers = require(helpersPath);

  const calls = [];
  let saveLinksCalls = 0;
  global.fetch = async (url, init) => {
    calls.push({ url: String(url), init: init || {} });
    const isGet = !init || init.method === 'GET';
    if (String(url).includes('/api/ui-config') && isGet) {
      return {
        ok: true,
        json: async () => ({ config: { paths: {}, browser: {}, naming: {}, runtime: {}, ui: {} } }),
        headers: { get: () => 'application/json' }
      };
    }
    if (String(url).includes('/api/save-links-stream')) {
      saveLinksCalls += 1;
      if (saveLinksCalls === 1) {
        return {
          ok: true,
          json: async () => ({
            report: {
              total: 3,
              successCount: 1,
              failureCount: 2,
              results: [
                {
                  status: 'failed',
                  input: 'https://mp.weixin.qq.com/s/abc123',
                  error: '页面打开失败'
                },
                {
                  status: 'failed',
                  canonicalUrl: 'https://www.zhihu.com/question/1/answer/2',
                  error: '需要稍后重试'
                },
                {
                  status: 'success',
                  filepath: 'G:/output/AI/success.md'
                }
              ]
            }
          }),
          headers: { get: () => 'application/json' }
        };
      }
      return {
        ok: true,
        json: async () => ({
          report: {
            total: 2,
            successCount: 2,
            failureCount: 0,
            results: [
              {
                status: 'success',
                filepath: 'G:/output/微信公众号文章/retry-wechat.md',
                input: 'https://mp.weixin.qq.com/s/abc123'
              },
              {
                status: 'success',
                filepath: 'G:/output/知乎文章/retry-zhihu.md',
                canonicalUrl: 'https://www.zhihu.com/question/1/answer/2'
              }
            ]
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

  require(appPath);
  await new Promise((resolve) => setTimeout(resolve, 0));

  const form = document.getElementById('links-form');
  const text = document.getElementById('links-text');
  const retryButton = document.getElementById('retry-failed-results');
  assert.ok(retryButton);
  assert.equal(retryButton.disabled, true);

  text.value = 'initial text';
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(retryButton.disabled, false);

  retryButton.click();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(
    text.value,
    'https://mp.weixin.qq.com/s/abc123\nhttps://www.zhihu.com/question/1/answer/2'
  );

  const saveCalls = calls.filter((entry) => entry.url.includes('/api/save-links-stream'));
  assert.equal(saveCalls.length, 2);
  const retryPayload = JSON.parse(saveCalls[1].init.body);
  assert.equal(
    retryPayload.text,
    'https://mp.weixin.qq.com/s/abc123\nhttps://www.zhihu.com/question/1/answer/2'
  );
});

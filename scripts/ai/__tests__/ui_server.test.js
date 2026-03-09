const { afterEach, test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const { createUiServer } = require('../../ui_server');

const activeServers = new Set();

afterEach(async () => {
  await Promise.all(Array.from(activeServers, (server) => new Promise((resolve) => {
    server.close(() => resolve());
  })));
  activeServers.clear();
});

async function startServer(overrides = {}) {
  const server = createUiServer({
    saveLinksText: overrides.saveLinksText || (async () => ({
      total: 1,
      successCount: 1,
      failureCount: 0,
      results: [{ status: 'success', filepath: 'G:/output/abc123.md' }]
    })),
    runCollectionExport: overrides.runCollectionExport || (async () => ({
      steps: [
        { script: 'extract_v4.js', code: 0 },
        { script: 'ocr_and_write.js', code: 0 }
      ]
    }))
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  activeServers.add(server);
  return {
    server,
    baseUrl: `http://127.0.0.1:${server.address().port}`
  };
}

function requestJson(url, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const request = http.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (response) => {
      let raw = '';
      response.on('data', (chunk) => { raw += chunk; });
      response.on('end', () => {
        resolve({
          statusCode: response.statusCode,
          body: raw ? JSON.parse(raw) : {}
        });
      });
    });

    request.on('error', reject);
    request.write(payload);
    request.end();
  });
}

test('save-links api rejects empty text payloads', async () => {
  const { baseUrl } = await startServer();
  const response = await requestJson(`${baseUrl}/api/save-links`, { text: '   ' });

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.ok, false);
  assert.match(response.body.error, /请输入|链接/);
});

test('ui server rejects concurrent tasks while one request is still running', async () => {
  let releaseTask;
  let markStarted;
  const taskStarted = new Promise((resolve) => { markStarted = resolve; });
  const taskFinished = new Promise((resolve) => { releaseTask = resolve; });

  const { baseUrl } = await startServer({
    saveLinksText: async () => {
      markStarted();
      await taskFinished;
      return {
        total: 1,
        successCount: 1,
        failureCount: 0,
        results: [{ status: 'success', filepath: 'G:/output/abc123.md' }]
      };
    }
  });

  const firstRequest = requestJson(`${baseUrl}/api/save-links`, {
    text: 'https://www.xiaohongshu.com/explore/abc123'
  });
  await taskStarted;

  const secondResponse = await requestJson(`${baseUrl}/api/save-links`, {
    text: 'https://www.xiaohongshu.com/explore/def456'
  });

  releaseTask();
  const firstResponse = await firstRequest;

  assert.equal(secondResponse.statusCode, 409);
  assert.equal(secondResponse.body.ok, false);
  assert.match(secondResponse.body.error, /任务|运行中/);
  assert.equal(firstResponse.statusCode, 200);
});

test('save-links api returns a normalized success payload', async () => {
  const { baseUrl } = await startServer({
    saveLinksText: async (text) => {
      assert.match(text, /abc123/);
      return {
        total: 2,
        successCount: 1,
        failureCount: 1,
        results: [
          { status: 'success', filepath: 'G:/output/abc123.md' },
          { status: 'failed', error: 'mock failure' }
        ]
      };
    }
  });

  const response = await requestJson(`${baseUrl}/api/save-links`, {
    text: 'https://www.xiaohongshu.com/explore/abc123\nhttps://www.xiaohongshu.com/explore/def456'
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.task, 'save-links');
  assert.deepEqual(response.body.summary, {
    total: 2,
    successCount: 1,
    failureCount: 1
  });
  assert.equal(response.body.results.length, 2);
});

test('save-collection api returns a normalized success payload', async () => {
  const { baseUrl } = await startServer({
    runCollectionExport: async () => ({
      steps: [
        { script: 'extract_v4.js', code: 0 },
        { script: 'ocr_and_write.js', code: 0 }
      ],
      logs: ['extract ok', 'ocr ok']
    })
  });

  const response = await requestJson(`${baseUrl}/api/save-collection`, {});

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.task, 'save-collection');
  assert.equal(response.body.result.steps.length, 2);
  assert.deepEqual(response.body.result.logs, ['extract ok', 'ocr ok']);
});

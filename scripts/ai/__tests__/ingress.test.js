const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildIngressTask,
  enqueueLinkViaIngress,
  normalizeIngressPayload,
  saveLinkViaIngress
} = require('../../lib/ingress');

test('normalizeIngressPayload normalizes snake_case payload into structured ingress fields', () => {
  const payload = normalizeIngressPayload({
    url: ' https://www.xiaohongshu.com/explore/abc123 ',
    source: 'chrome-extension',
    route: 'local',
    delivery_mode: 'immediate',
    requested_at: '2026-04-08T10:00:00.000Z',
    metadata: {
      page_title: '标题',
      selection_text: '选中内容',
      tab_id: 123
    }
  });

  assert.equal(payload.url, 'https://www.xiaohongshu.com/explore/abc123');
  assert.equal(payload.source, 'chrome-extension');
  assert.equal(payload.route, 'local');
  assert.equal(payload.deliveryMode, 'immediate');
  assert.equal(payload.requestedAt, '2026-04-08T10:00:00.000Z');
  assert.deepEqual(payload.metadata, {
    pageTitle: '标题',
    selectionText: '选中内容',
    tabId: 123
  });
});

test('buildIngressTask maps normalized ingress payload into note-save task', () => {
  const task = buildIngressTask({
    url: 'https://mp.weixin.qq.com/s/demo',
    source: 'feishu',
    route: 'cloud',
    deliveryMode: 'queue',
    requestedAt: '2026-04-08T10:00:00.000Z',
    metadata: {
      pageTitle: '微信文章'
    }
  });

  assert.equal(task.type, 'note-save');
  assert.equal(task.input, 'https://mp.weixin.qq.com/s/demo');
  assert.equal(task.source, 'feishu');
  assert.equal(task.route, 'cloud');
  assert.equal(task.deliveryMode, 'queue');
  assert.equal(task.requestedAt, '2026-04-08T10:00:00.000Z');
  assert.deepEqual(task.metadata, { pageTitle: '微信文章' });
});

test('saveLinkViaIngress returns immediate execution report and passes task to saveLinksText', async () => {
  let capturedText = '';
  let capturedOptions = null;
  const result = await saveLinkViaIngress({
    payload: {
      url: 'https://www.xiaohongshu.com/explore/abc123',
      source: 'chrome-extension',
      route: 'local',
      delivery_mode: 'immediate',
      metadata: {
        page_title: '示例标题'
      }
    },
    saveLinksText: async (text, options = {}) => {
      capturedText = text;
      capturedOptions = options;
      return {
        total: 1,
        successCount: 1,
        failureCount: 0,
        results: [{ status: 'success', filepath: 'G:/output/abc123.md' }]
      };
    },
    saveOptions: {
      browser: {
        mode: 'current-browser'
      }
    }
  });

  assert.equal(capturedText, 'https://www.xiaohongshu.com/explore/abc123');
  assert.equal(capturedOptions.task.source, 'chrome-extension');
  assert.equal(capturedOptions.task.route, 'local');
  assert.equal(capturedOptions.task.deliveryMode, 'immediate');
  assert.deepEqual(capturedOptions.task.metadata, { pageTitle: '示例标题' });
  assert.equal(result.accepted, true);
  assert.equal(result.execution, 'immediate');
  assert.equal(result.task.type, 'note-save');
  assert.equal(result.report.total, 1);
});

test('enqueueLinkViaIngress writes queue item with ingress metadata', async () => {
  let capturedItems = [];
  const result = await enqueueLinkViaIngress({
    payload: {
      url: 'https://mp.weixin.qq.com/s/demo',
      source: 'feishu',
      route: 'cloud',
      delivery_mode: 'queue',
      requested_at: '2026-04-08T10:00:00.000Z',
      metadata: {
        event_id: 'evt_1'
      }
    },
    store: {
      append: async (items) => {
        capturedItems = items;
        return { added: 1, skipped: 0 };
      }
    }
  });

  assert.equal(capturedItems.length, 1);
  assert.equal(capturedItems[0].source, 'feishu');
  assert.equal(capturedItems[0].route, 'cloud');
  assert.equal(capturedItems[0].delivery_mode, 'queue');
  assert.equal(capturedItems[0].requested_at, '2026-04-08T10:00:00.000Z');
  assert.equal(capturedItems[0].timestamp, 1775642400);
  assert.deepEqual(capturedItems[0].metadata, { eventId: 'evt_1' });
  assert.equal(result.accepted, true);
  assert.equal(result.execution, 'queued');
  assert.equal(result.queue.added, 1);
});

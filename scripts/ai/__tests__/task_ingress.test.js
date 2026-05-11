const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  assertValidTask,
  buildCollectionTask,
  buildNoteSaveTask
} = require('../../lib/task');

test('buildNoteSaveTask keeps ingress metadata fields', () => {
  const task = buildNoteSaveTask({
    input: 'https://www.xiaohongshu.com/explore/abc123',
    source: 'chrome-extension',
    route: 'local',
    deliveryMode: 'immediate',
    metadata: {
      pageTitle: '示例标题',
      selectionText: '示例选中文本'
    }
  });

  assert.equal(task.type, 'note-save');
  assert.equal(task.source, 'chrome-extension');
  assert.equal(task.route, 'local');
  assert.equal(task.deliveryMode, 'immediate');
  assert.deepEqual(task.metadata, {
    pageTitle: '示例标题',
    selectionText: '示例选中文本'
  });
  assert.doesNotThrow(() => assertValidTask(task));
});

test('buildCollectionTask keeps ingress metadata fields', () => {
  const task = buildCollectionTask({
    source: 'feishu',
    route: 'cloud',
    deliveryMode: 'queue',
    metadata: {
      webhookEventId: 'evt-1'
    }
  });

  assert.equal(task.type, 'collection-export');
  assert.equal(task.source, 'feishu');
  assert.equal(task.route, 'cloud');
  assert.equal(task.deliveryMode, 'queue');
  assert.deepEqual(task.metadata, { webhookEventId: 'evt-1' });
  assert.doesNotThrow(() => assertValidTask(task));
});

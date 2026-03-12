const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildCollectionTask,
  buildNoteSaveTask,
  assertValidTask,
  normalizeTaskInput
} = require('../../lib/task');

test('buildNoteSaveTask normalizes input and source', () => {
  const task = buildNoteSaveTask({
    input: '  https://www.xiaohongshu.com/explore/abc123  ',
    source: 'cli'
  });

  assert.equal(task.type, 'note-save');
  assert.equal(task.source, 'cli');
  assert.equal(task.input, 'https://www.xiaohongshu.com/explore/abc123');
  assert.deepEqual(task.options, {});
  assert.equal(typeof task.requestedAt, 'string');
  assert.equal(task.requestedAt.length > 0, true);
});

test('buildNoteSaveTask supports current mode without input', () => {
  const task = buildNoteSaveTask({ mode: 'current', source: 'cli' });

  assert.equal(task.type, 'note-save');
  assert.equal(task.source, 'cli');
  assert.equal(task.input, '');
  assert.deepEqual(task.options, { mode: 'current' });
});

test('buildCollectionTask builds a collection export task', () => {
  const task = buildCollectionTask({ source: 'ui' });

  assert.equal(task.type, 'collection-export');
  assert.equal(task.source, 'ui');
  assert.equal(task.input, '');
  assert.deepEqual(task.options, {});
});

test('buildCollectionTask supports cli source', () => {
  const task = buildCollectionTask({ source: 'cli' });

  assert.equal(task.type, 'collection-export');
  assert.equal(task.source, 'cli');
  assert.equal(task.input, '');
});

test('normalizeTaskInput trims text and handles empty input', () => {
  assert.equal(normalizeTaskInput('  hello  '), 'hello');
  assert.equal(normalizeTaskInput(''), '');
  assert.equal(normalizeTaskInput(null), '');
});

test('assertValidTask rejects missing required fields', () => {
  assert.throws(() => assertValidTask(null), /task/i);
  assert.throws(() => assertValidTask({ type: 'note-save' }), /source/i);
  assert.throws(() => assertValidTask({ type: 'note-save', source: 'cli' }), /input/i);
});

test('assertValidTask accepts note-save with input or current mode', () => {
  assert.doesNotThrow(() => assertValidTask(buildNoteSaveTask({
    input: 'https://www.xiaohongshu.com/explore/abc123',
    source: 'cli'
  })));
  assert.doesNotThrow(() => assertValidTask(buildNoteSaveTask({
    mode: 'current',
    source: 'cli'
  })));
});

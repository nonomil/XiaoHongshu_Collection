const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildTaskResult,
  buildTaskSummary,
  mergeTaskWarnings
} = require('../../lib/report');

test('buildTaskResult returns normalized task result', () => {
  const result = buildTaskResult({
    status: 'success',
    task: { type: 'note-save' },
    output: { filepath: 'G:/output/a.md' },
    warnings: [{ code: 'comment_fetch_failed', message: 'comment fail' }]
  });

  assert.equal(result.status, 'success');
  assert.equal(result.task.type, 'note-save');
  assert.equal(result.output.filepath, 'G:/output/a.md');
  assert.equal(result.warnings.length, 1);
});

test('mergeTaskWarnings de-duplicates warnings', () => {
  const warnings = mergeTaskWarnings([
    [{ code: 'w1', message: 'a' }, { code: 'w2', message: 'b' }],
    [{ code: 'w1', message: 'a' }]
  ]);

  assert.equal(warnings.length, 2);
});

test('buildTaskSummary returns counts and results by default', () => {
  const summary = buildTaskSummary([
    { status: 'success' },
    { status: 'failed' },
    { status: 'success' }
  ]);

  assert.deepEqual(Object.keys(summary).sort(), ['failureCount', 'results', 'successCount', 'total']);
  assert.equal(summary.total, 3);
  assert.equal(summary.successCount, 2);
  assert.equal(summary.failureCount, 1);
});

test('buildTaskSummary includes warnings when requested', () => {
  const summary = buildTaskSummary(
    [
      { status: 'success', warnings: [{ code: 'w1', message: 'a' }] },
      { status: 'failed', warnings: [{ code: 'w2', message: 'b' }] }
    ],
    { includeWarnings: true }
  );

  assert.equal(Array.isArray(summary.warnings), true);
  assert.equal(summary.warnings.length, 2);
});

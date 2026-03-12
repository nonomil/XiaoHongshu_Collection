const { test } = require('node:test');
const assert = require('node:assert/strict');

const { runTaskPipeline } = require('../../lib/pipeline');

const baseTask = {
  type: 'note-save',
  source: 'cli',
  input: 'https://www.xiaohongshu.com/explore/abc123',
  options: {},
  requestedAt: new Date().toISOString()
};

test('runTaskPipeline executes steps in order', async () => {
  const calls = [];

  const result = await runTaskPipeline({
    task: baseTask,
    fetchFn: async () => {
      calls.push('fetch');
      return { id: 'note-1' };
    },
    enrichFn: async (note) => {
      calls.push('enrich');
      return { ...note, enriched: true };
    },
    writeFn: async () => {
      calls.push('write');
      return { filepath: 'G:/output/note-1.md' };
    },
    reportFn: async (payload) => {
      calls.push('report');
      return payload;
    }
  });

  assert.deepEqual(calls, ['fetch', 'enrich', 'write', 'report']);
  assert.deepEqual(result.stepOrder, ['input', 'fetch', 'enrich', 'write', 'report']);
  assert.equal(result.ok, true);
});

test('runTaskPipeline skips write when fetch fails', async () => {
  let writeCalled = false;

  const result = await runTaskPipeline({
    task: baseTask,
    fetchFn: async () => {
      throw new Error('fetch failed');
    },
    writeFn: async () => {
      writeCalled = true;
    },
    reportFn: async (payload) => payload
  });

  assert.equal(writeCalled, false);
  assert.equal(result.ok, false);
  assert.deepEqual(result.stepOrder, ['input', 'fetch', 'report']);
});

test('runTaskPipeline continues to write when enrich fails with allowWrite', async () => {
  let writeCalled = false;

  const result = await runTaskPipeline({
    task: baseTask,
    fetchFn: async () => ({ id: 'note-2' }),
    enrichFn: async () => {
      const error = new Error('enrich failed');
      error.allowWrite = true;
      throw error;
    },
    writeFn: async () => {
      writeCalled = true;
      return { filepath: 'G:/output/note-2.md' };
    },
    reportFn: async (payload) => payload
  });

  assert.equal(writeCalled, true);
  assert.equal(result.ok, true);
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].step, 'enrich');
});

test('runTaskPipeline passes step results and warnings to report', async () => {
  let reportPayload;

  await runTaskPipeline({
    task: baseTask,
    fetchFn: async () => ({ id: 'note-3' }),
    enrichFn: async () => {
      const error = new Error('enrich warning');
      error.allowWrite = true;
      throw error;
    },
    writeFn: async () => ({ filepath: 'G:/output/note-3.md' }),
    reportFn: async (payload) => {
      reportPayload = payload;
      return { ok: true };
    }
  });

  assert.equal(reportPayload.task.type, 'note-save');
  assert.equal(reportPayload.steps.fetch.ok, true);
  assert.equal(reportPayload.steps.enrich.ok, false);
  assert.equal(reportPayload.steps.write.ok, true);
  assert.equal(reportPayload.warnings.length, 1);
});

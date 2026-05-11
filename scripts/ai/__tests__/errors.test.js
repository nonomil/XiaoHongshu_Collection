const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  CodexTaskError,
  classifyTaskError,
  isRetriableTaskError
} = require('../../lib/errors');
const { runTaskPipeline } = require('../../lib/pipeline');

const baseTask = {
  type: 'note-save',
  source: 'cli',
  input: 'https://www.xiaohongshu.com/explore/abc123',
  options: {},
  requestedAt: new Date().toISOString()
};

test('classifyTaskError detects Chrome unavailable errors', () => {
  const info = classifyTaskError(new Error('connect ECONNREFUSED 127.0.0.1:9222'));
  assert.equal(info.code, 'chrome_unavailable');
  assert.equal(isRetriableTaskError(new Error('connect ECONNREFUSED 127.0.0.1:9222')), true);
});

test('classifyTaskError detects non-note detail errors', () => {
  const info = classifyTaskError(new Error('Current tab is not a Xiaohongshu note detail page'));
  assert.equal(info.code, 'not_note_detail');
  assert.equal(info.retriable, false);
});

test('classifyTaskError detects note unavailable errors from xiaohongshu 404 redirects', () => {
  const info = classifyTaskError(
    new Error('无法打开笔记详情页：当前笔记暂时无法浏览（error_code=300031）。当前页面：https://www.xiaohongshu.com/404?...')
  );
  assert.equal(info.code, 'note_unavailable');
  assert.equal(info.retriable, false);
});

test('pipeline keeps writing when comment fetch fails', async () => {
  let writeCalled = false;
  const error = new CodexTaskError('comment_fetch_failed', 'comment fetch failed', { allowWrite: true });

  const result = await runTaskPipeline({
    task: baseTask,
    fetchFn: async () => ({ id: 'note-1' }),
    enrichFn: async () => { throw error; },
    writeFn: async () => {
      writeCalled = true;
      return { filepath: 'G:/output/note-1.md' };
    }
  });

  assert.equal(writeCalled, true);
  assert.equal(result.ok, true);
  assert.equal(result.warnings[0].code, 'comment_fetch_failed');
});

test('classifyTaskError marks vision OCR failures as fallback-allowed', () => {
  const info = classifyTaskError(new Error('Vision OCR returned empty content'));
  assert.equal(info.code, 'vision_ocr_failed');
  assert.equal(info.allowWrite, true);
});

test('classifyTaskError marks AI failures as fallback-allowed', () => {
  const info = classifyTaskError(new Error('OpenRouter empty response'));
  assert.equal(info.code, 'ai_failed');
  assert.equal(info.allowWrite, true);
});

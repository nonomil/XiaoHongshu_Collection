const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  extractNoteId,
  extractUrlFromText,
  extractUrlsFromText,
  normalizeNoteInput,
  normalizeNoteInputs
} = require('../../lib/note_input');

test('extractUrlFromText returns the first xiaohongshu url from share text', () => {
  const url = extractUrlFromText('快来看这篇笔记 https://www.xiaohongshu.com/explore/abcd1234?xsec_token=foo');
  assert.equal(url, 'https://www.xiaohongshu.com/explore/abcd1234?xsec_token=foo');
});

test('extractUrlFromText supports xhslink short urls with path prefix', () => {
  const url = extractUrlFromText('分享给你 http://xhslink.com/o/7AXKPbGMN6Q 快打开看看');
  assert.equal(url, 'http://xhslink.com/o/7AXKPbGMN6Q');
});

test('extractUrlsFromText returns all xiaohongshu urls in first-seen order', () => {
  const urls = extractUrlsFromText([
    '第一条 https://www.xiaohongshu.com/explore/abcd1234?xsec_token=foo',
    '第二条 http://xhslink.com/o/7AXKPbGMN6Q',
    '第三条 https://www.xiaohongshu.com/discovery/item/efgh5678?app_platform=ios'
  ].join('\n'));

  assert.deepEqual(urls, [
    'https://www.xiaohongshu.com/explore/abcd1234?xsec_token=foo',
    'http://xhslink.com/o/7AXKPbGMN6Q',
    'https://www.xiaohongshu.com/discovery/item/efgh5678?app_platform=ios'
  ]);
});

test('extractNoteId supports explore and discovery item urls', () => {
  assert.equal(extractNoteId('https://www.xiaohongshu.com/explore/abcd1234'), 'abcd1234');
  assert.equal(extractNoteId('https://www.xiaohongshu.com/discovery/item/efgh5678?xsec_token=bar'), 'efgh5678');
});

test('normalizeNoteInput canonicalizes note urls', () => {
  const result = normalizeNoteInput('https://www.xiaohongshu.com/explore/abcd1234?xsec_token=foo');
  assert.deepEqual(result, {
    input: 'https://www.xiaohongshu.com/explore/abcd1234?xsec_token=foo',
    sourceType: 'url',
    extractedUrl: 'https://www.xiaohongshu.com/explore/abcd1234?xsec_token=foo',
    noteId: 'abcd1234',
    canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/abcd1234'
  });
});

test('normalizeNoteInput extracts urls from share text', () => {
  const result = normalizeNoteInput('89 我刚刚在小红书看到这篇笔记，快来看！ https://www.xiaohongshu.com/discovery/item/efgh5678?app_platform=ios');
  assert.equal(result.sourceType, 'share_text');
  assert.equal(result.noteId, 'efgh5678');
  assert.equal(result.canonicalUrl, 'https://www.xiaohongshu.com/discovery/item/efgh5678');
});

test('normalizeNoteInputs removes duplicate note urls while preserving first-seen order', () => {
  const results = normalizeNoteInputs([
    '第一条 https://www.xiaohongshu.com/explore/abcd1234?xsec_token=foo',
    '重复 https://www.xiaohongshu.com/discovery/item/abcd1234?app_platform=ios',
    '第二条 https://www.xiaohongshu.com/discovery/item/efgh5678'
  ].join('\n'));

  assert.deepEqual(results.map((item) => item.noteId), ['abcd1234', 'efgh5678']);
  assert.deepEqual(results.map((item) => item.canonicalUrl), [
    'https://www.xiaohongshu.com/discovery/item/abcd1234',
    'https://www.xiaohongshu.com/discovery/item/efgh5678'
  ]);
  assert.equal(results[0].sourceType, 'share_text');
});

test('normalizeNoteInput rejects unsupported input', () => {
  assert.throws(
    () => normalizeNoteInput('not a xiaohongshu note link'),
    /Unsupported note input/
  );
});

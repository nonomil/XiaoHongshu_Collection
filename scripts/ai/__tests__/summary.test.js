const { test } = require('node:test');
const assert = require('node:assert/strict');

const { buildAiInput, parseAiResponse, fallbackSummaryTags } = require('../summary');

test('buildAiInput includes title, content, and OCR text', () => {
  const input = buildAiInput({
    title: '标题',
    content: '正文内容',
    ocrTexts: [{ text: '图片文字' }]
  });
  assert.ok(input.includes('标题'));
  assert.ok(input.includes('正文内容'));
  assert.ok(input.includes('图片文字'));
});

test('parseAiResponse accepts valid JSON', () => {
  const out = parseAiResponse('{"summary":"一句话","tags":["标签1","标签2","标签3"]}');
  assert.equal(out.summary, '一句话');
  assert.equal(out.tags.length, 3);
});

test('fallbackSummaryTags enforces summary length and tag count', () => {
  const out = fallbackSummaryTags({ title: '标题', content: '正文内容'.repeat(30), noteTags: ['已有标签'] });
  assert.ok(out.summary.length <= 50);
  assert.ok(out.tags.length >= 3 && out.tags.length <= 5);
});

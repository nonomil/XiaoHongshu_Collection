const { test } = require('node:test');
const assert = require('node:assert/strict');

const { buildAiInput, fallbackSummaryTags } = require('../../ai/summary');
const { cleanAuthor } = require('../../lib/note_export');

test('buildAiInput uses Chinese labels for title/content/OCR', () => {
  const text = buildAiInput({
    title: '标题',
    content: '正文内容',
    ocrTexts: [{ text: 'OCR文本' }]
  });

  assert.match(text, /标题：/);
  assert.match(text, /正文：/);
  assert.match(text, /OCR：/);
});

test('fallbackSummaryTags returns readable Chinese tags', () => {
  const result = fallbackSummaryTags({
    title: '标题',
    content: '正文内容',
    noteTags: ['标签1']
  });

  assert.equal(result.tags.some((tag) => /�/.test(tag)), false);
  assert.equal(result.tags.includes('小红书'), true);
  assert.equal(result.tags.includes('笔记'), true);
});

test('cleanAuthor removes 关注 suffix', () => {
  assert.equal(cleanAuthor('作者关注'), '作者');
});

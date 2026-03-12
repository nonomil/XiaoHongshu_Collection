const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  getSummaryTagsWithProvider,
  shouldUseAiSummary
} = require('../../lib/summary_provider');
const { fallbackSummaryTags } = require('../../ai/summary');

const baseNote = {
  title: '测试标题',
  content: '第一行内容\n第二行内容',
  tags: ['标签1', '标签2']
};

const aiConfig = {
  enabled: true,
  apiKey: 'sk-test',
  baseUrl: 'https://example.com/v1',
  model: 'test-model'
};

test('shouldUseAiSummary requires enabled config with api key', () => {
  assert.equal(shouldUseAiSummary(aiConfig), true);
  assert.equal(shouldUseAiSummary({ enabled: false, apiKey: 'sk-test' }), false);
  assert.equal(shouldUseAiSummary({ enabled: true, apiKey: '' }), false);
});

test('getSummaryTagsWithProvider prefers AI when available', async () => {
  const result = await getSummaryTagsWithProvider({
    note: baseNote,
    content: baseNote.content,
    ocrTexts: [],
    config: aiConfig,
    callAiFn: async () => ({ summary: 'AI 摘要', tags: ['标签A', '标签B', '标签C'] })
  });

  assert.equal(result.summary, 'AI 摘要');
  assert.equal(result.tags.includes('标签A'), true);
});

test('getSummaryTagsWithProvider falls back on invalid JSON', async () => {
  const fallback = fallbackSummaryTags({
    title: baseNote.title,
    content: baseNote.content,
    noteTags: baseNote.tags
  });

  const result = await getSummaryTagsWithProvider({
    note: baseNote,
    content: baseNote.content,
    ocrTexts: [],
    config: aiConfig,
    callAiFn: async () => 'not json'
  });

  assert.equal(result.summary, fallback.summary);
  assert.equal(result.tags.length >= 3, true);
});

test('getSummaryTagsWithProvider parses OpenRouter payload strings', async () => {
  const rawResponse = JSON.stringify({
    choices: [
      {
        message: {
          content: JSON.stringify({ summary: 'AI 摘要', tags: ['标签A', '标签B'] })
        }
      }
    ]
  });

  const result = await getSummaryTagsWithProvider({
    note: baseNote,
    content: baseNote.content,
    ocrTexts: [],
    config: aiConfig,
    callAiFn: async () => rawResponse
  });

  assert.equal(result.summary, 'AI 摘要');
  assert.equal(result.tags.includes('标签A'), true);
});

test('getSummaryTagsWithProvider falls back on AI errors', async () => {
  const fallback = fallbackSummaryTags({
    title: baseNote.title,
    content: baseNote.content,
    noteTags: baseNote.tags
  });

  const result = await getSummaryTagsWithProvider({
    note: baseNote,
    content: baseNote.content,
    ocrTexts: [],
    config: aiConfig,
    callAiFn: async () => {
      throw new Error('AI timeout');
    }
  });

  assert.equal(result.summary, fallback.summary);
});

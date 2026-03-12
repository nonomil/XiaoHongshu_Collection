const { test } = require('node:test');
const assert = require('node:assert/strict');
const { applyOcrRules, computeOcrAnomalyScore, shouldAiCorrect } = require('../ocr_postcorrect');

test('applyOcrRules fixes common mistakes', () => {
  const input = '可以自动抓取小红书收藏天里的所有笔记数据';
  const output = applyOcrRules(input);
  assert.equal(output, '可以自动抓取小红书收藏夹里的所有笔记数据');
});

test('computeOcrAnomalyScore flags noisy text', () => {
  const input = 'a1$% …… @@ ### ？？';
  const score = computeOcrAnomalyScore(input);
  assert.ok(score > 0.6);
});

test('shouldAiCorrect respects threshold', () => {
  const input = '普通中文句子，没有异常。';
  const score = computeOcrAnomalyScore(input);
  assert.equal(shouldAiCorrect(score, 0.5), false);
});

test('applyOcrRules keeps normal text unchanged', () => {
  const input = '这是正常中文内容';
  const output = applyOcrRules(input);
  assert.equal(output, input);
});

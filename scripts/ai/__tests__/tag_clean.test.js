const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cleanTags } = require('../tag_clean');

test('cleanTags removes garbled tags and short tags', () => {
  const input = ['知识库', '笔记', 'С����', 'a', '小红书搜索'];
  const output = cleanTags(input);
  assert.deepEqual(output, ['知识库', '笔记', '小红书搜索']);
});

test('cleanTags keeps mixed Chinese/English tags', () => {
  const input = ['AI工具', 'knowledge'];
  const output = cleanTags(input);
  assert.deepEqual(output, ['AI工具', 'knowledge']);
});

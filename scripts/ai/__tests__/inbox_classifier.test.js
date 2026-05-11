const { test } = require('node:test');
const assert = require('node:assert/strict');

const { classifyInboxNote, defaultInboxCategories } = require('../../lib/inbox_classifier');

test('classifyInboxNote matches default categories by keywords', () => {
  const category = classifyInboxNote({
    title: '红利低波策略',
    content: 'ETF 定投 收益率',
    tags: []
  }, defaultInboxCategories());
  assert.equal(category, '理财');
});

test('classifyInboxNote falls back to 未分类', () => {
  const category = classifyInboxNote({ title: '随便写写', content: '测试', tags: [] }, defaultInboxCategories());
  assert.equal(category, '未分类');
});


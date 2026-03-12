const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildAccountKeyFromDom } = require('../account_dom');

test('buildAccountKeyFromDom uses nickname and uid', () => {
  const info = { nickname: '小红薯62AE42E3', uid: '62ade3ea000000001b026c75' };
  const out = buildAccountKeyFromDom(info);
  assert.equal(out, '小红薯62AE42E3_62ade3ea000000001b026c75');
});

test('buildAccountKeyFromDom falls back to nickname_unknown', () => {
  const info = { nickname: '小红薯62AE42E3', uid: '' };
  const out = buildAccountKeyFromDom(info);
  assert.equal(out, '小红薯62AE42E3_unknown');
});

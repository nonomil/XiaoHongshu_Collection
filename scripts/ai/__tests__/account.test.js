const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildAccountKey, buildOutputDirs, normalizeNickname } = require('../account');

test('buildAccountKey combines nickname and uid', () => {
  const key = buildAccountKey({ nickname: 'foo', uid: '123' });
  assert.equal(key, 'foo_123');
});

test('buildAccountKey falls back to unknown', () => {
  const key = buildAccountKey({ nickname: '', uid: '' });
  assert.equal(key, 'unknown_000000');
});

test('normalizeNickname trims and removes suffix', () => {
  const out = normalizeNickname('Alice 关注');
  assert.equal(out, 'Alice');
});

test('buildOutputDirs uses accountKey', () => {
  const out = buildOutputDirs('output', 'foo_123');
  assert.ok(out.notesDir.endsWith('output\\foo_123'));
  assert.ok(out.imagesDir.includes('output\\foo_123\\_images'));
});

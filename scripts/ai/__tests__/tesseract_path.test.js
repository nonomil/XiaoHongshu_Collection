const { test } = require('node:test');
const assert = require('node:assert/strict');
const { resolveTessdataPrefix } = require('../tesseract_path');

test('resolveTessdataPrefix uses env when set', () => {
  const out = resolveTessdataPrefix('C:/custom');
  assert.equal(out, 'C:/custom');
});

test('resolveTessdataPrefix defaults to assets/tesseract', () => {
  const out = resolveTessdataPrefix('');
  assert.ok(out.endsWith('assets\\tesseract'));
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  createTempDir,
  resolveTestTmpDir,
  resolveTestTmpRoot
} = require('./test_tmp');

function normalizePath(value) {
  return String(value).replace(/\\/g, '/');
}

test('resolveTestTmpRoot returns project tmp directory', () => {
  const root = resolveTestTmpRoot();
  assert.ok(root);
  assert.match(normalizePath(root), /\/tmp$/);
});

test('resolveTestTmpDir creates named directory under tmp', () => {
  const target = resolveTestTmpDir('tmp-helper');
  assert.ok(fs.existsSync(target));
  assert.match(normalizePath(target), /\/tmp\/tmp-helper$/);
});

test('createTempDir creates unique folder under tmp', () => {
  const dir = createTempDir('xhs-test-');
  assert.ok(fs.existsSync(dir));
  assert.match(path.basename(dir), /^xhs-test-/);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { resolveProjectPaths } = require('../../lib/config');
const { cleanupTmp } = require('../../cleanup_tmp');

test('cleanupTmp removes tmp contents and legacy dirs', () => {
  const paths = resolveProjectPaths(path.resolve(__dirname, '..', '..', '..'));
  const tmpRoot = path.join(paths.primaryDir, 'tmp');
  fs.mkdirSync(tmpRoot, { recursive: true });

  const tmpEntry = path.join(tmpRoot, 'cleanup-test-entry');
  fs.mkdirSync(tmpEntry, { recursive: true });
  fs.writeFileSync(path.join(tmpEntry, 'a.txt'), 'x', 'utf-8');

  const legacyDir = path.join(paths.primaryDir, 'tmp-ui-config-cleanup-test');
  fs.mkdirSync(legacyDir, { recursive: true });

  const legacyTmpDir = path.join(paths.primaryDir, 'scripts', 'ai', '__tmp__');
  fs.mkdirSync(legacyTmpDir, { recursive: true });
  fs.writeFileSync(path.join(legacyTmpDir, 'b.txt'), 'y', 'utf-8');

  cleanupTmp();

  assert.equal(fs.existsSync(tmpEntry), false);
  assert.equal(fs.existsSync(legacyDir), false);
  assert.equal(fs.existsSync(legacyTmpDir), false);
});

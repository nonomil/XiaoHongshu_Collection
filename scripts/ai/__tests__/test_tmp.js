const fs = require('fs');
const path = require('path');

const { resolveProjectPaths } = require('../../lib/config');

function resolveTestTmpRoot() {
  const paths = resolveProjectPaths(path.resolve(__dirname, '..', '..', '..'));
  return path.join(paths.primaryDir, 'tmp');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function resolveTestTmpDir(name) {
  const root = resolveTestTmpRoot();
  ensureDir(root);
  const target = path.join(root, name);
  ensureDir(target);
  return target;
}

function createTempDir(prefix) {
  const root = resolveTestTmpRoot();
  ensureDir(root);
  return fs.mkdtempSync(path.join(root, prefix));
}

module.exports = {
  resolveTestTmpRoot,
  resolveTestTmpDir,
  createTempDir
};

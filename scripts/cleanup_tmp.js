const fs = require('fs');
const path = require('path');

const { resolveProjectPaths } = require('./lib/config');

const paths = resolveProjectPaths(path.resolve(__dirname, '..'));
const tmpRoot = path.join(paths.primaryDir, 'tmp');

function removeIfExists(target) {
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

function clearTmpRoot() {
  if (!fs.existsSync(tmpRoot)) return;
  for (const entry of fs.readdirSync(tmpRoot)) {
    removeIfExists(path.join(tmpRoot, entry));
  }
}

function clearLegacy() {
  const legacyRoot = paths.primaryDir;
  if (!fs.existsSync(legacyRoot)) return;

  for (const entry of fs.readdirSync(legacyRoot)) {
    if (entry.startsWith('tmp-ui-config-')) {
      removeIfExists(path.join(legacyRoot, entry));
    }
  }

  removeIfExists(path.join(legacyRoot, 'scripts', 'ai', '__tmp__'));
}

function cleanupTmp() {
  clearTmpRoot();
  clearLegacy();
}

if (require.main === module) {
  cleanupTmp();
}

module.exports = {
  cleanupTmp,
  clearTmpRoot,
  clearLegacy,
  tmpRoot
};

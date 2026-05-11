const path = require('path');

const PROJECT_DIR = path.resolve(__dirname, '..', '..');

function resolveTessdataPrefix(envValue) {
  if (envValue && String(envValue).trim()) return String(envValue).trim();
  return path.join(PROJECT_DIR, 'assets', 'tesseract');
}

module.exports = { resolveTessdataPrefix };

const path = require('path');

function sanitizeName(value) {
  return String(value || 'unknown')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeNickname(nickname) {
  return sanitizeName(String(nickname || '').replace(/关注$/, '').trim());
}

function buildAccountKey({ nickname, uid }) {
  const safeName = normalizeNickname(nickname) || 'unknown';
  const safeUid = String(uid || '000000').trim() || '000000';
  return `${safeName}_${safeUid}`;
}

function buildOutputDirs(outputRoot, accountKey) {
  const notesDir = path.join(outputRoot, accountKey);
  const imagesDir = path.join(notesDir, '_images');
  return { notesDir, imagesDir };
}

module.exports = {
  buildAccountKey,
  buildOutputDirs,
  normalizeNickname,
  sanitizeName
};

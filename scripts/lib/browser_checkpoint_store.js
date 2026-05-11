const fs = require('fs');
const path = require('path');

function sanitizeCheckpointId(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function createJsonCheckpointStore({
  rootDir,
  mkdirSync = fs.mkdirSync,
  existsSync = fs.existsSync,
  readFileSync = fs.readFileSync,
  writeFileSync = fs.writeFileSync
} = {}) {
  if (!rootDir) {
    throw new Error('rootDir is required');
  }

  function ensureRootDir() {
    mkdirSync(rootDir, { recursive: true });
  }

  function resolveCheckpointPath(checkpointId) {
    const normalized = sanitizeCheckpointId(checkpointId);
    if (!normalized) {
      throw new Error('checkpointId is required');
    }
    return path.join(rootDir, `${normalized}.json`);
  }

  function loadCheckpoint(checkpointId) {
    const filepath = resolveCheckpointPath(checkpointId);
    if (!existsSync(filepath)) {
      return null;
    }
    const raw = readFileSync(filepath, 'utf-8');
    return JSON.parse(raw);
  }

  function saveCheckpoint(checkpointId, payload) {
    const filepath = resolveCheckpointPath(checkpointId);
    ensureRootDir();
    writeFileSync(filepath, JSON.stringify(payload, null, 2), 'utf-8');
    return filepath;
  }

  return {
    rootDir,
    loadCheckpoint,
    resolveCheckpointPath,
    saveCheckpoint
  };
}

module.exports = {
  createJsonCheckpointStore,
  sanitizeCheckpointId
};

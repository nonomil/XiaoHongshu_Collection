const path = require('path');
const { resolveProjectPaths } = require('./config');

function resolveCollectionRawPath({ projectDir, dataDir } = {}) {
  const envPath = String(process.env.XHS_RAW_PATH || '').trim();
  if (envPath) return envPath;
  if (dataDir) return path.join(dataDir, 'raw_notes.json');
  const paths = resolveProjectPaths(projectDir || path.resolve(__dirname, '..'));
  return path.join(paths.dataDir, 'raw_notes.json');
}

function resolveCollectionOutputRoot({ projectDir, outputDir } = {}) {
  const envPath = String(process.env.XHS_OUTPUT_ROOT || '').trim();
  if (envPath) return envPath;
  if (outputDir) return outputDir;
  const paths = resolveProjectPaths(projectDir || path.resolve(__dirname, '..'));
  return paths.outputDir;
}

module.exports = {
  resolveCollectionRawPath,
  resolveCollectionOutputRoot
};

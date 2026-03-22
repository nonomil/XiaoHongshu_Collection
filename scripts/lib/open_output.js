const path = require('path');
const { spawn } = require('child_process');

function normalizeAbsolutePath(candidate, projectDir) {
  const value = String(candidate || '').trim();
  if (!value) return '';
  return path.normalize(path.isAbsolute(value) ? value : path.resolve(projectDir, value));
}

function collectSuccessfulFilepaths(report) {
  const results = Array.isArray(report?.results) ? report.results : [];
  return results
    .filter((item) => item && item.status !== 'failed' && String(item.filepath || '').trim())
    .map((item) => path.dirname(String(item.filepath)));
}

function resolveOutputFolder({
  report,
  uiConfig,
  projectDir,
  defaultOutputDir
} = {}) {
  const fallbackDir = normalizeAbsolutePath(defaultOutputDir, projectDir || process.cwd());
  const explicitFolder = normalizeAbsolutePath(report?.outputFolder, projectDir || process.cwd());
  if (explicitFolder) {
    return explicitFolder;
  }

  const filepathDirs = collectSuccessfulFilepaths(report).map((value) => normalizeAbsolutePath(value, projectDir || process.cwd()));
  const uniqueDirs = Array.from(new Set(filepathDirs.filter(Boolean)));
  if (uniqueDirs.length === 1) {
    return uniqueDirs[0];
  }

  const configPaths = uiConfig?.paths || {};
  const collectionRoot = normalizeAbsolutePath(configPaths.collectionOutputRoot, projectDir || process.cwd());
  const saveLinksRoot = normalizeAbsolutePath(configPaths.saveLinksOutputRoot, projectDir || process.cwd());
  const looksLikeCollectionReport = Array.isArray(report?.output?.steps) && report.output.steps.length > 0;

  if (looksLikeCollectionReport && collectionRoot) {
    return collectionRoot;
  }
  if (saveLinksRoot) {
    return saveLinksRoot;
  }
  if (collectionRoot) {
    return collectionRoot;
  }

  return fallbackDir;
}

async function openFolder(folderPath, options = {}) {
  const spawnFn = typeof options.spawnFn === 'function' ? options.spawnFn : spawn;
  const normalized = path.normalize(String(folderPath || '').trim());
  if (!normalized) {
    throw new Error('No output folder available');
  }

  let command = 'xdg-open';
  if (process.platform === 'win32') command = 'explorer.exe';
  if (process.platform === 'darwin') command = 'open';

  const child = spawnFn(command, [normalized], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });
  if (child && typeof child.unref === 'function') {
    child.unref();
  }
  return normalized;
}

async function openOutputFolder({
  report,
  uiConfig,
  projectDir,
  defaultOutputDir,
  spawnFn
} = {}) {
  const folderPath = resolveOutputFolder({
    report,
    uiConfig,
    projectDir,
    defaultOutputDir
  });
  return openFolder(folderPath, { spawnFn });
}

module.exports = {
  openFolder,
  openOutputFolder,
  resolveOutputFolder
};

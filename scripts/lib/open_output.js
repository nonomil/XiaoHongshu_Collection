const fs = require('fs');
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
  const normalized = path.normalize(String(folderPath || '').trim());
  if (!normalized) {
    throw new Error('No output folder available');
  }
  const pathExistsFn = typeof options.pathExistsFn === 'function' ? options.pathExistsFn : fs.existsSync;
  if (!pathExistsFn(normalized)) {
    throw new Error(`输出目录不存在：${normalized}`);
  }

  const spawnFn = typeof options.spawnFn === 'function' ? options.spawnFn : spawn;
  const command = buildOpenFolderCommand(normalized, {
    platform: options.platform || process.platform
  });
  const child = spawnFn(command.command, command.args, command.options);
  if (child && typeof child.unref === 'function') {
    child.unref();
  }
  await waitForOpenCommand(child);
  return normalized;
}

function buildOpenFolderCommand(folderPath, options = {}) {
  const platform = options.platform || process.platform;
  const normalized = path.normalize(String(folderPath || '').trim());
  if (platform === 'win32') {
    return {
      command: 'explorer.exe',
      args: [normalized],
      options: {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      }
    };
  }
  if (platform === 'darwin') {
    return {
      command: 'open',
      args: [normalized],
      options: {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      }
    };
  }
  return {
    command: 'xdg-open',
    args: [normalized],
    options: {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    }
  };
}

function waitForOpenCommand(child) {
  if (!child || typeof child.once !== 'function') {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      if (typeof child.off === 'function') {
        child.off('error', onError);
        child.off('spawn', onSpawn);
      } else if (typeof child.removeListener === 'function') {
        child.removeListener('error', onError);
        child.removeListener('spawn', onSpawn);
      }
    };
    const onError = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onSpawn = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    child.once('error', onError);
    child.once('spawn', onSpawn);
  });
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
  buildOpenFolderCommand,
  openFolder,
  openOutputFolder,
  resolveOutputFolder
};

const fs = require('fs');
const path = require('path');

function getPrimaryProjectDir(projectDir) {
  const normalized = path.resolve(projectDir);
  const marker = `${path.sep}.worktrees${path.sep}`;
  const markerIndex = normalized.indexOf(marker);
  if (markerIndex === -1) return normalized;
  return normalized.slice(0, markerIndex);
}

function resolveProjectPaths(projectDir = path.resolve(__dirname, '..')) {
  const resolved = path.resolve(projectDir);
  const primaryDir = getPrimaryProjectDir(resolved);
  return {
    projectDir: resolved,
    primaryDir,
    configDir: path.join(resolved, 'config'),
    outputDir: path.join(resolved, 'output'),
    dataDir: path.join(resolved, 'data'),
    cacheDir: path.join(resolved, '.cache')
  };
}

function loadJsonConfig(filePath, defaults = {}) {
  if (!filePath || !fs.existsSync(filePath)) {
    return { ...defaults, _missing: true };
  }

  try {
    const rawText = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(rawText);
    return { ...defaults, ...parsed };
  } catch (error) {
    return { ...defaults, _invalid: true, error };
  }
}

function resolveConfigPath(projectDir, filename, exampleFilename = '') {
  const searchRoots = [path.resolve(projectDir)];
  const primaryDir = getPrimaryProjectDir(projectDir);
  if (!searchRoots.includes(primaryDir)) {
    searchRoots.push(primaryDir);
  }

  for (const root of searchRoots) {
    const realPath = path.join(root, 'config', filename);
    if (fs.existsSync(realPath)) return realPath;
  }

  if (exampleFilename) {
    for (const root of searchRoots) {
      const examplePath = path.join(root, 'config', exampleFilename);
      if (fs.existsSync(examplePath)) return examplePath;
    }
  }

  return '';
}

function loadOpenRouterConfig({
  projectDir = path.resolve(__dirname, '..'),
  configPath
} = {}) {
  const defaults = {
    enabled: true,
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openrouter/free',
    timeoutMs: 30000,
    ocrPostCorrect: true,
    ocrPostCorrectThreshold: 0.55,
    ocrPostCorrectMaxChars: 1200
  };

  const resolvedPath = configPath
    || resolveConfigPath(projectDir, 'openrouter.json', 'openrouter.example.json');
  return loadJsonConfig(resolvedPath, defaults);
}

function loadVisionOcrConfig({
  projectDir = path.resolve(__dirname, '..'),
  configPath
} = {}) {
  const defaults = {
    enabled: true,
    baseUrl: '',
    apiKey: '',
    model: '',
    timeoutMs: 60000,
    fallbackToTesseract: true
  };

  const resolvedPath = configPath
    || resolveConfigPath(projectDir, 'vision-ocr.json', 'vision-ocr.example.json');
  return loadJsonConfig(resolvedPath, defaults);
}

module.exports = {
  loadJsonConfig,
  loadOpenRouterConfig,
  loadVisionOcrConfig,
  resolveProjectPaths
};

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

const DEFAULT_OPENROUTER_CONFIG = {
  enabled: true,
  apiKey: '',
  baseUrl: 'https://openrouter.ai/api/v1',
  model: 'openrouter/free',
  timeoutMs: 30000,
  ocrPostCorrect: true,
  ocrPostCorrectThreshold: 0.55,
  ocrPostCorrectMaxChars: 1200
};

const OPENROUTER_API_KEY_PLACEHOLDERS = new Set([
  'YOUR_OPENROUTER_API_KEY',
  'YOUR_API_KEY'
]);

function normalizeOpenRouterApiKey(value) {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  if (OPENROUTER_API_KEY_PLACEHOLDERS.has(normalized.toUpperCase())) {
    return '';
  }
  return normalized;
}

function normalizeOpenRouterConfig(config = {}) {
  const merged = {
    ...DEFAULT_OPENROUTER_CONFIG,
    ...(config && typeof config === 'object' ? config : {})
  };
  const timeoutMs = Number(merged.timeoutMs);
  return {
    ...merged,
    apiKey: normalizeOpenRouterApiKey(merged.apiKey),
    baseUrl: String(merged.baseUrl || DEFAULT_OPENROUTER_CONFIG.baseUrl).trim()
      || DEFAULT_OPENROUTER_CONFIG.baseUrl,
    model: String(merged.model || DEFAULT_OPENROUTER_CONFIG.model).trim()
      || DEFAULT_OPENROUTER_CONFIG.model,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0
      ? timeoutMs
      : DEFAULT_OPENROUTER_CONFIG.timeoutMs
  };
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

function saveOpenRouterConfig({
  projectDir = path.resolve(__dirname, '..'),
  configPath,
  payload
} = {}) {
  const paths = resolveProjectPaths(projectDir);
  const resolvedPath = configPath || path.join(paths.configDir, 'openrouter.json');
  const dir = path.dirname(resolvedPath);
  const base = fs.existsSync(resolvedPath)
    ? loadJsonConfig(resolvedPath, DEFAULT_OPENROUTER_CONFIG)
    : DEFAULT_OPENROUTER_CONFIG;
  const next = normalizeOpenRouterConfig({
    ...base,
    ...(payload && typeof payload === 'object' ? payload : {})
  });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(resolvedPath, JSON.stringify(next, null, 2), 'utf-8');
  return next;
}

function loadOpenRouterConfig({
  projectDir = path.resolve(__dirname, '..'),
  configPath
} = {}) {
  const resolvedPath = configPath
    || resolveConfigPath(projectDir, 'openrouter.json', 'openrouter.example.json');
  return normalizeOpenRouterConfig(loadJsonConfig(resolvedPath, DEFAULT_OPENROUTER_CONFIG));
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
  DEFAULT_OPENROUTER_CONFIG,
  loadJsonConfig,
  loadOpenRouterConfig,
  loadVisionOcrConfig,
  normalizeOpenRouterApiKey,
  normalizeOpenRouterConfig,
  saveOpenRouterConfig,
  resolveProjectPaths
};

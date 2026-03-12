const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  paths: {
    saveLinksOutputRoot: '',
    saveLinksImagesRoot: '',
    collectionOutputRoot: '',
    collectionRawPath: ''
  },
  naming: {
    conflictStrategy: 'content-aware',
    maxTitleLength: 80
  },
  runtime: {
    aiSummaryEnabled: true,
    visionOcrEnabled: true,
    ocrFallbackEnabled: true,
    openRouterTimeoutMs: 30000,
    visionOcrTimeoutMs: 60000,
    maxImagesPerNote: 12
  },
  ui: {
    showRawReport: true
  }
};

function mergeUiConfig(base, override) {
  const merged = JSON.parse(JSON.stringify(base || DEFAULTS));
  if (!override || typeof override !== 'object') return merged;

  for (const section of Object.keys(DEFAULTS)) {
    merged[section] = { ...merged[section], ...(override[section] || {}) };
  }

  return merged;
}

function loadUiConfig({ configPath }) {
  if (!configPath || !fs.existsSync(configPath)) {
    return { ...DEFAULTS, _missing: true };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    return mergeUiConfig(DEFAULTS, parsed);
  } catch (error) {
    return { ...DEFAULTS, _invalid: true, error };
  }
}

function saveUiConfig({ configPath, payload }) {
  const dir = path.dirname(configPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(payload, null, 2), 'utf-8');
}

module.exports = {
  DEFAULTS,
  loadUiConfig,
  mergeUiConfig,
  saveUiConfig
};

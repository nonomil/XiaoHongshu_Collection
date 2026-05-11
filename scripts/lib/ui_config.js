const fs = require('fs');
const path = require('path');

const DEFAULT_UI_CONFIG = {
  paths: {
    saveLinksOutputRoot: '',
    saveLinksImagesRoot: '',
    collectionOutputRoot: '',
    collectionRawPath: ''
  },
  browser: {
    mode: 'current-browser',
    browserUrl: '',
    wsEndpoint: '',
    channel: 'stable',
    headless: false
  },
  naming: {
    conflictStrategy: 'overwrite',
    maxTitleLength: 80
  },
  runtime: {
    autoClassifyLinksEnabled: true,
    aiSummaryEnabled: true,
    visionOcrEnabled: true,
    ocrFallbackEnabled: true,
    openRouterBaseUrl: '',
    openRouterModel: '',
    hasOpenRouterApiKey: false,
    openRouterTimeoutMs: 30000,
    visionOcrTimeoutMs: 60000,
    maxImagesPerNote: 12
  },
  ingress: {
    localBaseUrl: 'http://127.0.0.1:3030',
    cloudBaseUrl: '',
    defaultRoute: 'local'
  },
  inbox: {
    categories: {}
  },
  ui: {
    showRawReport: true
  }
};

function cloneDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_UI_CONFIG));
}

function mergeUiConfig(base, override) {
  const merged = cloneDefaults();
  const sources = [base, override];

  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    for (const section of Object.keys(DEFAULT_UI_CONFIG)) {
      const value = source[section];
      if (value && typeof value === 'object') {
        merged[section] = { ...merged[section], ...value };
      }
    }
  }

  return merged;
}

function loadUiConfig({ configPath }) {
  if (!configPath || !fs.existsSync(configPath)) {
    return { ...cloneDefaults(), _missing: true };
  }

  try {
    const rawText = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(rawText);
    return mergeUiConfig(DEFAULT_UI_CONFIG, parsed);
  } catch (error) {
    return { ...cloneDefaults(), _invalid: true, error };
  }
}

function saveUiConfig({ configPath, payload }) {
  if (!configPath) {
    throw new Error('configPath is required');
  }
  const dir = path.dirname(configPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(payload, null, 2), 'utf-8');
}

module.exports = {
  DEFAULT_UI_CONFIG,
  loadUiConfig,
  mergeUiConfig,
  saveUiConfig
};

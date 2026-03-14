const fs = require('fs');
const path = require('path');

const DEFAULT_PUSHBULLET_CONFIG = {
  enabled: false,
  accessToken: '',
  lastModified: 0,
  inboxPath: 'data/inbox_links.jsonl'
};

function cloneDefaults() {
  return JSON.parse(JSON.stringify(DEFAULT_PUSHBULLET_CONFIG));
}

function normalizeConfig(raw) {
  const merged = cloneDefaults();
  if (raw && typeof raw === 'object') {
    return { ...merged, ...raw };
  }
  return merged;
}

function extractTokenFromText(text) {
  if (!text) return '';
  const lines = String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length ? lines[lines.length - 1] : '';
}

function savePushbulletConfig({ configPath, payload }) {
  if (!configPath) {
    throw new Error('configPath is required');
  }
  const dir = path.dirname(configPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(payload, null, 2), 'utf-8');
}

function loadPushbulletConfig({ configPath }) {
  if (!configPath || !fs.existsSync(configPath)) {
    return { ...cloneDefaults(), _missing: true };
  }

  const rawText = fs.readFileSync(configPath, 'utf-8');
  if (!rawText.trim()) {
    return cloneDefaults();
  }

  try {
    const parsed = JSON.parse(rawText);
    return normalizeConfig(parsed);
  } catch (_) {
    const token = extractTokenFromText(rawText);
    const migrated = normalizeConfig({
      enabled: Boolean(token),
      accessToken: token
    });
    savePushbulletConfig({ configPath, payload: migrated });
    return migrated;
  }
}

module.exports = {
  DEFAULT_PUSHBULLET_CONFIG,
  loadPushbulletConfig,
  savePushbulletConfig
};

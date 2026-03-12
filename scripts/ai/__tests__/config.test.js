const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  loadOpenRouterConfig,
  loadVisionOcrConfig,
  resolveProjectPaths
} = require('../../lib/config');

function createTempProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xhs-config-'));
  fs.mkdirSync(path.join(root, 'config'), { recursive: true });
  return root;
}

test('loadOpenRouterConfig returns defaults when config is missing', () => {
  const projectDir = createTempProject();
  const config = loadOpenRouterConfig({ projectDir });

  assert.equal(config._missing, true);
  assert.equal(config.baseUrl, 'https://openrouter.ai/api/v1');
  assert.equal(config.timeoutMs, 30000);
});

test('loadVisionOcrConfig returns defaults when config is missing', () => {
  const projectDir = createTempProject();
  const config = loadVisionOcrConfig({ projectDir });

  assert.equal(config._missing, true);
  assert.equal(config.fallbackToTesseract, true);
  assert.equal(config.timeoutMs, 60000);
});

test('loadOpenRouterConfig marks invalid json', () => {
  const projectDir = createTempProject();
  const configPath = path.join(projectDir, 'config', 'openrouter.json');
  fs.writeFileSync(configPath, '{invalid', 'utf-8');

  const config = loadOpenRouterConfig({ projectDir });
  assert.equal(config._invalid, true);
  assert.ok(config.error);
});

test('resolveProjectPaths returns default output directory', () => {
  const projectDir = createTempProject();
  const paths = resolveProjectPaths(projectDir);

  assert.equal(paths.outputDir, path.join(projectDir, 'output'));
  assert.equal(paths.configDir, path.join(projectDir, 'config'));
});

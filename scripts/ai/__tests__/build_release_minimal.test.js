const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { build_release_minimal } = require('../../build_release_minimal');
const { createTempDir } = require('./test_tmp');

test('build_release_minimal writes runnable skeleton with sanitized configs', () => {
  const release_root = createTempDir('xhs-release-minimal-');

  build_release_minimal({
    release_root,
    include_node_modules: false,
    prune_node_modules: false
  });

  assert.equal(fs.existsSync(path.join(release_root, 'package.json')), true);
  assert.equal(fs.existsSync(path.join(release_root, 'start_ui.bat')), true);
  assert.equal(fs.existsSync(path.join(release_root, 'README_最小运行版.md')), true);
  assert.equal(fs.existsSync(path.join(release_root, 'ui', 'index.html')), true);
  assert.equal(fs.existsSync(path.join(release_root, 'scripts', 'ui_server.js')), true);
  assert.equal(fs.existsSync(path.join(release_root, 'assets', 'tesseract')), true);
  assert.equal(fs.existsSync(path.join(release_root, 'scripts', 'ai', '__tests__')), false);
  assert.equal(fs.existsSync(path.join(release_root, 'scripts', 'ai', '__tmp__')), false);

  const openrouter_config = JSON.parse(fs.readFileSync(path.join(release_root, 'config', 'openrouter.json'), 'utf-8'));
  const pushbullet_config = JSON.parse(fs.readFileSync(path.join(release_root, 'config', 'pushbullet.json'), 'utf-8'));
  const ui_config = JSON.parse(fs.readFileSync(path.join(release_root, 'config', 'ui.json'), 'utf-8'));
  const start_ui_bat = fs.readFileSync(path.join(release_root, 'start_ui.bat'), 'ascii');

  assert.equal(openrouter_config.apiKey, '');
  assert.equal(pushbullet_config.enabled, false);
  assert.equal(pushbullet_config.accessToken, '');
  assert.equal(ui_config.browser.mode, 'current-browser');
  assert.equal(ui_config.runtime.hasOpenRouterApiKey, false);
  assert.match(start_ui_bat, /if "%XHS_UI_PORT%"=="" \(/);
  assert.match(start_ui_bat, /echo Using port %XHS_UI_PORT%/);
});

test('build_release_minimal keeps prune disabled by default', () => {
  const release_root = createTempDir('xhs-release-minimal-default-');

  const result = build_release_minimal({
    release_root,
    include_node_modules: false
  });

  assert.equal(result.prune_node_modules, false);
});

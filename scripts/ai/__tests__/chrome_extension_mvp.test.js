const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const extensionRoot = path.resolve(__dirname, '..', '..', '..', 'prj', 'chrome-extension');

function readText(relativePath) {
  return fs.readFileSync(path.join(extensionRoot, relativePath), 'utf-8');
}

test('chrome extension manifest defines mv3 popup and service worker', () => {
  const manifest = JSON.parse(readText('manifest.json'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.action.default_popup, 'popup.html');
  assert.equal(manifest.background.service_worker, 'service_worker.js');
  assert.equal(manifest.permissions.includes('tabs'), true);
  assert.equal(manifest.permissions.includes('activeTab'), true);
  assert.equal(manifest.host_permissions.includes('http://127.0.0.1/*'), true);
});

test('chrome extension popup exposes local save, local enqueue, and workbench actions', () => {
  const html = readText('popup.html');
  assert.match(html, /id="save-local"/);
  assert.match(html, /id="enqueue-local"/);
  assert.match(html, /id="open-workbench"/);
  assert.match(html, /id="page-url"/);
});

test('chrome extension popup script targets local ingress endpoints', () => {
  const script = readText('popup.js');
  assert.match(script, /\/api\/ingress\/save-link/);
  assert.match(script, /\/api\/ingress\/enqueue-link/);
  assert.match(script, /chrome\.tabs\.query/);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..', '..', '..');
const html = fs.readFileSync(path.join(projectRoot, 'ui', 'index.html'), 'utf-8');
const css = fs.readFileSync(path.join(projectRoot, 'ui', 'styles.css'), 'utf-8');

test('index.html contains error banner container', () => {
  assert.match(html, /id="error-banner"/);
});

test('styles.css contains error banner styles', () => {
  assert.match(css, /\.error-banner/);
});

test('styles.css contains result empty state styles', () => {
  assert.match(css, /\.result-empty-state/);
  assert.match(css, /\.result-empty-sources/);
});

test('styles.css prioritizes result card before entry stack on mobile', () => {
  assert.match(css, /@media\s*\(max-width:\s*980px\)/);
  assert.match(css, /\.result-card\s*\{\s*order:\s*-1;/);
  assert.match(css, /\.result-empty-state\s*\{\s*min-height:\s*0;/);
});

test('styles.css contains result group action hierarchy styles', () => {
  assert.match(css, /\.result-group-more-toggle/);
  assert.match(css, /\.result-group-more-menu/);
  assert.match(css, /\.result-group-action\.is-primary/);
});

test('styles.css contains result group warning badge styles', () => {
  assert.match(css, /\.result-group-warning-count/);
});

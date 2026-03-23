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

test('styles.css contains paired entry layout styles for entry 02 and 03', () => {
  assert.match(css, /\.entry-secondary-shell/);
  assert.match(css, /\.entry-secondary-header/);
  assert.match(css, /\.entry-secondary-grid/);
  assert.match(css, /\.entry-secondary-card/);
  assert.match(css, /\.button\.button-block/);
  assert.match(css, /grid-template-columns:\s*minmax\(0,\s*0\.9fr\)\s+minmax\(0,\s*1\.1fr\)/);
});

test('styles.css keeps result action buttons on a horizontal toolbar without vertical text wrap', () => {
  assert.match(css, /\.result-head\s*\{[\s\S]*display:\s*grid;/);
  assert.match(css, /\.result-actions\s*\{[\s\S]*justify-content:\s*flex-start;/);
  assert.match(css, /\.result-actions\s+\.button\s*\{[\s\S]*white-space:\s*nowrap;/);
});

test('styles.css adds a compact hero panel and summary shelf', () => {
  assert.match(css, /\.hero-panel/);
  assert.match(css, /\.summary-row\s*\{[\s\S]*padding:/);
  assert.match(css, /\.summary-chip\s*\{[\s\S]*min-height:/);
});

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

test('styles.css contains task log panel styles', () => {
  assert.match(css, /\.task-log-panel/);
  assert.match(css, /\.task-log-list/);
  assert.match(css, /\.task-log-entry/);
  assert.match(css, /\.task-log-entry\[data-level=['"]failed['"]\]/);
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

test('styles.css contains left sidebar workbench layout styles', () => {
  assert.match(css, /\.workspace-layout/);
  assert.match(css, /\.workspace-sidebar/);
  assert.match(css, /\.workspace-nav/);
  assert.match(css, /\.workspace-nav-link/);
  assert.match(css, /\.workspace-nav-link\[data-active=['"]true['"]\]/);
  assert.match(css, /\.workspace-main/);
  assert.match(css, /\.workspace-section/);
  assert.match(css, /grid-template-columns:\s*236px\s+minmax\(0,\s*1\.22fr\)\s+minmax\(300px,\s*0\.82fr\)/);
});

test('styles.css contains collection source switch layout styles', () => {
  assert.match(css, /\.collection-source-switch/);
  assert.match(css, /\.collection-source-button/);
  assert.match(css, /\.collection-source-button\[data-active=['"]true['"]\]/);
  assert.match(css, /\.collection-source-panel/);
  assert.match(css, /\.collection-source-panel\[hidden\]/);
});

test('styles.css contains browser status and task history styles', () => {
  assert.match(css, /\.browser-status-card/);
  assert.match(css, /\.browser-status-summary/);
  assert.match(css, /\.browser-status-pill/);
  assert.match(css, /\.browser-status-pill strong/);
  assert.match(css, /\.browser-status-pill span/);
  assert.match(css, /\.task-history-card/);
  assert.match(css, /\.task-history-list/);
  assert.match(css, /\.task-history-item/);
});

test('styles.css contains video notes workspace card styles', () => {
  assert.match(css, /\.video-notes-card/);
  assert.match(css, /\.video-notes-actions/);
  assert.match(css, /\.video-notes-path/);
});

test('styles.css contains mobile quickbar styles for jump navigation', () => {
  assert.match(css, /\.mobile-quickbar/);
  assert.match(css, /\.mobile-quickbar-link/);
  assert.match(css, /@media\s*\(max-width:\s*980px\)[\s\S]*\.mobile-quickbar/);
});

test('styles.css keeps result action buttons on a horizontal toolbar without vertical text wrap', () => {
  assert.match(css, /\.result-head\s*\{[\s\S]*display:\s*grid;/);
  assert.match(css, /\.result-actions\s*\{[\s\S]*justify-content:\s*flex-start;/);
  assert.match(css, /\.result-actions\s+\.button\s*\{[\s\S]*white-space:\s*nowrap;/);
});

test('styles.css adds a compact hero panel and summary shelf', () => {
  assert.match(css, /\.hero-panel/);
  assert.match(css, /html\s*\{[\s\S]*scroll-behavior:\s*smooth;/);
  assert.match(css, /\.summary-row\s*\{[\s\S]*padding:/);
  assert.match(css, /\.summary-chip\s*\{[\s\S]*min-height:/);
});

test('styles.css contains grouped settings tab layout styles', () => {
  assert.match(css, /\.settings-layout/);
  assert.match(css, /\.settings-tablist/);
  assert.match(css, /\.settings-tab\b/);
  assert.match(css, /\.settings-tab\[data-active=['"]true['"]\]/);
  assert.match(css, /\.settings-panel\[hidden\]/);
  assert.match(css, /\.modal-footer/);
});

test('styles.css collapses settings tab layout on mobile', () => {
  assert.match(css, /@media\s*\(max-width:\s*980px\)[\s\S]*\.settings-layout\s*\{\s*grid-template-columns:\s*1fr;/);
});

test('styles.css collapses sidebar workbench layout on mobile', () => {
  assert.match(css, /@media\s*\(max-width:\s*980px\)[\s\S]*\.workspace-layout\s*\{\s*grid-template-columns:\s*1fr;/);
  assert.match(css, /@media\s*\(max-width:\s*980px\)[\s\S]*\.workspace-sidebar\s*\{[\s\S]*position:\s*static;/);
});

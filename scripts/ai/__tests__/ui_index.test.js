const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..', '..', '..');
const indexPath = path.join(projectRoot, 'ui', 'index.html');

function readIndexHtml() {
  return fs.readFileSync(indexPath, 'utf-8');
}

test('index.html contains external inbox entry card copy', () => {
  const html = readIndexHtml();
  assert.match(html, /入口\s*03/);
  assert.match(html, /外部收件箱|外部入口/);
  assert.match(html, /同步全部/);
  assert.match(html, /收件箱解析保存/);
});

test('index.html keeps inbox workflow inside entry 03 with recent range select', () => {
  const html = readIndexHtml();
  assert.doesNotMatch(html, /id="inbox-sync"/);
  assert.doesNotMatch(html, /id="inbox-sync-all-top"/);
  assert.match(html, /步骤 1/);
  assert.match(html, /同步到收件箱/);
  assert.match(html, /步骤 2/);
  assert.match(html, /收件箱解析保存/);
  assert.match(html, /inbox-sync-range/);
  assert.match(html, /最近 10 条/);
  assert.match(html, /最近 20 条/);
  assert.match(html, /最近 30 条/);
  assert.match(html, /最近 50 条/);
  assert.match(html, /最近 60 条/);
});

test('index.html pairs entry 02 and entry 03 inside a shared action row', () => {
  const html = readIndexHtml();
  const quickEntryIndex = html.indexOf('entry-secondary-shell');
  const manualEntryIndex = html.indexOf('入口 01');
  assert.ok(quickEntryIndex >= 0);
  assert.ok(manualEntryIndex >= 0);
  assert.ok(quickEntryIndex < manualEntryIndex);
  assert.match(html, /entry-secondary-header/);
  assert.match(html, /entry-secondary-grid/);
  assert.match(html, /entry-secondary-card/);
});

test('index.html places summary shelf inside the hero header', () => {
  const html = readIndexHtml();
  const topbarIndex = html.indexOf('class="topbar"');
  const summaryIndex = html.indexOf('id="summary-row"');
  const layoutIndex = html.indexOf('class="layout"');
  assert.ok(topbarIndex >= 0);
  assert.ok(summaryIndex > topbarIndex);
  assert.ok(layoutIndex > summaryIndex);
  assert.match(html, /hero-panel/);
});

test('index.html contains inbox category settings field', () => {
  const html = readIndexHtml();
  assert.match(html, /收件箱分类规则/);
  assert.match(html, /inbox-categories/);
});

test('index.html contains auto classify toggle for link saves', () => {
  const html = readIndexHtml();
  assert.match(html, /自动分类/);
  assert.match(html, /runtime-auto-classify/);
});

test('index.html explains current browser mode boundaries', () => {
  const html = readIndexHtml();
  assert.match(html, /Chrome 146\+/);
  assert.match(html, /评论懒加载|风控|300031|暂时无法浏览/);
});

test('index.html contains project login browser controls for persistent session reuse', () => {
  const html = readIndexHtml();
  assert.match(html, /browser-headless/);
  assert.match(html, /open-login-browser/);
  assert.match(html, /首次请先|登录一次/);
  assert.match(html, /无头|后台/);
});

test('index.html organizes settings into grouped tabs', () => {
  const html = readIndexHtml();
  assert.match(html, /settings-tablist/);
  assert.match(html, /role="tablist"/);
  assert.match(html, /settings-tab-basic/);
  assert.match(html, /settings-tab-browser/);
  assert.match(html, /settings-tab-inbox/);
  assert.match(html, /settings-tab-advanced/);
  assert.match(html, /基础保存/);
  assert.match(html, /浏览器接入/);
  assert.match(html, /外部入口/);
  assert.match(html, /高级参数/);
  assert.match(html, /data-settings-panel="basic"/);
  assert.match(html, /data-settings-panel="browser"/);
  assert.match(html, /data-settings-panel="inbox"/);
  assert.match(html, /data-settings-panel="advanced"/);
});

test('index.html contains result empty state guidance for supported sources', () => {
  const html = readIndexHtml();
  assert.match(html, /还没有执行任务/);
  assert.match(html, /结果区会显示进度、分类、警告与失败重试/);
  assert.match(html, /小红书/);
  assert.match(html, /公众号/);
  assert.match(html, /知乎/);
  assert.match(html, /CSDN/);
});

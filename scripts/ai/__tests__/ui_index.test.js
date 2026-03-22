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

test('index.html contains result empty state guidance for supported sources', () => {
  const html = readIndexHtml();
  assert.match(html, /还没有执行任务/);
  assert.match(html, /结果区会显示进度、分类、警告与失败重试/);
  assert.match(html, /小红书/);
  assert.match(html, /公众号/);
  assert.match(html, /知乎/);
  assert.match(html, /CSDN/);
});

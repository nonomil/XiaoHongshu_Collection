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
  assert.match(html, /外部入口/);
  assert.match(html, /同步最新/);
  assert.match(html, /同步全部/);
  assert.match(html, /收件箱解析保存/);
});

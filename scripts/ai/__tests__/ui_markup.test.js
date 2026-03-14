const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui/ui/index.html', 'utf-8');
const css = fs.readFileSync('G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui/ui/styles.css', 'utf-8');

test('index.html contains error banner container', () => {
  assert.match(html, /id="error-banner"/);
});

test('styles.css contains error banner styles', () => {
  assert.match(css, /\.error-banner/);
});

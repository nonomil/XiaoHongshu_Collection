const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..', '..', '..');
const indexPath = path.join(projectRoot, 'ui', 'index.html');

function readIndexHtml() {
  return fs.readFileSync(indexPath, 'utf-8');
}

test('index.html contains external inbox workspace copy', () => {
  const html = readIndexHtml();
  assert.match(html, /收件箱同步|外部收件箱/);
  assert.match(html, /同步全部/);
  assert.match(html, /收件箱解析保存/);
  assert.match(html, /task-log-panel/);
  assert.match(html, /task-log-list/);
  assert.match(html, /执行日志/);
});

test('index.html keeps inbox workflow inside entry 03 with time-window sync presets and custom range', () => {
  const html = readIndexHtml();
  assert.doesNotMatch(html, /id="inbox-sync"/);
  assert.doesNotMatch(html, /id="inbox-sync-all-top"/);
  assert.match(html, /步骤 1/);
  assert.match(html, /同步到收件箱/);
  assert.match(html, /步骤 2/);
  assert.match(html, /收件箱解析保存/);
  assert.match(html, /name="inbox-sync-window"/);
  assert.match(html, /今天/);
  assert.match(html, /最近 7 天/);
  assert.match(html, /最近 30 天/);
  assert.match(html, /最近 60 天/);
  assert.match(html, /最近 2 个月/);
  assert.match(html, /inbox-sync-custom-value/);
  assert.match(html, /inbox-sync-custom-unit/);
  assert.match(html, /天/);
  assert.match(html, /月/);
  assert.match(html, /年/);
  assert.match(html, /同步所选范围/);
});

test('index.html uses a left sidebar workbench layout', () => {
  const html = readIndexHtml();
  assert.match(html, /workspace-layout/);
  assert.match(html, /workspace-sidebar/);
  assert.match(html, /workspace-nav/);
  assert.match(html, /workspace-main/);
  assert.match(html, /workspace-section/);
  assert.match(html, /工作台导航/);
  assert.match(html, /收藏夹同步/);
  assert.match(html, /收件箱同步/);
  assert.match(html, /链接保存/);
  assert.match(html, /执行结果/);
});

test('index.html updates the page title for multi-source archive workbench', () => {
  const html = readIndexHtml();
  assert.match(html, /<title>多源收藏本地归档工作台<\/title>/);
  assert.match(html, /<h1>多源收藏本地归档工作台<\/h1>/);
  assert.match(html, /小红书收藏夹、知乎收藏夹、收件箱和单条链接/);
});

test('index.html keeps favorites sync unified while exposing Xiaohongshu and Zhihu actions in one section', () => {
  const html = readIndexHtml();
  assert.match(html, /id="section-collection"/);
  assert.match(html, /收藏夹同步/);
  assert.match(html, /collection-source-switch/);
  assert.match(html, /data-collection-source="xiaohongshu"/);
  assert.match(html, /data-collection-source="zhihu"/);
  assert.match(html, /data-collection-panel="xiaohongshu"/);
  assert.match(html, /data-collection-panel="zhihu"/);
  assert.match(html, /小红书收藏/);
  assert.match(html, /知乎收藏夹/);
  assert.match(html, /zhihu-favorites-url/);
  assert.match(html, /zhihu-favorites-title/);
  assert.match(html, /zhihu-favorites-limit/);
  assert.match(html, /zhihu-favorites-submit/);
});

test('index.html contains browser status card and recent task history', () => {
  const html = readIndexHtml();
  assert.match(html, /browser-status-card/);
  assert.match(html, /refresh-browser-status/);
  assert.match(html, /browser-status-summary/);
  assert.match(html, /task-history-card/);
  assert.match(html, /task-history-list/);
  assert.match(html, /最近任务/);
});

test('index.html places summary shelf inside the hero header', () => {
  const html = readIndexHtml();
  const topbarIndex = html.indexOf('class="topbar"');
  const summaryIndex = html.indexOf('id="summary-row"');
  const layoutIndex = html.indexOf('class="workspace-layout"');
  assert.ok(topbarIndex >= 0);
  assert.ok(summaryIndex > topbarIndex);
  assert.ok(layoutIndex > summaryIndex);
  assert.match(html, /hero-panel/);
});

test('index.html adds a quick task bar for mobile jump navigation', () => {
  const html = readIndexHtml();
  assert.match(html, /mobile-quickbar/);
  assert.match(html, /mobile-quickbar-link/);
  assert.match(html, /href="#section-collection"/);
  assert.match(html, /href="#section-video-notes"/);
  assert.match(html, /href="#section-inbox"/);
  assert.match(html, /href="#section-links"/);
  assert.match(html, /快速开始|快捷入口/);
});

test('index.html exposes a dedicated video notes workspace entry', () => {
  const html = readIndexHtml();
  assert.match(html, /id="section-video-notes"/);
  assert.match(html, /视频图文笔记/);
  assert.match(html, /data-video-notes-open-folder/);
  assert.match(html, /data-video-notes-start-web/);
  assert.match(html, /Notes_Video_Collection/);
  assert.match(html, /G:\\UserCode\\XiaoHongshu_Collection\\prj\\Notes_Video_Collection/);
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

test('index.html contains ai api settings and manual test action', () => {
  const html = readIndexHtml();
  assert.match(html, /AI API 地址|OpenRouter \/ OpenAI 兼容地址/);
  assert.match(html, /runtime-openrouter-base-url/);
  assert.match(html, /runtime-openrouter-api-key/);
  assert.match(html, /runtime-openrouter-model/);
  assert.match(html, /runtime-openrouter-test/);
  assert.match(html, /runtime-openrouter-test-status/);
  assert.match(html, /测试 AI API/);
});

test('index.html explains current browser mode boundaries', () => {
  const html = readIndexHtml();
  assert.match(html, /Chrome 146\+/);
  assert.match(html, /单会话更稳|风控边缘/);
  assert.match(html, /不建议同时活跃运行多个项目窗口/);
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

test('index.html includes a sidebar settings trigger in addition to the top action', () => {
  const html = readIndexHtml();
  assert.match(html, /data-open-settings="true"/);
  assert.match(html, /打开设置|设置/);
});

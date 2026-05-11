const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const { spawn } = require('child_process');
const {
  buildSingleNote,
  collectPreparedNoteComments,
  collectNoteCommentDiagnostics,
  connectToChrome,
  expandPreparedNoteComments,
  prepareNoteCommentCollection,
  extractNoteCoreDetail,
  extractNoteDetail,
  extractNoteIdFromUrl,
  getCurrentPageUrl,
  isNoteDetailUrl,
  navigateToUrl,
  send
} = require('./lib/cdp_note');
const { normalizeNoteInput, normalizeNoteInputs } = require('./lib/note_input');
const { processSingleNoteExport } = require('./lib/note_export');
const { runTaskPipeline } = require('./lib/pipeline');
const { classifyInboxNote, defaultInboxCategories } = require('./lib/inbox_classifier');
const {
  assertValidTask,
  buildNoteSaveTask,
  normalizeTaskInput
} = require('./lib/task');
const { resolveNumberEnv, resolveDelayMs, sleep } = require('./lib/async_control');
const {
  CHROME_DEBUG_PORT,
  buildProjectChromeLaunchArgs,
  findChromeExecutable: findProjectChromeExecutable,
  launchProjectChromeSession,
  waitForChromeDebugPort: waitForProjectChromeDebugPort
} = require('./lib/browser_session');
const { createJsonCheckpointStore } = require('./lib/browser_checkpoint_store');
const { resolveProjectPaths } = require('./lib/config');
const { CodexTaskError, classifyTaskError } = require('./lib/errors');
const { runBrowserTaskOrchestrator } = require('./lib/browser_orchestrator');
const { buildTaskSummary, mergeTaskWarnings } = require('./lib/report');
const { detectSourceFromUrl } = require('./lib/source_detector');
const { extractWechatArticleFromHtml, extractWechatArticleFromPage } = require('./lib/sources/wechat_article');
const {
  extractZhihuArticleFromHtml,
  extractZhihuAnswerFromHtml,
  extractZhihuArticleFromPage,
  extractZhihuAnswerFromPage
} = require('./lib/sources/zhihu');
const { extractCsdnArticleFromHtml, extractCsdnArticleFromPage } = require('./lib/sources/csdn');

const PATHS = resolveProjectPaths(path.resolve(__dirname, '..'));
const PROJECT_DIR = PATHS.projectDir;
const OUTPUT_DIR = PATHS.outputDir;
const IMG_DIR = path.join(OUTPUT_DIR, '_images');
const CONFIG_PATH = path.join(PATHS.configDir, 'openrouter.json');
const CHROME_DEBUG_URL = 'http://localhost:9222/json';
const DEFAULT_BROWSER_TASK_CHECKPOINT_DIR = path.join(PATHS.cacheDir, 'browser-task-checkpoints');
const DEFAULT_NOTE_THROTTLE_MS = 2500;
const DEFAULT_NOTE_THROTTLE_JITTER_MS = 1200;
const DEFAULT_VIDEO_NOTES_PROJECT_DIR = path.join(PROJECT_DIR, 'prj', 'Notes_Video_Collection');
const DEFAULT_VIDEO_NOTES_CLI_DIR = path.join(DEFAULT_VIDEO_NOTES_PROJECT_DIR, 'prj');
const DEFAULT_VIDEO_NOTES_PYTHON_EXE = path.join(DEFAULT_VIDEO_NOTES_CLI_DIR, '.venv', 'Scripts', 'python.exe');
const DEFAULT_VIDEO_NOTES_OUTPUT_DIRNAME = '视频图文笔记';

function isVideoNoteType(value) {
  return String(value || '').trim().toLowerCase() === 'video';
}

function resolveVideoNoteSourceUrl(note, mode) {
  const candidates = [
    note?.canonicalUrl,
    note?.noteUrl,
    mode?.canonicalUrl,
    getNavigationUrl(mode),
    note?.sourceUrl
  ];
  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (value) return value;
  }
  return '';
}

function shouldUseVideoNoteProject(note, mode) {
  const sourceType = String(note?.sourceType || '').trim();
  const sourceUrl = resolveVideoNoteSourceUrl(note, mode);
  const resolvedSourceType = sourceType || detectSourceFromUrl(sourceUrl);
  if (resolvedSourceType !== 'xiaohongshu') {
    return false;
  }
  if (isVideoNoteType(note?.noteType || note?.note_type)) {
    return true;
  }
  return note?.hasVideoMedia === true || note?.has_video_media === true;
}

function buildVideoNoteOutputRoot(outputRoot) {
  const baseOutputRoot = path.resolve(String(outputRoot || OUTPUT_DIR).trim() || OUTPUT_DIR);
  return path.join(baseOutputRoot, DEFAULT_VIDEO_NOTES_OUTPUT_DIRNAME);
}

function listDirectoryChildren(rootDir) {
  if (!rootDir || !fs.existsSync(rootDir)) return [];
  return fs.readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(rootDir, entry.name));
}

function pickNewestDirectory(directories) {
  const list = directories
    .filter((value) => value && fs.existsSync(value))
    .map((value) => ({
      dirpath: path.normalize(value),
      mtimeMs: fs.statSync(value).mtimeMs
    }))
    .sort((left, right) => right.mtimeMs - left.mtimeMs);
  return list[0]?.dirpath || '';
}

function resolveGeneratedVideoOutputDir({ stdout, outputRoot, beforeDirectories }) {
  const outputText = String(stdout || '');
  for (const line of outputText.split(/\r?\n/)) {
    const match = line.match(/已生成输出目录[:：]\s*(.+)$/);
    if (!match) continue;
    const candidate = path.normalize(match[1].trim());
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  const beforeSet = new Set((Array.isArray(beforeDirectories) ? beforeDirectories : []).map((value) => path.normalize(value)));
  const afterDirectories = listDirectoryChildren(outputRoot).map((value) => path.normalize(value));
  const addedDirectories = afterDirectories.filter((value) => !beforeSet.has(value));
  if (addedDirectories.length === 1) {
    return addedDirectories[0];
  }
  if (addedDirectories.length > 1) {
    return pickNewestDirectory(addedDirectories);
  }
  return pickNewestDirectory(afterDirectories);
}

function findVideoMarkdownFile(outputDir) {
  if (!outputDir || !fs.existsSync(outputDir)) return '';
  const entries = fs.readdirSync(outputDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
    .map((entry) => path.join(outputDir, entry.name))
    .sort((left, right) => left.localeCompare(right, 'zh-CN'));
  return entries[0] || '';
}

function runSpawnedCommand(command, args, options = {}) {
  const spawnFn = typeof options.spawnFn === 'function' ? options.spawnFn : spawn;
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnFn(command, args, {
        cwd: options.cwd,
        env: options.env,
        shell: false,
        windowsHide: true
      });
    } catch (error) {
      reject(error);
      return;
    }

    let stdout = '';
    let stderr = '';
    if (child.stdout && typeof child.stdout.on === 'function') {
      child.stdout.on('data', (chunk) => {
        stdout += String(chunk);
      });
    }
    if (child.stderr && typeof child.stderr.on === 'function') {
      child.stderr.on('data', (chunk) => {
        stderr += String(chunk);
      });
    }
    child.once('error', reject);
    child.once('close', (code) => {
      resolve({
        code: Number(code || 0),
        stdout,
        stderr
      });
    });
  });
}

async function exportVideoNoteWithProject({
  note,
  mode,
  outputRoot,
  projectDir = DEFAULT_VIDEO_NOTES_PROJECT_DIR,
  cliDir = DEFAULT_VIDEO_NOTES_CLI_DIR,
  pythonExe = DEFAULT_VIDEO_NOTES_PYTHON_EXE,
  spawnFn,
  env
} = {}) {
  const resolvedProjectDir = path.resolve(String(projectDir || DEFAULT_VIDEO_NOTES_PROJECT_DIR).trim() || DEFAULT_VIDEO_NOTES_PROJECT_DIR);
  const resolvedCliDir = path.resolve(String(cliDir || path.join(resolvedProjectDir, 'prj')).trim() || path.join(resolvedProjectDir, 'prj'));
  const resolvedPythonExe = path.resolve(String(pythonExe || path.join(resolvedCliDir, '.venv', 'Scripts', 'python.exe')).trim() || path.join(resolvedCliDir, '.venv', 'Scripts', 'python.exe'));
  if (!fs.existsSync(resolvedProjectDir)) {
    throw new Error(`视频图文笔记项目目录不存在：${resolvedProjectDir}`);
  }
  if (!fs.existsSync(resolvedCliDir)) {
    throw new Error(`视频图文笔记 CLI 目录不存在：${resolvedCliDir}`);
  }
  if (!fs.existsSync(resolvedPythonExe)) {
    throw new Error(`视频图文笔记项目未安装运行环境：${resolvedPythonExe}。请先进入 ${resolvedCliDir} 执行 python -m venv .venv，并运行 .venv\\Scripts\\python -m pip install -e .[dev,asr,media,web]。`);
  }

  const sourceUrl = resolveVideoNoteSourceUrl(note, mode);
  if (!sourceUrl) {
    throw new Error('视频笔记缺少可用链接，无法转交到视频图文笔记项目。');
  }

  const videoOutputRoot = buildVideoNoteOutputRoot(outputRoot);
  fs.mkdirSync(videoOutputRoot, { recursive: true });
  const beforeDirectories = listDirectoryChildren(videoOutputRoot);
  const result = await runSpawnedCommand(
    resolvedPythonExe,
    ['-m', 'video_summary_cli.cli', 'summarize', '--url', sourceUrl, '--output-dir', videoOutputRoot],
    {
      cwd: resolvedCliDir,
      spawnFn,
      env: {
        ...process.env,
        ...env,
        PYTHONPATH: [
          path.join(resolvedCliDir, 'src'),
          String(env?.PYTHONPATH || process.env.PYTHONPATH || '').trim()
        ].filter(Boolean).join(path.delimiter),
        PYTHONIOENCODING: 'utf-8'
      }
    }
  );
  if (result.code !== 0) {
    const detail = [String(result.stderr || '').trim(), String(result.stdout || '').trim()].filter(Boolean).join('\n');
    throw new Error(`视频图文笔记项目执行失败：${detail || `退出码 ${result.code}`}`);
  }

  const outputFolder = resolveGeneratedVideoOutputDir({
    stdout: result.stdout,
    outputRoot: videoOutputRoot,
    beforeDirectories
  });
  if (!outputFolder) {
    throw new Error('视频图文笔记项目已执行，但未定位到输出目录。');
  }

  return {
    filepath: findVideoMarkdownFile(outputFolder) || outputFolder,
    outputFolder,
    platform: String(note?.platform || 'xiaohongshu').trim() || 'xiaohongshu',
    sourceType: 'xiaohongshu_video',
    noteType: 'video'
  };
}

function normalizeBrowserMode(value) {
  const mode = String(value || '').trim();
  if (!mode) return '';
  if (mode === 'isolated' || mode === 'current-browser') {
    return mode;
  }
  throw new Error('Unsupported browser mode: expected isolated or current-browser');
}

function normalizeBrowserChannel(value) {
  const channel = String(value || '').trim();
  if (!channel) return '';
  if (channel === 'stable' || channel === 'beta' || channel === 'canary') {
    return channel;
  }
  throw new Error('Unsupported browser channel: expected stable, beta, or canary');
}

function normalizeBrowserHeadless(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return undefined;
  if (['1', 'true', 'yes', 'on', 'headless'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off', 'headed'].includes(normalized)) {
    return false;
  }

  throw new Error('Unsupported browser headless flag: expected true or false');
}

function normalizeBrowserOptions(value) {
  const input = value && typeof value === 'object' ? value : {};
  const browser = {};

  if (Object.prototype.hasOwnProperty.call(input, 'mode')) {
    const mode = normalizeBrowserMode(input.mode);
    if (mode) browser.mode = mode;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'channel')) {
    const channel = normalizeBrowserChannel(input.channel);
    if (channel) browser.channel = channel;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'browserUrl')) {
    const browserUrl = String(input.browserUrl || '').trim();
    if (browserUrl) browser.browserUrl = browserUrl;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'wsEndpoint')) {
    const wsEndpoint = String(input.wsEndpoint || '').trim();
    if (wsEndpoint) browser.wsEndpoint = wsEndpoint;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'headless')) {
    const headless = normalizeBrowserHeadless(input.headless);
    if (typeof headless === 'boolean') browser.headless = headless;
  }

  return Object.keys(browser).length > 0 ? browser : undefined;
}

function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv.filter(Boolean) : [];
  const browser = {};
  const positional = [];
  let current = false;

  const readOptionValue = (label, index) => {
    const next = args[index + 1];
    if (!next || next.startsWith('--')) {
      throw new Error(`Missing value for ${label}`);
    }
    return next;
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--current') {
      current = true;
      continue;
    }
    if (arg === '--browser-mode') {
      browser.mode = normalizeBrowserMode(readOptionValue(arg, index));
      index += 1;
      continue;
    }
    if (arg.startsWith('--browser-mode=')) {
      browser.mode = normalizeBrowserMode(arg.slice('--browser-mode='.length));
      continue;
    }
    if (arg === '--browser-channel') {
      browser.channel = normalizeBrowserChannel(readOptionValue(arg, index));
      index += 1;
      continue;
    }
    if (arg.startsWith('--browser-channel=')) {
      browser.channel = normalizeBrowserChannel(arg.slice('--browser-channel='.length));
      continue;
    }
    if (arg === '--browser-url') {
      browser.browserUrl = String(readOptionValue(arg, index) || '').trim();
      index += 1;
      continue;
    }
    if (arg.startsWith('--browser-url=')) {
      browser.browserUrl = String(arg.slice('--browser-url='.length) || '').trim();
      continue;
    }
    if (arg === '--ws-endpoint') {
      browser.wsEndpoint = String(readOptionValue(arg, index) || '').trim();
      index += 1;
      continue;
    }
    if (arg.startsWith('--ws-endpoint=')) {
      browser.wsEndpoint = String(arg.slice('--ws-endpoint='.length) || '').trim();
      continue;
    }
    if (arg === '--browser-headless') {
      browser.headless = true;
      continue;
    }
    if (arg === '--browser-headed') {
      browser.headless = false;
      continue;
    }

    positional.push(arg);
  }

  const normalizedBrowser = normalizeBrowserOptions(browser);
  if (current && positional.length === 0) {
    return normalizedBrowser ? { mode: 'current', browser: normalizedBrowser } : { mode: 'current' };
  }

  if (positional.length >= 1) {
    const parsed = { mode: 'input', input: positional.join(' ') };
    if (normalizedBrowser) {
      parsed.browser = normalizedBrowser;
    }
    return parsed;
  }

  throw new Error('Usage: node scripts/save_note.js <url|share_text> | --current');
}

function buildTaskFromParsed(parsed, source = 'cli') {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid parsed input');
  }

  if (parsed.mode === 'current') {
    return buildNoteSaveTask({ mode: 'current', source });
  }

  if (parsed.mode === 'input') {
    const rawInput = Array.isArray(parsed.input)
      ? parsed.input.join('\n')
      : parsed.input;
    return buildNoteSaveTask({
      input: normalizeTaskInput(rawInput),
      source
    });
  }

  throw new Error('Unsupported save note input');
}

function taskToParsed(task) {
  const valid = assertValidTask(task);
  if (valid.type !== 'note-save') {
    throw new Error('Unsupported task type for save note');
  }

  if (valid.options?.mode === 'current') {
    return { mode: 'current' };
  }

  return { mode: 'input', input: valid.input };
}

function buildChromeDebugHelp() {
  return [
    'Chrome remote debugging is not available on port 9222.',
    'If this is your first run, open the project login browser once:',
    'node scripts/login_browser.js',
    'Start Chrome with remote debugging enabled, for example:',
    'chrome.exe --remote-debugging-port=9222 --user-data-dir=%TEMP%\\codex-chrome-debug',
    `Then keep a Xiaohongshu note tab open and re-run the command. (${CHROME_DEBUG_URL})`,
    'On Chrome 146+, you can also enable chrome://inspect/#remote-debugging and re-run with --browser-mode current-browser.'
  ].join(' ');
}

function shouldAutoLaunchChrome(mode) {
  const browser = mode && mode.browser && typeof mode.browser === 'object' ? mode.browser : {};
  if (!mode || mode.mode !== 'url') return false;
  if (browser.mode === 'current-browser') return false;
  if (browser.browserUrl || browser.wsEndpoint) return false;
  return true;
}

function buildChromeRecoveryMode(mode) {
  if (!mode || mode.mode !== 'url') return null;
  if (shouldAutoLaunchChrome(mode)) {
    return mode;
  }

  const browser = normalizeBrowserOptions(mode?.browser);
  if (!browser || browser.mode !== 'current-browser') {
    return null;
  }
  if (browser.browserUrl || browser.wsEndpoint) {
    return null;
  }

  return {
    ...mode,
    browser: {
      ...browser,
      mode: 'isolated',
      browserUrl: '',
      wsEndpoint: ''
    }
  };
}

function buildChromeLaunchArgs({
  debugPort = CHROME_DEBUG_PORT,
  userDataDir,
  url,
  headless = false
}) {
  return buildProjectChromeLaunchArgs({
    debugPort,
    userDataDir,
    url,
    headless
  });
}

function normalizeBrowserJsonUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return CHROME_DEBUG_URL;
  if (/^wss?:\/\//i.test(raw)) {
    throw new Error('Browser URL must be an http(s) DevTools endpoint, not a websocket endpoint');
  }
  const normalized = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  return /\/json(?:\/list)?$/i.test(normalized)
    ? normalized
    : `${normalized.replace(/\/+$/, '')}/json`;
}

function fetchDebuggerTabs(browserJsonUrl) {
  return new Promise((resolve, reject) => {
    const target = new URL(normalizeBrowserJsonUrl(browserJsonUrl));
    const client = target.protocol === 'https:' ? https : http;
    client.get(target, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(Array.isArray(parsed) ? parsed : []);
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

function normalizeComparableDebuggerUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    return `${parsed.origin}${parsed.pathname}${parsed.search}`.replace(/\/+$/, '');
  } catch (_) {
    return raw.replace(/\/+$/, '');
  }
}

function isDebuggerPageTab(tab) {
  return Boolean(tab && tab.type === 'page' && tab.webSocketDebuggerUrl);
}

function matchesDebuggerPageUrl(tabUrl, pageUrl) {
  const current = normalizeComparableDebuggerUrl(tabUrl);
  const target = normalizeComparableDebuggerUrl(pageUrl);
  if (!current || !target) return false;
  if (current === target) return true;
  return current.startsWith(target) || target.startsWith(current);
}

function selectMatchingDebuggerTab(tabs, { pageUrl, sourceType, noteId } = {}) {
  const list = Array.isArray(tabs) ? tabs.filter(isDebuggerPageTab) : [];
  const directMatches = list.filter((tab) => matchesDebuggerPageUrl(tab.url, pageUrl));
  if (directMatches.length > 0) {
    return directMatches.at(-1) || null;
  }

  const expectedNoteId = String(noteId || extractNoteIdFromUrl(pageUrl) || '').trim();
  if (sourceType === 'xiaohongshu' && expectedNoteId) {
    const noteMatches = list.filter((tab) => {
      const currentUrl = String(tab.url || '').trim();
      if (detectSourceFromUrl(currentUrl) !== 'xiaohongshu') return false;
      if (!isNoteDetailUrl(currentUrl)) return false;
      return extractNoteIdFromUrl(currentUrl) === expectedNoteId;
    });
    if (noteMatches.length > 0) {
      return noteMatches.at(-1) || null;
    }
  }

  return null;
}

function resolveClassificationCategories(categories) {
  if (
    categories &&
    typeof categories === 'object' &&
    !Array.isArray(categories) &&
    Object.keys(categories).length > 0
  ) {
    return categories;
  }
  return defaultInboxCategories();
}

function createAutoClassificationResolver(options = {}) {
  if (options.uiRuntime?.autoClassifyLinksEnabled !== true) {
    return undefined;
  }

  const categories = resolveClassificationCategories(options.classificationCategories);
  return ({ note, content, summary, tags }) => {
    const resolved = classifyInboxNote({
      title: note?.title || '',
      content: [summary, content].filter(Boolean).join('\n'),
      tags: Array.isArray(tags) ? tags : []
    }, categories);

    return resolved === '未分类' ? '' : resolved;
  };
}

async function resolveWsEndpointForUrl({ browserUrl, pageUrl, sourceType, noteId }) {
  const tabs = await fetchDebuggerTabs(browserUrl);
  const match = selectMatchingDebuggerTab(tabs, {
    pageUrl,
    sourceType,
    noteId
  });
  return match?.webSocketDebuggerUrl || '';
}

function extractTargetIdFromWsEndpoint(wsEndpoint) {
  const raw = String(wsEndpoint || '').trim();
  if (!raw) return '';

  try {
    const parsed = new URL(raw);
    const match = parsed.pathname.match(/\/devtools\/page\/([^/?#]+)/i);
    return match ? decodeURIComponent(match[1]) : '';
  } catch (_) {
    const match = raw.match(/\/devtools\/page\/([^/?#]+)/i);
    return match ? decodeURIComponent(match[1]) : '';
  }
}

async function closePageTarget({ browserUrl, wsEndpoint }) {
  const targetId = extractTargetIdFromWsEndpoint(wsEndpoint);
  if (!targetId) return false;

  const closeUrl = new URL(normalizeBrowserJsonUrl(browserUrl).replace(
    /\/json(?:\/list)?$/i,
    `/json/close/${encodeURIComponent(targetId)}`
  ));
  const client = closeUrl.protocol === 'https:' ? https : http;

  return new Promise((resolve) => {
    const req = client.get(closeUrl, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
  });
}

function formatSaveNoteError(error) {
  const info = classifyTaskError(error);
  const message = info.message || 'Unknown save note error';

  if (info.code === 'chrome_unavailable') {
    return `${message}. ${buildChromeDebugHelp()}`;
  }

  if (info.code === 'no_xiaohongshu_tab') {
    return `${message}. 请先在同一个 Chrome 实例中打开至少一个小红书笔记标签页，再重试。`;
  }

  if (info.code === 'not_note_detail') {
    return `${message}. 请先切到小红书笔记详情页，再使用 --current 或当前浏览器接管模式重试。`;
  }

  if (info.code === 'note_unavailable') {
    return `${message}. 这条笔记当前可能仅 App 可见或网页端受限；请先在小红书 App 内确认，或稍后重试。`;
  }

  return message;
}

function isChromeUnavailableError(error) {
  return classifyTaskError(error).code === 'chrome_unavailable';
}

function isNoXiaohongshuTabError(error) {
  return classifyTaskError(error).code === 'no_xiaohongshu_tab';
}

function resolveBrowserRecoveryMode(error, mode) {
  if (isChromeUnavailableError(error)) {
    return buildChromeRecoveryMode(mode) || (shouldAutoLaunchChrome(mode) ? mode : null);
  }
  if (isNoXiaohongshuTabError(error)) {
    return buildChromeRecoveryMode(mode);
  }
  return null;
}

function closeChromeConnectionQuietly(ws) {
  if (!ws || typeof ws.close !== 'function') return;
  try {
    ws.close();
  } catch (_) {
    // ignore socket close failures during browser recovery
  }
}

function getNavigationUrl(mode) {
  if (!mode || mode.mode === 'current') return '';
  return mode.navigationUrl || mode.extractedUrl || mode.canonicalUrl || '';
}

function findChromeExecutable() {
  return findProjectChromeExecutable();
}

function waitForChromeDebugPort({
  attempts = 20,
  intervalMs = 500
} = {}) {
  return waitForProjectChromeDebugPort({
    debugPort: CHROME_DEBUG_PORT,
    attempts,
    intervalMs
  });
}

async function launchChromeForMode(mode) {
  if (!shouldAutoLaunchChrome(mode)) {
    return false;
  }
  const browser = normalizeBrowserOptions(mode?.browser);
  const targetUrl = getNavigationUrl(mode) || 'https://www.xiaohongshu.com/explore';
  await launchProjectChromeSession({
    url: targetUrl,
    browser: {
      channel: browser?.channel || '',
      headless: browser?.headless === true
    },
    debugPort: CHROME_DEBUG_PORT
  });
  return true;
}

function resolveRedirect(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        resolve(res.headers.location || url);
        return;
      }
      resolve(url);
    }).on('error', reject);
  });
}

function buildUrlMode(normalized, overrides = {}) {
  return {
    mode: 'url',
    ...normalized,
    ...overrides,
    navigationUrl: overrides.navigationUrl || normalized.extractedUrl || normalized.canonicalUrl
  };
}

function buildDirectUrlMode(url, sourceType) {
  const value = String(url || '').trim();
  return {
    mode: 'url',
    input: value,
    extractedUrl: value,
    canonicalUrl: value,
    navigationUrl: value,
    sourceType
  };
}

function extractGenericUrls(text) {
  return (String(text || '').match(/https?:\/\/[^\s"'<>]+/g) || [])
    .map((value) => String(value || '').replace(/[),，。！？；]+$/g, '').trim())
    .filter(Boolean);
}

function resolveModeContentSourceType(mode) {
  if (!mode || typeof mode !== 'object') return 'generic_web';

  const explicit = String(mode.sourceType || '').trim();
  if (explicit && explicit !== 'url' && explicit !== 'share_text') {
    return explicit;
  }

  const candidates = [
    mode.navigationUrl,
    mode.extractedUrl,
    mode.canonicalUrl,
    mode.input
  ];

  for (const value of candidates) {
    const detected = detectSourceFromUrl(value);
    if (detected !== 'generic_web') {
      return detected;
    }
  }

  return explicit || 'generic_web';
}

function ensureSinglePageSourceType(sourceType) {
  if (sourceType === 'zhihu_collection') {
    throw new Error('知乎收藏夹链接需要使用专用导出流程，当前单篇保存暂不支持。');
  }
}

function extractArticleFromHtml({ url, html, sourceType }) {
  switch (sourceType) {
    case 'wechat_article':
      return extractWechatArticleFromHtml({ url, html });
    case 'zhihu_article':
      return extractZhihuArticleFromHtml({ url, html });
    case 'zhihu_answer':
      return extractZhihuAnswerFromHtml({ url, html });
    case 'csdn_article':
      return extractCsdnArticleFromHtml({ url, html });
    default:
      throw new Error(`Unsupported source type: ${sourceType}`);
  }
}

async function extractArticleFromPage({ ws, url, sourceType, sendFn = send }) {
  switch (sourceType) {
    case 'wechat_article':
      return extractWechatArticleFromPage(ws, { sendFn, url });
    case 'zhihu_article':
      return extractZhihuArticleFromPage(ws, { sendFn, url });
    case 'zhihu_answer':
      return extractZhihuAnswerFromPage(ws, { sendFn, url });
    case 'csdn_article':
      return extractCsdnArticleFromPage(ws, { sendFn, url });
    default:
      throw new Error(`Unsupported source type: ${sourceType}`);
  }
}

async function readCurrentPageSnapshot(ws) {
  const result = await send(ws, 'Runtime.evaluate', {
    expression: `(() => ({
      title: document.title || '',
      html: document.documentElement ? document.documentElement.outerHTML : ''
    }))()`,
    returnByValue: true
  });
  return result?.result?.value || { title: '', html: '' };
}

async function waitForPageUrl(ws, expectedUrl, {
  attempts = 20,
  intervalMs = 500,
  getCurrentPageUrlFn = getCurrentPageUrl,
  wait = sleep
} = {}) {
  const target = String(expectedUrl || '').trim();
  let lastUrl = '';

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await wait(intervalMs);
    lastUrl = String(await getCurrentPageUrlFn(ws) || '').trim();
    if (!target || lastUrl === target || lastUrl.startsWith(target)) {
      return lastUrl;
    }
  }

  return lastUrl;
}

async function navigateGenericPage(ws, url, options = {}) {
  await send(ws, 'Page.navigate', { url });
  await (options.wait || sleep)(options.initialDelayMs || 1200);
  return waitForPageUrl(ws, url, options);
}

function getArticleReadySelector(sourceType) {
  switch (sourceType) {
    case 'wechat_article':
      return '#js_content';
    case 'zhihu_article':
      return '.Post-RichTextContainer';
    case 'zhihu_answer':
      return '.AnswerItem .RichContent, .AnswerItem';
    case 'csdn_article':
      return '#content_views';
    default:
      return 'body';
  }
}

async function waitForArticlePageReady(ws, sourceType, {
  attempts = 20,
  intervalMs = 500,
  wait = sleep,
  sendFn = send
} = {}) {
  const selector = getArticleReadySelector(sourceType);
  let stableRounds = 0;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await wait(intervalMs);
    const result = await sendFn(ws, 'Runtime.evaluate', {
      expression: `(() => JSON.stringify({
        readyState: document.readyState || '',
        title: document.title || '',
        hasRoot: !!document.querySelector(${JSON.stringify(selector)})
      }))()`,
      returnByValue: true
    });
    const state = JSON.parse(result?.result?.value || '{}');
    if (
      state.readyState === 'complete' &&
      state.hasRoot &&
      String(state.title || '').trim()
    ) {
      stableRounds += 1;
      if (stableRounds >= 2) {
        await wait(intervalMs);
        return state;
      }
      continue;
    }
    stableRounds = 0;
  }

  return { readyState: '', title: '', hasRoot: false };
}

async function resolveInputMode(input, { resolveRedirectFn = resolveRedirect } = {}) {
  const directInput = String(input?.extractedUrl || input?.input || '').trim();
  const directSource = detectSourceFromUrl(directInput);

  if (directSource !== 'generic_web' && directSource !== 'xiaohongshu') {
    return buildDirectUrlMode(directInput, directSource);
  }

  if (input.noteId) {
    return buildUrlMode(input);
  }

  const navigationUrl = input.extractedUrl || input.input || '';
  if (!/xhslink\.com/i.test(navigationUrl)) {
    throw new Error('Unsupported note input: expected a Xiaohongshu note URL or share text');
  }

  const redirectedUrl = await resolveRedirectFn(navigationUrl);
  const normalized = normalizeNoteInput(redirectedUrl);
  return buildUrlMode(normalized, {
    sourceType: input.sourceType || 'share_text',
    navigationUrl
  });
}

async function resolveRunModes(parsed, options = {}) {
  const browser = normalizeBrowserOptions(parsed?.browser || options.browser);
  if (parsed.mode === 'current') {
    return [browser ? { mode: 'current', browser } : { mode: 'current' }];
  }
  let candidates;
  try {
    candidates = normalizeNoteInputs(parsed.input);
  } catch (_) {
    const genericUrls = extractGenericUrls(parsed.input);
    candidates = genericUrls.length > 0
      ? genericUrls.map((url) => ({
        input: url,
        extractedUrl: url,
        sourceType: detectSourceFromUrl(url)
      }))
      : [{
        input: parsed.input,
        extractedUrl: parsed.input,
        sourceType: detectSourceFromUrl(parsed.input)
      }];
  }
  const seen = new Set();
  const modes = [];

  for (const candidate of candidates) {
    const mode = await resolveInputMode(candidate, options);
    const dedupeKey = mode.noteId
      ? `note:${mode.noteId}`
      : `nav:${getNavigationUrl(mode)}`;

    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    modes.push(browser ? { ...mode, browser } : mode);
  }

  return modes;
}

async function resolveRunMode(parsed, options = {}) {
  const modes = await resolveRunModes(parsed, options);
  if (modes.length === 0) {
    throw new Error('Unsupported note input: expected a Xiaohongshu note URL or share text');
  }
  return modes[0];
}

async function fetchPageForMode(mode, options = {}) {
  const connectToChromeFn = options.connectToChromeFn || connectToChrome;
  const getCurrentPageUrlFn = options.getCurrentPageUrlFn || getCurrentPageUrl;
  const navigateToUrlFn = options.navigateToUrlFn || navigateToUrl;
  const navigateGenericPageFn = options.navigateGenericPageFn || navigateGenericPage;
  const waitForArticlePageReadyFn = options.waitForArticlePageReadyFn || waitForArticlePageReady;
  const resolveWsEndpointForUrlFn = options.resolveWsEndpointForUrlFn || resolveWsEndpointForUrl;
  const closePageTargetFn = options.closePageTargetFn || closePageTarget;
  const extractNoteDetailFn = options.extractNoteDetailFn || extractNoteDetail;
  const readCurrentPageSnapshotFn = options.readCurrentPageSnapshotFn;
  const browser = normalizeBrowserOptions(mode?.browser);
  const activeBrowserUrl = browser?.browserUrl || CHROME_DEBUG_URL;
  const targetUrl = getNavigationUrl(mode);
  const targetSourceType = mode.mode === 'current'
    ? detectSourceFromUrl(targetUrl)
    : resolveModeContentSourceType(mode);
  ensureSinglePageSourceType(targetSourceType);
  const requireXiaohongshu = mode.mode !== 'current' &&
    targetSourceType === 'xiaohongshu' &&
    browser?.mode === 'current-browser';
  let directArticleWsEndpoint = '';

  if (
    mode.mode !== 'current' &&
    targetSourceType !== 'xiaohongshu' &&
    targetSourceType !== 'generic_web' &&
    !browser?.wsEndpoint
  ) {
    directArticleWsEndpoint = await resolveWsEndpointForUrlFn({
      browserUrl: browser?.browserUrl || CHROME_DEBUG_URL,
      pageUrl: targetUrl
    });
  }

  let ws = await connectToChromeFn({
    requireXiaohongshu,
    browserMode: browser?.mode,
    browserUrl: browser?.browserUrl,
    browserChannel: browser?.channel,
    wsEndpoint: browser?.wsEndpoint || directArticleWsEndpoint
  });

  try {
    const loadArticlePage = async (activeWs, pageUrl, sourceType) => {
      if (options.readCurrentPageSnapshotFn) {
        const snapshot = await readCurrentPageSnapshotFn(activeWs, { url: pageUrl, sourceType, mode });
        return extractArticleFromHtml({
          url: pageUrl,
          html: snapshot?.html || '',
          sourceType
        });
      }
      return extractArticleFromPage({ ws: activeWs, url: pageUrl, sourceType, sendFn: options.sendFn || send });
    };

    if (mode.mode === 'current') {
      const currentUrl = await getCurrentPageUrlFn(ws);
      const sourceType = detectSourceFromUrl(currentUrl);
      ensureSinglePageSourceType(sourceType);
      if (sourceType === 'xiaohongshu') {
        if (!isNoteDetailUrl(currentUrl)) {
          throw new Error('Current tab is not a Xiaohongshu note detail page');
        }

        const detail = await extractNoteDetailFn(ws);
        const noteId = extractNoteIdFromUrl(currentUrl);
        return buildSingleNote({ detail, noteId, account: {} });
      }

      if (sourceType === 'generic_web') {
        throw new Error('Current tab is not a supported page');
      }

      return await loadArticlePage(ws, currentUrl, sourceType);
    }

    const sourceType = targetSourceType;

    if (sourceType === 'xiaohongshu') {
      await navigateToUrlFn(ws, targetUrl);
      let currentUrl = String(await getCurrentPageUrlFn(ws) || '').trim();
      const locatedTarget = await validateLocatedNavigationTargetWithRecovery(mode, currentUrl, {
        activeWs: ws,
        observation: {
          target_strategy: browser?.mode === 'current-browser' ? 'current_browser_attach' : 'navigate_after_launch'
        },
        connectToChromeFn,
        getCurrentPageUrlFn,
        resolveWsEndpointForUrlFn
      });
      currentUrl = locatedTarget.currentUrl;
      if (locatedTarget.replaced && locatedTarget.ws && locatedTarget.ws !== ws) {
        ws.close();
        ws = locatedTarget.ws;
      }
      const detail = await extractNoteDetailFn(ws);
      return buildSingleNote({
        detail,
        noteId: mode.noteId || extractNoteIdFromUrl(currentUrl),
        account: {}
      });
    }

    if (sourceType === 'generic_web') {
      throw new Error('Current tab is not a supported page');
    }

    if (directArticleWsEndpoint) {
      const attachedUrl = String(await getCurrentPageUrlFn(ws) || '').trim() || targetUrl;
      await waitForArticlePageReadyFn(ws, sourceType, {
        wait: options.wait || sleep,
        sendFn: options.sendFn || send
      });
      return await loadArticlePage(ws, attachedUrl, sourceType);
    }

    const finalUrl = await navigateGenericPageFn(ws, targetUrl, {
      getCurrentPageUrlFn,
      wait: options.wait || sleep
    });
    let articleWs = ws;
    let reattachedWs = null;
    let temporaryArticleWsEndpoint = '';
    let attachedUrl = finalUrl || getNavigationUrl(mode);
    try {
      ws.close();
      await (options.wait || sleep)(300);
      const resolvedWsEndpoint = await resolveWsEndpointForUrlFn({
        browserUrl: activeBrowserUrl,
        pageUrl: finalUrl || getNavigationUrl(mode)
      });
      if (resolvedWsEndpoint) {
        reattachedWs = await connectToChromeFn({ wsEndpoint: resolvedWsEndpoint });
        articleWs = reattachedWs;
        if (browser?.mode !== 'current-browser') {
          temporaryArticleWsEndpoint = resolvedWsEndpoint;
        }
      }
      attachedUrl = String(await getCurrentPageUrlFn(articleWs) || '').trim() || attachedUrl;
      await waitForArticlePageReadyFn(articleWs, sourceType, {
        wait: options.wait || sleep,
        sendFn: options.sendFn || send
      });
      return await loadArticlePage(articleWs, attachedUrl, sourceType);
    } finally {
      if (temporaryArticleWsEndpoint) {
        await closePageTargetFn({
          browserUrl: activeBrowserUrl,
          wsEndpoint: temporaryArticleWsEndpoint
        });
      }
      if (reattachedWs) {
        reattachedWs.close();
      }
    }
  } finally {
    ws.close();
  }
}

async function fetchNoteWithFallback(mode) {
  try {
    return await fetchPageForMode(mode);
  } catch (error) {
    const recoveryMode = resolveBrowserRecoveryMode(error, mode);
    if (!recoveryMode) {
      throw error;
    }

    await launchChromeForMode(recoveryMode);
    return fetchPageForMode(recoveryMode);
  }
}

function normalizeOrchestrationOptions(options = {}) {
  const input = options?.orchestration && typeof options.orchestration === 'object'
    ? options.orchestration
    : {};
  const maxAttemptsPerState = Number(input.maxAttemptsPerState || 2);

  return {
    enabled: input.enabled !== false,
    checkpointStore: input.checkpointStore,
    checkpointRoot: String(input.checkpointRoot || DEFAULT_BROWSER_TASK_CHECKPOINT_DIR).trim() || DEFAULT_BROWSER_TASK_CHECKPOINT_DIR,
    maxAttemptsPerState: Number.isFinite(maxAttemptsPerState) && maxAttemptsPerState > 0 ? maxAttemptsPerState : 2,
    resumeTerminalState: input.resumeTerminalState === true
  };
}

function createBrowserTaskCheckpointStore(options = {}) {
  const orchestration = normalizeOrchestrationOptions(options);
  if (orchestration.checkpointStore) {
    return orchestration.checkpointStore;
  }
  return createJsonCheckpointStore({
    rootDir: orchestration.checkpointRoot
  });
}

function resolveSaveModeTask(mode, options = {}) {
  const requestedTask = options.task && typeof options.task === 'object'
    ? options.task
    : null;
  const source = String(requestedTask?.source || options.source || 'cli').trim() || 'cli';
  const modeInput = mode?.input || getNavigationUrl(mode);
  const modeFlag = mode?.mode === 'current' ? 'current' : undefined;

  if (!requestedTask) {
    return buildNoteSaveTask({
      input: modeInput,
      source,
      mode: modeFlag
    });
  }

  const requestedInput = normalizeTaskInput(requestedTask.input);
  const currentInput = normalizeTaskInput(modeFlag === 'current' ? '' : modeInput);
  const requestedMode = requestedTask.options?.mode === 'current' ? 'current' : '';
  const currentMode = modeFlag || '';
  const shouldReuseTask = (
    requestedTask.type === 'note-save'
    && requestedInput === currentInput
    && requestedMode === currentMode
  );

  if (shouldReuseTask) {
    return requestedTask;
  }

  return buildNoteSaveTask({
    input: modeInput,
    source,
    mode: modeFlag
  });
}

function buildModeBaseResult(mode = {}, index = 0) {
  return {
    index,
    noteId: mode.noteId || '',
    input: mode.input || getNavigationUrl(mode),
    canonicalUrl: mode.canonicalUrl || '',
    navigationUrl: getNavigationUrl(mode)
  };
}

function buildCheckpointBaseResult(checkpoint = {}, index = 0) {
  const note = checkpoint?.result?.note && typeof checkpoint.result.note === 'object'
    ? checkpoint.result.note
    : {};
  const metadata = checkpoint?.metadata && typeof checkpoint.metadata === 'object'
    ? checkpoint.metadata
    : {};
  const task = checkpoint?.task && typeof checkpoint.task === 'object'
    ? checkpoint.task
    : {};
  const navigationUrl = String(
    note.sourceUrl
    || note.noteUrl
    || metadata.navigation_url
    || task.input
    || ''
  ).trim();
  return {
    index,
    noteId: String(note.noteId || '').trim(),
    input: String(task.input || navigationUrl).trim() || navigationUrl,
    canonicalUrl: String(note.canonicalUrl || note.noteUrl || navigationUrl).trim(),
    navigationUrl
  };
}

function resolveCheckpointResumeInput(checkpoint = {}) {
  const note = checkpoint?.result?.note && typeof checkpoint.result.note === 'object'
    ? checkpoint.result.note
    : {};
  const metadata = checkpoint?.metadata && typeof checkpoint.metadata === 'object'
    ? checkpoint.metadata
    : {};
  const task = checkpoint?.task && typeof checkpoint.task === 'object'
    ? checkpoint.task
    : {};
  return String(
    note.noteUrl
    || note.sourceUrl
    || note.canonicalUrl
    || metadata.navigation_url
    || task.input
    || ''
  ).trim();
}

async function resolveResumeModeFromCheckpoint(checkpoint = {}, options = {}) {
  const resumeInput = resolveCheckpointResumeInput(checkpoint);
  const browser = normalizeBrowserOptions(options.browser);

  if (resumeInput) {
    return resolveRunMode({
      mode: 'input',
      input: resumeInput,
      ...(browser ? { browser } : {})
    }, options);
  }

  if (checkpoint?.task?.options?.mode === 'current') {
    return browser ? { mode: 'current', browser } : { mode: 'current' };
  }

  throw new Error('当前检查点缺少可继续执行的目标页面');
}

function buildResumeTaskForMode(mode, checkpointTask, options = {}) {
  const source = String(options.source || checkpointTask?.source || 'cli').trim() || 'cli';
  const taskOptions = checkpointTask?.options && typeof checkpointTask.options === 'object'
    ? { ...checkpointTask.options }
    : {};

  if (mode?.mode === 'current') {
    taskOptions.mode = 'current';
  } else {
    delete taskOptions.mode;
  }

  return assertValidTask({
    ...checkpointTask,
    type: 'note-save',
    source,
    input: mode?.mode === 'current' ? '' : (mode?.input || getNavigationUrl(mode)),
    options: taskOptions
  });
}

function resolveModeSourceType(mode) {
  if (mode?.mode === 'current') {
    return 'current';
  }
  return resolveModeContentSourceType(mode);
}

function isXiaohongshuNavigationMode(mode) {
  return resolveModeContentSourceType(mode) === 'xiaohongshu';
}

function buildLocateTargetObservation(mode, currentUrl = '', overrides = {}) {
  const normalizedCurrentUrl = String(currentUrl || '').trim();
  const sourceType = resolveModeContentSourceType(mode);
  const expectedNoteId = String(mode?.noteId || extractNoteIdFromUrl(getNavigationUrl(mode)) || '').trim();
  const currentNoteId = sourceType === 'xiaohongshu'
    ? String(extractNoteIdFromUrl(normalizedCurrentUrl) || '').trim()
    : '';

  return {
    source_type: sourceType,
    current_url: normalizedCurrentUrl,
    ...(expectedNoteId ? { expected_note_id: expectedNoteId } : {}),
    ...(currentNoteId ? { current_note_id: currentNoteId } : {}),
    ...overrides
  };
}

function validateLocatedNavigationTarget(mode, currentUrl = '', options = {}) {
  const normalizedCurrentUrl = String(currentUrl || '').trim();
  const sourceType = resolveModeContentSourceType(mode);

  if (sourceType !== 'xiaohongshu') {
    return buildLocateTargetObservation(mode, normalizedCurrentUrl, options.observation || {});
  }

  const currentSourceType = detectSourceFromUrl(normalizedCurrentUrl);
  const landedOnNoteDetail = currentSourceType === 'xiaohongshu' && isNoteDetailUrl(normalizedCurrentUrl);
  const observation = buildLocateTargetObservation(mode, normalizedCurrentUrl, {
    landed_on_note_detail: landedOnNoteDetail,
    ...(options.observation || {})
  });

  if (!normalizedCurrentUrl) {
    const error = new CodexTaskError(
      'note_unavailable',
      '无法打开笔记详情页：导航后未获取到当前页面 URL。',
      { retriable: false }
    );
    error.observation = observation;
    throw error;
  }

  if (!landedOnNoteDetail) {
    const error = new CodexTaskError(
      'note_unavailable',
      `无法打开笔记详情页：导航后未落在小红书笔记详情页。当前页面：${normalizedCurrentUrl}`,
      { retriable: false }
    );
    error.observation = observation;
    throw error;
  }

  const expectedNoteId = String(observation.expected_note_id || '').trim();
  const currentNoteId = String(observation.current_note_id || '').trim();
  if (expectedNoteId && currentNoteId && expectedNoteId !== currentNoteId) {
    const error = new CodexTaskError(
      'note_unavailable',
      `无法打开目标笔记详情页：导航后落到了其他笔记。期望：${expectedNoteId}，实际：${currentNoteId}。当前页面：${normalizedCurrentUrl}`,
      { retriable: false }
    );
    error.observation = observation;
    throw error;
  }

  return observation;
}

function shouldAttemptNavigationTargetMigration(mode, browser = {}) {
  if (mode?.mode === 'current') return false;
  if (resolveModeContentSourceType(mode) !== 'xiaohongshu') return false;
  return !String(browser?.wsEndpoint || '').trim();
}

async function tryReattachLocatedNavigationTarget(mode, currentUrl = '', options = {}) {
  const browser = normalizeBrowserOptions(mode?.browser);
  if (!shouldAttemptNavigationTargetMigration(mode, browser)) {
    return {
      ws: options.activeWs || null,
      currentUrl: String(currentUrl || '').trim(),
      replaced: false,
      observation: {}
    };
  }

  const resolveWsEndpointForUrlFn = options.resolveWsEndpointForUrlFn || resolveWsEndpointForUrl;
  const connectToChromeFn = options.connectToChromeFn || connectToChrome;
  const getCurrentPageUrlFn = options.getCurrentPageUrlFn || getCurrentPageUrl;
  const navigationUrl = getNavigationUrl(mode);
  const expectedNoteId = String(mode?.noteId || extractNoteIdFromUrl(navigationUrl) || '').trim();
  const originalUrl = String(currentUrl || '').trim();

  try {
    const resolvedWsEndpoint = await resolveWsEndpointForUrlFn({
      browserUrl: browser?.browserUrl || CHROME_DEBUG_URL,
      pageUrl: navigationUrl,
      sourceType: 'xiaohongshu',
      noteId: expectedNoteId
    });
    if (!resolvedWsEndpoint) {
      return {
        ws: options.activeWs || null,
        currentUrl: originalUrl,
        replaced: false,
        observation: {
          target_migration_attempted: true,
          target_migrated: false
        }
      };
    }

    const migratedWs = await connectToChromeFn({ wsEndpoint: resolvedWsEndpoint });
    const migratedUrl = String(await getCurrentPageUrlFn(migratedWs) || '').trim();
    if (!migratedUrl || migratedUrl === originalUrl) {
      migratedWs.close();
      return {
        ws: options.activeWs || null,
        currentUrl: originalUrl,
        replaced: false,
        observation: {
          target_migration_attempted: true,
          target_migrated: false
        }
      };
    }

    return {
      ws: migratedWs,
      currentUrl: migratedUrl,
      replaced: true,
      observation: {
        target_migration_attempted: true,
        target_migrated: true,
        target_migration_strategy: 'reattach_resolved_target',
        previous_url: originalUrl,
        target_migration_url: migratedUrl
      }
    };
  } catch (error) {
    return {
      ws: options.activeWs || null,
      currentUrl: originalUrl,
      replaced: false,
      observation: {
        target_migration_attempted: true,
        target_migrated: false,
        target_migration_error: String(error?.message || error || '').trim()
      }
    };
  }
}

async function validateLocatedNavigationTargetWithRecovery(mode, currentUrl = '', options = {}) {
  const activeWs = options.activeWs || null;
  const baseObservation = options.observation && typeof options.observation === 'object'
    ? options.observation
    : {};

  try {
    return {
      ws: activeWs,
      currentUrl: String(currentUrl || '').trim(),
      replaced: false,
      observation: validateLocatedNavigationTarget(mode, currentUrl, {
        observation: baseObservation
      })
    };
  } catch (error) {
    const migration = await tryReattachLocatedNavigationTarget(mode, currentUrl, options);
    if (!migration.replaced || !migration.ws) {
      if (error && typeof error === 'object') {
        error.observation = {
          ...(error.observation || {}),
          ...baseObservation,
          ...(migration.observation || {})
        };
      }
      throw error;
    }

    try {
      return {
        ws: migration.ws,
        currentUrl: migration.currentUrl,
        replaced: true,
        observation: validateLocatedNavigationTarget(mode, migration.currentUrl, {
          observation: {
            ...baseObservation,
            ...migration.observation
          }
        })
      };
    } catch (migrationError) {
      migration.ws.close();
      if (migrationError && typeof migrationError === 'object') {
        migrationError.observation = {
          ...(migrationError.observation || {}),
          ...baseObservation,
          ...(migration.observation || {})
        };
      }
      throw migrationError;
    }
  }
}

async function probeBrowserSessionForMode(mode, options = {}) {
  const connectToChromeFn = options.connectToChromeFn || connectToChrome;
  const browser = normalizeBrowserOptions(mode?.browser);
  const ws = await connectToChromeFn({
    requireXiaohongshu: false,
    browserMode: browser?.mode,
    browserUrl: browser?.browserUrl,
    browserChannel: browser?.channel,
    wsEndpoint: browser?.wsEndpoint
  });

  try {
    return {
      browser_mode: browser?.mode || 'isolated',
      source_type: resolveModeSourceType(mode),
      navigation_url: getNavigationUrl(mode),
      used_browser_url: Boolean(browser?.browserUrl),
      used_ws_endpoint: Boolean(browser?.wsEndpoint)
    };
  } finally {
    ws.close();
  }
}

async function locateTargetForMode(mode, options = {}) {
  const browser = normalizeBrowserOptions(mode?.browser);
  const sourceType = resolveModeSourceType(mode);

  if (mode?.mode !== 'current') {
    if (!(sourceType === 'xiaohongshu' && browser?.mode === 'current-browser')) {
      return {
        source_type: sourceType,
        navigation_url: getNavigationUrl(mode),
        target_strategy: browser?.mode === 'current-browser' ? 'navigate_after_attach' : 'navigate_after_launch'
      };
    }
  }

  const connectToChromeFn = options.connectToChromeFn || connectToChrome;
  const getCurrentPageUrlFn = options.getCurrentPageUrlFn || getCurrentPageUrl;
  const requireXiaohongshu = mode?.mode !== 'current' &&
    sourceType === 'xiaohongshu' &&
    browser?.mode === 'current-browser';
  const ws = await connectToChromeFn({
    requireXiaohongshu,
    browserMode: browser?.mode,
    browserUrl: browser?.browserUrl,
    browserChannel: browser?.channel,
    wsEndpoint: browser?.wsEndpoint
  });

  try {
    if (mode?.mode === 'current') {
      const currentUrl = String(await getCurrentPageUrlFn(ws) || '').trim();
      const currentSourceType = detectSourceFromUrl(currentUrl);
      ensureSinglePageSourceType(currentSourceType);

      if (currentSourceType === 'generic_web') {
        throw new Error('Current tab is not a supported page');
      }
      if (currentSourceType === 'xiaohongshu' && !isNoteDetailUrl(currentUrl)) {
        throw new Error('Current tab is not a Xiaohongshu note detail page');
      }

      return {
        source_type: currentSourceType,
        current_url: currentUrl,
        target_strategy: 'current_tab'
      };
    }

    return {
      source_type: sourceType,
      navigation_url: getNavigationUrl(mode),
      target_strategy: 'current_browser_attach'
    };
  } finally {
    ws.close();
  }
}

function validateFetchedPageResult(note, mode) {
  if (!note || typeof note !== 'object') {
    throw new Error('Fetched page result is empty');
  }

  const sourceType = resolveModeContentSourceType({
    ...mode,
    sourceType: note.sourceType || mode?.sourceType || ''
  });
  const title = String(note.title || '').trim();
  const content = String(note.content || '').trim();

  if (sourceType === 'xiaohongshu') {
    const noteId = String(note.noteId || mode?.noteId || '').trim();
    if (!noteId) {
      throw new Error('Fetched Xiaohongshu note is missing noteId');
    }
    if (!title && !content) {
      throw new Error('Fetched Xiaohongshu note is missing title and content');
    }
    return {
      source_type: sourceType,
      note_id: noteId,
      title_present: Boolean(title),
      content_length: content.length,
      comment_total: Number(note.commentTotal || 0),
      comment_collected: Array.isArray(note.comments) ? note.comments.length : 0,
      comment_warning_code: String(note.commentWarningCode || '').trim(),
      manual_action_required: note.manual_action_required === true || note.manualActionRequired === true,
      manual_action_reason: String(note.manual_action_reason || note.manualActionReason || '').trim()
    };
  }

  if (!title) {
    throw new Error('Fetched article is missing title');
  }
  if (!content) {
    throw new Error('Fetched article is missing content');
  }

  return {
    source_type: sourceType,
    title_present: true,
    content_length: content.length
  };
}

function buildFetchedNoteObservation(note, mode) {
  return validateFetchedPageResult(note, mode);
}

function resolveFetchedNoteManualAction(note = {}) {
  const explicitRequired = note?.manual_action_required === true || note?.manualActionRequired === true;
  const explicitReason = String(note?.manual_action_reason || note?.manualActionReason || '').trim();
  if (explicitRequired || explicitReason) {
    return {
      manual_action_required: explicitRequired || Boolean(explicitReason),
      manual_action_reason: explicitReason
    };
  }

  const commentWarningCode = String(note?.commentWarningCode || note?.comment_warning_code || '').trim();
  const message = String(note?.commentError || note?.comment_error || '').trim();
  if (/验证码|captcha/i.test(message)) {
    return {
      manual_action_required: true,
      manual_action_reason: 'captcha'
    };
  }
  if (
    commentWarningCode === 'comment_login_required' ||
    /登录查看全部评论内容|无登录信息|先在当前 Chrome 会话中登录后重试|登录后查看/.test(message)
  ) {
    return {
      manual_action_required: true,
      manual_action_reason: 'login_required'
    };
  }
  if (/300011|406|账号异常|风控|频率|限流|rate/i.test(message)) {
    return {
      manual_action_required: true,
      manual_action_reason: 'risk_control'
    };
  }
  return {
    manual_action_required: false,
    manual_action_reason: ''
  };
}

function annotateFetchedNoteForOrchestration(note = {}) {
  if (!note || typeof note !== 'object') {
    return note;
  }
  const manualAction = resolveFetchedNoteManualAction(note);
  return {
    ...note,
    manual_action_required: manualAction.manual_action_required,
    manual_action_reason: manualAction.manual_action_reason
  };
}

function buildFetchedNoteWarning(note = {}) {
  const code = String(note?.commentWarningCode || note?.comment_warning_code || '').trim();
  const message = String(note?.commentError || note?.comment_error || '').trim();
  const manualActionReason = String(note?.manual_action_reason || note?.manualActionReason || '').trim();

  if (!code && !message && !manualActionReason) {
    return null;
  }

  return {
    code: code || manualActionReason || 'comment_warning',
    message: message || manualActionReason || '评论采集存在待处理告警'
  };
}

function buildCommentCollectionObservation(state = {}, { phase = '' } = {}) {
  const observation = {};
  const normalizedPhase = String(phase || '').trim();
  if (normalizedPhase) {
    observation.comment_phase = normalizedPhase;
  }
  if (Number.isFinite(state?.commentCount)) {
    observation.comment_count = Number(state.commentCount);
  }
  if (Number.isFinite(state?.totalCount)) {
    observation.comment_total = Number(state.totalCount);
  }
  if (Number.isFinite(state?.buttonCount)) {
    observation.comment_button_count = Number(state.buttonCount);
  }
  if (typeof state?.requiresLogin === 'boolean') {
    observation.comment_requires_login = state.requiresLogin;
  }
  if (typeof state?.reachedEnd === 'boolean') {
    observation.comment_reached_end = state.reachedEnd;
  }
  const lastCommentId = String(state?.lastCommentId || '').trim();
  if (lastCommentId) {
    observation.last_comment_id = lastCommentId;
  }
  return observation;
}

function resolveBrowserOrchestrationSummary(runtime = {}, checkpointStore = null) {
  if (!runtime || typeof runtime !== 'object') {
    return null;
  }

  const runId = String(runtime.runId || runtime.run_id || '').trim();
  const status = String(runtime.status || '').trim();
  const state = String(runtime.state || '').trim();
  const warnings = Array.isArray(runtime.warnings) ? runtime.warnings : [];
  const checkpointPath = String(runtime.checkpoint_path || '').trim() || (
    runId && checkpointStore && typeof checkpointStore.resolveCheckpointPath === 'function'
      ? checkpointStore.resolveCheckpointPath(runId)
      : ''
  );

  if (!runId && !status && !state && !checkpointPath && warnings.length === 0) {
    return null;
  }

  const summary = {
    run_id: runId,
    status,
    state,
    checkpoint_path: checkpointPath,
    warnings
  };

  if (runtime.attempts && typeof runtime.attempts === 'object') {
    summary.attempts = { ...runtime.attempts };
  }
  if (runtime.lastError && typeof runtime.lastError === 'object') {
    summary.last_error = {
      code: String(runtime.lastError.code || '').trim(),
      message: String(runtime.lastError.message || '').trim(),
      state: String(runtime.lastError.state || '').trim(),
      retryable: runtime.lastError.retryable === true
    };
  } else if (runtime.last_error && typeof runtime.last_error === 'object') {
    summary.last_error = { ...runtime.last_error };
  }

  return summary;
}

function mergeSaveSummaryWarnings(...warningLists) {
  return mergeTaskWarnings(warningLists);
}

function resolveManualActionReasonFromTaskError(error, runtimeSummary = null) {
  const info = classifyTaskError(error);
  const runtimeError = runtimeSummary?.last_error && typeof runtimeSummary.last_error === 'object'
    ? runtimeSummary.last_error
    : {};
  const code = String(runtimeError.code || info.code || '').trim();
  const message = `${runtimeError.message || ''} ${info.message || ''}`.trim().toLowerCase();

  if (code === 'login_required' || /登录|login required|重新登录|登录失效|无登录信息/.test(message)) {
    return 'login_required';
  }
  if (code === 'account_risk_control' || /风险|风控|risk|300011|406|账号异常/.test(message)) {
    return 'risk_control';
  }
  if (/captcha|验证码/.test(message)) {
    return 'captcha';
  }
  return '';
}

function shouldRetryFetchedNote(note, mode) {
  const sourceType = resolveModeContentSourceType({
    ...mode,
    sourceType: note?.sourceType || mode?.sourceType || ''
  });
  if (sourceType !== 'xiaohongshu') {
    return false;
  }
  if (note?.manual_action_required === true || note?.manualActionRequired === true) {
    return false;
  }

  const warningCode = String(note?.commentWarningCode || note?.comment_warning_code || '').trim();
  const total = Number(note?.commentTotal || note?.comment_total || 0);
  const collected = Array.isArray(note?.comments)
    ? note.comments.length
    : Number(note?.commentCollected || note?.comment_collected || 0);

  if (warningCode !== 'comment_incomplete') {
    return false;
  }
  if (!Number.isFinite(total) || total <= 0) {
    return false;
  }
  if (!Number.isFinite(collected) || collected < 0) {
    return false;
  }
  return collected < total;
}

async function fetchNoteWithOrchestration(mode, options = {}) {
  const orchestration = normalizeOrchestrationOptions(options);
  if (!orchestration.enabled) {
    return fetchNoteWithFallback(mode);
  }

  const checkpointStore = createBrowserTaskCheckpointStore(options);
  const fetchPageForModeFn = options.fetchPageForModeFn || fetchPageForMode;
  const launchChromeForModeFn = options.launchChromeForModeFn || launchChromeForMode;
  let recoveryLaunched = false;

  const task = options.task || buildNoteSaveTask({
    input: mode.input || getNavigationUrl(mode),
    source: options.source || 'cli',
    mode: mode.mode === 'current' ? 'current' : undefined
  });

  const shouldUseSplitXiaohongshuFlow = isXiaohongshuNavigationMode(mode) &&
    (!options.fetchPageForModeFn || options.extractNoteCoreDetailFn || options.collectNoteCommentDiagnosticsFn);

  if (shouldUseSplitXiaohongshuFlow) {
    const connectToChromeFn = options.connectToChromeFn || connectToChrome;
    const navigateToUrlFn = options.navigateToUrlFn || navigateToUrl;
    const getCurrentPageUrlFn = options.getCurrentPageUrlFn || getCurrentPageUrl;
    const resolveWsEndpointForUrlFn = options.resolveWsEndpointForUrlFn || resolveWsEndpointForUrl;
    const extractNoteCoreDetailFn = options.extractNoteCoreDetailFn || extractNoteCoreDetail;
    const collectNoteCommentDiagnosticsFn = options.collectNoteCommentDiagnosticsFn || collectNoteCommentDiagnostics;
    const prepareNoteCommentCollectionFn = options.prepareNoteCommentCollectionFn || prepareNoteCommentCollection;
    const expandPreparedNoteCommentsFn = options.expandPreparedNoteCommentsFn || expandPreparedNoteComments;
    const collectPreparedNoteCommentsFn = options.collectPreparedNoteCommentsFn || collectPreparedNoteComments;
    let activeMode = mode;
    const getActiveBrowser = () => normalizeBrowserOptions(activeMode?.browser);
    const getTargetUrl = () => getNavigationUrl(activeMode);
    const shouldRequireXiaohongshu = () => activeMode?.mode !== 'current' && getActiveBrowser()?.mode === 'current-browser';
    let recoveryLaunched = false;
    let currentUrl = '';
    let ws = null;
    let commentCollectionContext = null;

    const connectSession = async () => {
      if (ws) return ws;
      const browser = getActiveBrowser();
      ws = await connectToChromeFn({
        requireXiaohongshu: shouldRequireXiaohongshu(),
        browserMode: browser?.mode,
        browserUrl: browser?.browserUrl,
        browserChannel: browser?.channel,
        wsEndpoint: browser?.wsEndpoint
      });
      return ws;
    };

    try {
      const runtime = await runBrowserTaskOrchestrator({
        task,
        states: ['attach_browser', 'locate_target', 'load_note_core', 'prepare_comments', 'expand_comments', 'collect_comments', 'validate_result'],
        checkpointStore,
        maxAttemptsPerState: orchestration.maxAttemptsPerState,
        resumeTerminalState: orchestration.resumeTerminalState,
        initialMetadata: {
          source_type: 'xiaohongshu',
          navigation_url: getTargetUrl(),
          browser_mode: getActiveBrowser()?.mode || 'isolated'
        },
        executeStep: async ({ state, attempt, runtime: currentRuntime }) => {
          if (state === 'attach_browser') {
            try {
              const browser = getActiveBrowser();
              await connectSession();
              return {
                status: 'success',
                observation: {
                  browser_mode: browser?.mode || 'isolated',
                  source_type: 'xiaohongshu',
                  navigation_url: getTargetUrl()
                }
              };
            } catch (error) {
              if (!recoveryLaunched) {
                const recoveryMode = resolveBrowserRecoveryMode(error, activeMode);
                if (recoveryMode) {
                  closeChromeConnectionQuietly(ws);
                  ws = null;
                  currentUrl = '';
                  commentCollectionContext = null;
                  activeMode = recoveryMode;
                  await launchChromeForModeFn(recoveryMode);
                  recoveryLaunched = true;
                  return {
                    status: 'retry',
                    code: classifyTaskError(error).code || 'browser_recovery',
                    message: 'Browser session prepared after recovery launch',
                    observation: {
                      recovery_mode: normalizeBrowserOptions(recoveryMode?.browser)?.mode || 'isolated',
                      recovery_reason: classifyTaskError(error).code || 'browser_recovery'
                    }
                  };
                }
              }
              throw error;
            }
          }

          if (state === 'locate_target') {
            const activeWs = await connectSession();
            const activeBrowser = getActiveBrowser();
            const targetUrl = getTargetUrl();
            if (activeMode.mode === 'current') {
              currentUrl = String(await getCurrentPageUrlFn(activeWs) || '').trim();
              if (!isNoteDetailUrl(currentUrl)) {
                throw new Error('Current tab is not a Xiaohongshu note detail page');
              }
              return {
                status: 'success',
                observation: {
                  source_type: 'xiaohongshu',
                  current_url: currentUrl,
                  target_strategy: 'current_tab'
                }
              };
            }

            await navigateToUrlFn(activeWs, targetUrl);
            currentUrl = String(await getCurrentPageUrlFn(activeWs) || '').trim() || targetUrl;
            const locatedTarget = await validateLocatedNavigationTargetWithRecovery(activeMode, currentUrl, {
              activeWs,
              observation: {
                target_strategy: activeBrowser?.mode === 'current-browser' ? 'current_browser_attach' : 'navigate_after_launch'
              },
              connectToChromeFn,
              getCurrentPageUrlFn,
              resolveWsEndpointForUrlFn
            });
            currentUrl = locatedTarget.currentUrl;
            if (locatedTarget.replaced && locatedTarget.ws && locatedTarget.ws !== activeWs) {
              activeWs.close();
              ws = locatedTarget.ws;
            }
            return {
              status: 'success',
              observation: locatedTarget.observation
            };
          }

          if (state === 'load_note_core') {
            const activeWs = await connectSession();
            const detail = await extractNoteCoreDetailFn(activeWs);
            const note = buildSingleNote({
              detail,
              noteId: activeMode.noteId || extractNoteIdFromUrl(currentUrl || detail.url),
              account: {}
            });
            return {
              status: 'success',
              result: { note },
              observation: {
                source_type: 'xiaohongshu',
                note_id: note.noteId,
                title_present: Boolean(String(note.title || '').trim()),
                content_length: String(note.content || '').trim().length
              }
            };
          }

          if (state === 'prepare_comments') {
            const activeWs = await connectSession();
            commentCollectionContext = await prepareNoteCommentCollectionFn(activeWs);
            return {
              status: 'success',
              observation: buildCommentCollectionObservation(commentCollectionContext?.readyState || {}, {
                phase: 'prepare_comments'
              })
            };
          }

          if (state === 'expand_comments') {
            const activeWs = await connectSession();
            if (!commentCollectionContext) {
              commentCollectionContext = await prepareNoteCommentCollectionFn(activeWs);
            }
            commentCollectionContext = await expandPreparedNoteCommentsFn(activeWs, commentCollectionContext);
            return {
              status: 'success',
              observation: buildCommentCollectionObservation(
                commentCollectionContext?.postExpandState || commentCollectionContext?.readyState || {},
                { phase: 'expand_comments' }
              )
            };
          }

          if (state === 'collect_comments') {
            const activeWs = await connectSession();
            if (!commentCollectionContext) {
              commentCollectionContext = await prepareNoteCommentCollectionFn(activeWs);
            }
            if (!commentCollectionContext?.postExpandState) {
              commentCollectionContext = await expandPreparedNoteCommentsFn(activeWs, commentCollectionContext);
            }

            const collected = await collectPreparedNoteCommentsFn(activeWs, commentCollectionContext);
            commentCollectionContext = collected?.context || {
              ...commentCollectionContext,
              postExpandState: collected?.state || commentCollectionContext?.postExpandState || null
            };
            const diagnostics = await collectNoteCommentDiagnosticsFn(activeWs, {
              extractComments: async () => Array.isArray(collected?.comments) ? collected.comments : [],
              readExpansionStateWithRetry: async () => collected?.state || commentCollectionContext?.postExpandState || {}
            });
            const note = annotateFetchedNoteForOrchestration({
              ...(currentRuntime?.result?.note || {}),
              ...diagnostics
            });
            const observation = {
              ...buildFetchedNoteObservation(note, activeMode),
              ...buildCommentCollectionObservation(collected?.state || commentCollectionContext?.postExpandState || {}, {
                phase: 'collect_comments'
              })
            };
            const warning = buildFetchedNoteWarning(note);
            if (shouldRetryFetchedNote(note, activeMode) && attempt < orchestration.maxAttemptsPerState) {
              return {
                status: 'retry',
                code: String(note.commentWarningCode || 'comment_incomplete').trim() || 'comment_incomplete',
                message: String(note.commentError || '评论仍未完整加载，准备重抓一次。').trim() || '评论仍未完整加载，准备重抓一次。',
                observation,
                warning
              };
            }
            return {
              status: 'success',
              result: { note },
              observation,
              warning
            };
          }

          if (state === 'validate_result') {
            const note = currentRuntime?.result?.note;
            return {
              status: 'success',
              observation: validateFetchedPageResult(note, activeMode)
            };
          }

          return {
            status: 'failed',
            code: 'invalid_orchestration_state',
            message: `Unsupported orchestration state: ${state}`
          };
        }
      });

      if (runtime.status !== 'done' || !runtime.result?.note) {
        const lastError = runtime.lastError || {};
        const error = new CodexTaskError(
          lastError.code || 'browser_task_failed',
          lastError.message || 'Browser task orchestration failed',
          { retriable: Boolean(lastError.retryable) }
        );
        error.orchestration = runtime;
        throw error;
      }

      const note = runtime.result.note;
      note.browser_orchestration = resolveBrowserOrchestrationSummary(runtime, checkpointStore);
      return note;
    } finally {
      if (ws) {
        ws.close();
      }
    }
  }

  let activeMode = mode;
  const runtime = await runBrowserTaskOrchestrator({
    task,
    states: ['attach_browser', 'locate_target', 'load_note', 'validate_result'],
    checkpointStore,
    maxAttemptsPerState: orchestration.maxAttemptsPerState,
    resumeTerminalState: orchestration.resumeTerminalState,
    initialMetadata: {
      source_type: resolveModeSourceType(activeMode),
      navigation_url: getNavigationUrl(activeMode),
      browser_mode: normalizeBrowserOptions(activeMode?.browser)?.mode || 'isolated'
    },
    executeStep: async ({ state, attempt, runtime: currentRuntime }) => {
      if (state === 'attach_browser') {
        try {
          return {
            status: 'success',
            observation: await probeBrowserSessionForMode(activeMode, options)
          };
        } catch (error) {
          if (!recoveryLaunched) {
            const recoveryMode = resolveBrowserRecoveryMode(error, activeMode);
            if (recoveryMode) {
              activeMode = recoveryMode;
              await launchChromeForModeFn(recoveryMode);
              recoveryLaunched = true;
              return {
                status: 'retry',
                code: classifyTaskError(error).code || 'browser_recovery',
                message: 'Browser session prepared after recovery launch',
                observation: {
                  recovery_mode: normalizeBrowserOptions(recoveryMode?.browser)?.mode || 'isolated',
                  recovery_reason: classifyTaskError(error).code || 'browser_recovery'
                }
              };
            }
          }
          throw error;
        }
      }

      if (state === 'locate_target') {
        return {
          status: 'success',
          observation: await locateTargetForMode(activeMode, options)
        };
      }

      if (state === 'load_note') {
        const note = annotateFetchedNoteForOrchestration(await fetchPageForModeFn(activeMode, options));
        const observation = buildFetchedNoteObservation(note, activeMode);
        const warning = buildFetchedNoteWarning(note);
        if (shouldRetryFetchedNote(note, activeMode) && attempt < orchestration.maxAttemptsPerState) {
          return {
            status: 'retry',
            code: String(note.commentWarningCode || 'comment_incomplete').trim() || 'comment_incomplete',
            message: String(note.commentError || '评论仍未完整加载，准备重抓一次。').trim() || '评论仍未完整加载，准备重抓一次。',
            observation,
            warning
          };
        }
        return {
          status: 'success',
          result: { note },
          observation,
          warning
        };
      }

      if (state === 'validate_result') {
        const note = currentRuntime?.result?.note;
        return {
          status: 'success',
          observation: validateFetchedPageResult(note, activeMode)
        };
      }

      return {
        status: 'failed',
        code: 'invalid_orchestration_state',
        message: `Unsupported orchestration state: ${state}`
      };
    }
  });

  if (runtime.status !== 'done' || !runtime.result?.note) {
    const lastError = runtime.lastError || {};
    const error = new CodexTaskError(
      lastError.code || 'browser_task_failed',
      lastError.message || 'Browser task orchestration failed',
      { retriable: Boolean(lastError.retryable) }
    );
    error.orchestration = runtime;
    throw error;
  }

  const note = runtime.result.note;
  note.browser_orchestration = resolveBrowserOrchestrationSummary(runtime, checkpointStore);
  return note;
}

async function saveMode(mode, options = {}) {
  const task = resolveSaveModeTask(mode, options);
  const runtimeOptions = {
    ...options,
    task,
    source: task.source
  };
  const fetchNote = options.fetchNote || ((currentMode) => fetchNoteWithOrchestration(currentMode, runtimeOptions));
  const exportNote = options.exportNote || processSingleNoteExport;
  const exportVideoNote = options.exportVideoNote || exportVideoNoteWithProject;
  const exportCollectionResolver = options.exportCollectionResolver || createAutoClassificationResolver(options);

  const pipeline = await runTaskPipeline({
    task,
    fetchFn: async () => fetchNote(mode),
    enrichFn: async (note) => note,
    writeFn: async (note) => {
      const resolvedCollection = typeof options.collectionResolver === 'function'
        ? options.collectionResolver({ note, mode, task })
        : (options.collectionOverride || '');
      const noteWithSource = {
        ...note,
        collection: resolvedCollection || note.collection,
        sourceUrl: note.sourceUrl || getNavigationUrl(mode) || note.noteUrl || '',
        canonicalUrl: note.canonicalUrl || mode.canonicalUrl || ''
      };

      if (shouldUseVideoNoteProject(noteWithSource, mode)) {
        return exportVideoNote({
          note: noteWithSource,
          mode,
          task,
          outputRoot: options.outputRoot || OUTPUT_DIR,
          projectDir: options.videoProjectDir,
          cliDir: options.videoCliDir,
          pythonExe: options.videoPythonExe,
          spawnFn: options.videoSpawnFn,
          env: options.videoCommandEnv
        });
      }

      return exportNote({
        outputRoot: options.outputRoot || OUTPUT_DIR,
        imagesRoot: options.imagesRoot || IMG_DIR,
        mirrorTargets: options.mirrorTargets,
        note: noteWithSource,
        configPath: options.configPath || CONFIG_PATH,
        visionConfigPath: options.visionConfigPath,
        conflictStrategy: options.conflictStrategy,
        maxTitleLength: options.maxTitleLength,
        runtime: options.uiRuntime,
        collectionResolver: exportCollectionResolver
      });
    },
    reportFn: async (payload) => ({
      note: payload.steps.fetch?.data,
      result: payload.steps.write?.data,
      mode,
      task
    })
  });

  if (!pipeline.ok) {
    throw pipeline.error || new Error('Save note pipeline failed');
  }

  return pipeline.report;
}

async function resumeNoteSaveFromCheckpoint(runId, options = {}) {
  const normalizedRunId = String(runId || '').trim();
  if (!normalizedRunId) {
    throw new Error('runId is required');
  }

  const checkpointStore = createBrowserTaskCheckpointStore(options);
  const checkpoint = checkpointStore?.loadCheckpoint
    ? checkpointStore.loadCheckpoint(normalizedRunId)
    : null;
  if (!checkpoint || typeof checkpoint !== 'object') {
    throw new Error(`未找到对应检查点：${normalizedRunId}`);
  }

  const checkpointTask = checkpoint.task && typeof checkpoint.task === 'object'
    ? checkpoint.task
    : null;
  if (!checkpointTask || checkpointTask.type !== 'note-save') {
    throw new Error(`检查点 ${normalizedRunId} 不是可继续执行的笔记保存任务`);
  }
  if (String(checkpoint.status || '').trim() === 'done') {
    throw new Error(`检查点 ${normalizedRunId} 已完成，无需继续执行`);
  }

  const resumeBaseResult = buildCheckpointBaseResult(checkpoint);
  let mode;
  try {
    mode = await resolveResumeModeFromCheckpoint(checkpoint, options);
  } catch (error) {
    error.orchestration = error.orchestration || checkpoint;
    error.resume_base_result = resumeBaseResult;
    throw error;
  }

  const resumeTask = buildResumeTaskForMode(mode, checkpointTask, options);
  const runtimeOptions = {
    ...options,
    task: resumeTask,
    source: resumeTask.source,
    orchestration: {
      ...normalizeOrchestrationOptions(options),
      checkpointStore,
      resumeTerminalState: true
    }
  };

  try {
    return await saveMode(mode, runtimeOptions);
  } catch (error) {
    error.orchestration = error.orchestration || checkpoint;
    error.resume_mode = mode;
    error.resume_base_result = resumeBaseResult;
    throw error;
  }
}

function buildSuccessfulSaveSummaryItem(baseResult, saved) {
  const note = saved?.note || {};
  const result = saved?.result || {};
  const browserOrchestration = resolveBrowserOrchestrationSummary(
    result.browser_orchestration || result.browserOrchestration || note.browser_orchestration || note.browserOrchestration
  );
  const warnings = mergeSaveSummaryWarnings(result.warnings || [], browserOrchestration?.warnings || []);
  return {
    ...baseResult,
    status: 'success',
    filepath: result.filepath || saved?.filepath || '',
    platform: result.platform || note.platform || baseResult.platform || '',
    sourceType: result.sourceType || note.sourceType || baseResult.sourceType || '',
    warnings,
    comment_total: Number(result.comment_total ?? result.commentTotal ?? note.commentTotal ?? note.comment_total ?? 0),
    comment_collected: Number(
      result.comment_collected
      ?? result.commentCollected
      ?? (Array.isArray(result.comments) ? result.comments.length : undefined)
      ?? (Array.isArray(note.comments) ? note.comments.length : 0)
    ),
    comment_warning_code: String(result.comment_warning_code ?? result.commentWarningCode ?? note.commentWarningCode ?? note.comment_warning_code ?? '').trim(),
    comment_error: String(result.comment_error ?? result.commentError ?? note.commentError ?? note.comment_error ?? '').trim(),
    comment_diagnostics: result.comment_diagnostics && typeof result.comment_diagnostics === 'object'
      ? result.comment_diagnostics
      : (result.commentDiagnostics && typeof result.commentDiagnostics === 'object'
        ? result.commentDiagnostics
        : (note.comment_diagnostics && typeof note.comment_diagnostics === 'object'
          ? note.comment_diagnostics
          : (note.commentDiagnostics && typeof note.commentDiagnostics === 'object' ? note.commentDiagnostics : null))),
    manual_action_required: (
      result.manual_action_required === true
      || result.manualActionRequired === true
      || note.manual_action_required === true
      || note.manualActionRequired === true
    ),
    manual_action_reason: String(
      result.manual_action_reason
      ?? result.manualActionReason
      ?? note.manual_action_reason
      ?? note.manualActionReason
      ?? ''
    ).trim(),
    browser_orchestration: browserOrchestration
  };
}

function buildFailedSaveSummaryItem(baseResult, error, options = {}) {
  const checkpointStore = createBrowserTaskCheckpointStore(options);
  const browserOrchestration = resolveBrowserOrchestrationSummary(error?.orchestration, checkpointStore);
  const manualActionReason = resolveManualActionReasonFromTaskError(error, browserOrchestration);

  return {
    ...baseResult,
    status: 'failed',
    error: formatSaveNoteError(error),
    warnings: mergeSaveSummaryWarnings(browserOrchestration?.warnings || []),
    manual_action_required: Boolean(manualActionReason) || browserOrchestration?.status === 'need_human',
    manual_action_reason: manualActionReason,
    browser_orchestration: browserOrchestration
  };
}

async function saveModesSequentially(modes, options = {}) {
  const saveModeFn = options.saveMode
    ? (mode) => options.saveMode(mode, options)
    : (mode) => saveMode(mode, options);
  const list = Array.isArray(modes) ? modes : [];
  const results = [];
  const noteDelayMs = Number.isFinite(options.noteDelayMs)
    ? options.noteDelayMs
    : resolveNumberEnv(process.env.XHS_NOTE_THROTTLE_MS, DEFAULT_NOTE_THROTTLE_MS);
  const noteDelayJitterMs = Number.isFinite(options.noteDelayJitterMs)
    ? options.noteDelayJitterMs
    : resolveNumberEnv(process.env.XHS_NOTE_THROTTLE_JITTER_MS, DEFAULT_NOTE_THROTTLE_JITTER_MS);
  const wait = options.sleep || sleep;

  for (let index = 0; index < list.length; index += 1) {
    const mode = list[index];
    const baseResult = buildModeBaseResult(mode, index);

    try {
      const saved = await saveModeFn(mode);
      results.push(buildSuccessfulSaveSummaryItem(baseResult, saved));
    } catch (error) {
      results.push(buildFailedSaveSummaryItem(baseResult, error, options));
    }

    if (index < list.length - 1) {
      const delay = resolveDelayMs({ baseMs: noteDelayMs, jitterMs: noteDelayJitterMs });
      if (delay > 0) {
        await wait(delay);
      }
    }
  }

  return buildTaskSummary(results);
}

async function runParsedInput(parsed, options = {}) {
  const task = options.task || buildTaskFromParsed(parsed, options.source || 'cli');
  const browser = normalizeBrowserOptions(parsed?.browser || options.browser);
  const normalizedParsed = taskToParsed(task);
  if (browser) {
    normalizedParsed.browser = browser;
  }
  const modes = await resolveRunModes(normalizedParsed, options);
  const summary = await saveModesSequentially(modes, options);
  return { modes, summary, task };
}

async function saveLinksText(text, options = {}) {
  const task = options.task || buildNoteSaveTask({
    input: text,
    source: options.source || 'ui'
  });
  const parsed = taskToParsed(task);
  if (options.browser) {
    parsed.browser = normalizeBrowserOptions(options.browser);
  }
  const { summary } = await runParsedInput(parsed, { ...options, task });
  return summary;
}

function printCliSummary(summary) {
  if (!summary || typeof summary !== 'object') return;

  if (summary.total === 1 && summary.successCount === 1 && summary.results[0]?.filepath) {
    console.log(`Saved note to ${summary.results[0].filepath}`);
    return;
  }

  console.log(`Processed ${summary.total} note(s): ${summary.successCount} succeeded, ${summary.failureCount} failed.`);
  for (const item of summary.results || []) {
    if (item.status === 'success') {
      console.log(`[OK] ${item.filepath || item.canonicalUrl || item.navigationUrl}`);
      continue;
    }

    console.error(`[FAIL] ${item.input || item.navigationUrl || item.noteId}: ${item.error}`);
  }
}

async function run(argv = process.argv.slice(2), options = {}) {
  const parsed = options.parsed || parseArgs(argv);
  return runParsedInput(parsed, { ...options, source: options.source || 'cli' });
}

if (require.main === module) {
  run()
    .then(({ summary }) => {
      printCliSummary(summary);
      if (summary.failureCount > 0) {
        process.exitCode = 1;
      }
    })
    .catch((error) => {
      console.error(`Save note failed: ${formatSaveNoteError(error)}`);
      process.exitCode = 1;
    });
}

module.exports = {
  buildChromeRecoveryMode,
  buildChromeLaunchArgs,
  buildChromeDebugHelp,
  buildFailedSaveSummaryItem,
  buildSuccessfulSaveSummaryItem,
  canAutoLaunchChrome: shouldAutoLaunchChrome,
  fetchPageForMode,
  fetchNoteWithOrchestration,
  findChromeExecutable,
  formatSaveNoteError,
  getNavigationUrl,
  launchChromeForMode,
  locateTargetForMode,
  parseArgs,
  probeBrowserSessionForMode,
  resolveRunModes,
  resolveRunMode,
  runParsedInput,
  resumeNoteSaveFromCheckpoint,
  saveLinksText,
  saveMode,
  saveModesSequentially,
  shouldAutoLaunchChrome,
  validateFetchedPageResult,
  waitForChromeDebugPort,
  run
};

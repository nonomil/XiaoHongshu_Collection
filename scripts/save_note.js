const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const {
  buildSingleNote,
  connectToChrome,
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
const { resolveProjectPaths } = require('./lib/config');
const { classifyTaskError } = require('./lib/errors');
const { buildTaskSummary } = require('./lib/report');
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

async function resolveWsEndpointForUrl({ browserUrl, pageUrl }) {
  const tabs = await fetchDebuggerTabs(browserUrl);
  const targetUrl = String(pageUrl || '').trim();
  const matches = tabs.filter((tab) =>
    tab &&
    tab.type === 'page' &&
    tab.webSocketDebuggerUrl &&
    (String(tab.url || '') === targetUrl || String(tab.url || '').startsWith(targetUrl))
  );
  return matches.length > 0 ? (matches.at(-1)?.webSocketDebuggerUrl || '') : '';
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
  const extractNoteDetailFn = options.extractNoteDetailFn || extractNoteDetail;
  const readCurrentPageSnapshotFn = options.readCurrentPageSnapshotFn;
  const browser = normalizeBrowserOptions(mode?.browser);
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

  const ws = await connectToChromeFn({
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
      const currentUrl = await getCurrentPageUrlFn(ws);
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
    let attachedUrl = finalUrl || getNavigationUrl(mode);
    try {
      ws.close();
      await (options.wait || sleep)(300);
      const resolvedWsEndpoint = await resolveWsEndpointForUrlFn({
        browserUrl: browser?.browserUrl || CHROME_DEBUG_URL,
        pageUrl: finalUrl || getNavigationUrl(mode)
      });
      if (resolvedWsEndpoint) {
        reattachedWs = await connectToChromeFn({ wsEndpoint: resolvedWsEndpoint });
        articleWs = reattachedWs;
      }
      attachedUrl = String(await getCurrentPageUrlFn(articleWs) || '').trim() || attachedUrl;
      await waitForArticlePageReadyFn(articleWs, sourceType, {
        wait: options.wait || sleep,
        sendFn: options.sendFn || send
      });
      return await loadArticlePage(articleWs, attachedUrl, sourceType);
    } finally {
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
    if (!shouldAutoLaunchChrome(mode) || !isChromeUnavailableError(error)) {
      throw error;
    }

    await launchChromeForMode(mode);
    return fetchPageForMode(mode);
  }
}

async function saveMode(mode, options = {}) {
  const fetchNote = options.fetchNote || fetchNoteWithFallback;
  const exportNote = options.exportNote || processSingleNoteExport;
  const exportCollectionResolver = options.exportCollectionResolver || createAutoClassificationResolver(options);
  const task = options.task || buildNoteSaveTask({
    input: mode.input || getNavigationUrl(mode),
    source: options.source || 'cli',
    mode: mode.mode === 'current' ? 'current' : undefined
  });

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

function buildSuccessfulSaveSummaryItem(baseResult, saved) {
  const note = saved?.note || {};
  const result = saved?.result || {};
  return {
    ...baseResult,
    status: 'success',
    filepath: result.filepath || saved?.filepath || '',
    platform: result.platform || note.platform || baseResult.platform || '',
    sourceType: result.sourceType || note.sourceType || baseResult.sourceType || '',
    warnings: result.warnings || []
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
    : resolveNumberEnv(process.env.XHS_NOTE_THROTTLE_MS, 800);
  const noteDelayJitterMs = Number.isFinite(options.noteDelayJitterMs)
    ? options.noteDelayJitterMs
    : resolveNumberEnv(process.env.XHS_NOTE_THROTTLE_JITTER_MS, 400);
  const wait = options.sleep || sleep;

  for (let index = 0; index < list.length; index += 1) {
    const mode = list[index];
    const baseResult = {
      index,
      noteId: mode.noteId || '',
      input: mode.input || getNavigationUrl(mode),
      canonicalUrl: mode.canonicalUrl || '',
      navigationUrl: getNavigationUrl(mode)
    };

    try {
      const saved = await saveModeFn(mode);
      results.push(buildSuccessfulSaveSummaryItem(baseResult, saved));
    } catch (error) {
      results.push({
        ...baseResult,
        status: 'failed',
        error: formatSaveNoteError(error)
      });
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
  buildChromeLaunchArgs,
  buildChromeDebugHelp,
  buildSuccessfulSaveSummaryItem,
  canAutoLaunchChrome: shouldAutoLaunchChrome,
  fetchPageForMode,
  findChromeExecutable,
  formatSaveNoteError,
  getNavigationUrl,
  launchChromeForMode,
  parseArgs,
  resolveRunModes,
  resolveRunMode,
  runParsedInput,
  saveLinksText,
  saveMode,
  saveModesSequentially,
  shouldAutoLaunchChrome,
  waitForChromeDebugPort,
  run
};

const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const { spawn } = require('child_process');
const {
  buildSingleNote,
  connectToChrome,
  extractNoteDetail,
  extractNoteIdFromUrl,
  getCurrentPageUrl,
  isNoteDetailUrl,
  navigateToUrl
} = require('./lib/cdp_note');
const { normalizeNoteInput, normalizeNoteInputs } = require('./lib/note_input');
const { processSingleNoteExport } = require('./lib/note_export');

const PROJECT_DIR = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(PROJECT_DIR, 'output');
const IMG_DIR = path.join(OUTPUT_DIR, '_images');
const CONFIG_PATH = path.join(PROJECT_DIR, 'config', 'openrouter.json');
const CHROME_DEBUG_PORT = 9222;
const CHROME_DEBUG_URL = 'http://localhost:9222/json';
const AUTO_LAUNCH_PROFILE_DIR = path.join(PROJECT_DIR, '.cache', 'chrome-debug');

function parseArgs(argv) {
  const args = argv.filter(Boolean);
  if (args.length === 1 && args[0] === '--current') {
    return { mode: 'current' };
  }

  if (args.length >= 1) {
    return { mode: 'input', input: args.join(' ') };
  }

  throw new Error('Usage: node scripts/save_note.js <url|share_text> | --current');
}

function buildChromeDebugHelp() {
  return [
    'Chrome remote debugging is not available on port 9222.',
    'Start Chrome with remote debugging enabled, for example:',
    'chrome.exe --remote-debugging-port=9222 --user-data-dir=%TEMP%\\codex-chrome-debug',
    `Then keep a Xiaohongshu note tab open and re-run the command. (${CHROME_DEBUG_URL})`
  ].join(' ');
}

function shouldAutoLaunchChrome(mode) {
  return !!mode && mode.mode === 'url';
}

function buildChromeLaunchArgs({
  debugPort = CHROME_DEBUG_PORT,
  userDataDir,
  url
}) {
  return [
    `--remote-debugging-port=${debugPort}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--new-window',
    `--user-data-dir=${userDataDir}`,
    url
  ];
}

function collectErrorMessages(error) {
  const messages = [];
  const direct = String(error && error.message ? error.message : '').trim();
  if (direct) messages.push(direct);

  if (Array.isArray(error?.errors)) {
    for (const item of error.errors) {
      const nested = String(item && item.message ? item.message : '').trim();
      if (nested) messages.push(nested);
    }
  }

  if (error?.cause && error.cause !== error) {
    const cause = String(error.cause.message || error.cause).trim();
    if (cause) messages.push(cause);
  }

  if (error?.code && !messages.some((item) => item.includes(error.code))) {
    messages.unshift(String(error.code));
  }

  return Array.from(new Set(messages.filter(Boolean)));
}

function formatSaveNoteError(error) {
  const messages = collectErrorMessages(error);
  const message = messages.join('; ').trim();

  if (/ECONNREFUSED|connect ECONNREFUSED|socket hang up|ECONNRESET/i.test(message)) {
    return `${message}. ${buildChromeDebugHelp()}`;
  }

  if (/No xiaohongshu tab found/i.test(message)) {
    return `${message}. 请先在同一个 Chrome 实例中打开至少一个小红书笔记标签页，再重试。`;
  }

  return message || 'Unknown save note error';
}

function isChromeUnavailableError(error) {
  const messages = collectErrorMessages(error).join('; ');
  return /ECONNREFUSED|connect ECONNREFUSED|socket hang up|ECONNRESET/i.test(messages);
}

function getNavigationUrl(mode) {
  if (!mode || mode.mode === 'current') return '';
  return mode.navigationUrl || mode.extractedUrl || mode.canonicalUrl || '';
}

function findChromeExecutable() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ];

  return candidates.find((filepath) => fs.existsSync(filepath)) || '';
}

function waitForChromeDebugPort({
  attempts = 20,
  intervalMs = 500
} = {}) {
  return new Promise((resolve, reject) => {
    let attempt = 0;

    const tryConnect = () => {
      attempt += 1;
      const req = http.get(CHROME_DEBUG_URL, (res) => {
        res.resume();
        resolve(true);
      });

      req.on('error', (error) => {
        if (attempt >= attempts) {
          reject(error);
          return;
        }
        setTimeout(tryConnect, intervalMs);
      });
    };

    tryConnect();
  });
}

async function launchChromeForMode(mode) {
  if (!shouldAutoLaunchChrome(mode)) {
    return false;
  }

  const chromePath = findChromeExecutable();
  if (!chromePath) {
    throw new Error('Chrome executable not found');
  }

  fs.mkdirSync(AUTO_LAUNCH_PROFILE_DIR, { recursive: true });
  const targetUrl = getNavigationUrl(mode) || 'https://www.xiaohongshu.com/explore';
  const args = buildChromeLaunchArgs({
    userDataDir: AUTO_LAUNCH_PROFILE_DIR,
    url: targetUrl
  });

  const child = spawn(chromePath, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });
  child.unref();

  await waitForChromeDebugPort();
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

async function resolveInputMode(input, { resolveRedirectFn = resolveRedirect } = {}) {
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
  if (parsed.mode === 'current') {
    return [{ mode: 'current' }];
  }

  const candidates = normalizeNoteInputs(parsed.input);
  const seen = new Set();
  const modes = [];

  for (const candidate of candidates) {
    const mode = await resolveInputMode(candidate, options);
    const dedupeKey = mode.noteId
      ? `note:${mode.noteId}`
      : `nav:${getNavigationUrl(mode)}`;

    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    modes.push(mode);
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

async function fetchNoteForMode(mode) {
  const ws = await connectToChrome({ requireXiaohongshu: mode.mode === 'current' });

  try {
    if (mode.mode === 'current') {
      const currentUrl = await getCurrentPageUrl(ws);
      if (!isNoteDetailUrl(currentUrl)) {
        throw new Error('Current tab is not a Xiaohongshu note detail page');
      }

      const detail = await extractNoteDetail(ws);
      const noteId = extractNoteIdFromUrl(currentUrl);
      return buildSingleNote({ detail, noteId, account: {} });
    }

    await navigateToUrl(ws, getNavigationUrl(mode));
    const currentUrl = await getCurrentPageUrl(ws);
    const detail = await extractNoteDetail(ws);
    return buildSingleNote({
      detail,
      noteId: mode.noteId || extractNoteIdFromUrl(currentUrl),
      account: {}
    });
  } finally {
    ws.close();
  }
}

async function fetchNoteWithFallback(mode) {
  try {
    return await fetchNoteForMode(mode);
  } catch (error) {
    if (!shouldAutoLaunchChrome(mode) || !isChromeUnavailableError(error)) {
      throw error;
    }

    await launchChromeForMode(mode);
    return fetchNoteForMode(mode);
  }
}

async function saveMode(mode, options = {}) {
  const fetchNote = options.fetchNote || fetchNoteWithFallback;
  const exportNote = options.exportNote || processSingleNoteExport;
  const note = await fetchNote(mode);
  const result = await exportNote({
    outputRoot: options.outputRoot || OUTPUT_DIR,
    imagesRoot: options.imagesRoot || IMG_DIR,
    note,
    configPath: options.configPath || CONFIG_PATH
  });

  return { note, result, mode };
}

function buildSuccessfulSaveSummaryItem(baseResult, saved) {
  return {
    ...baseResult,
    status: 'success',
    filepath: saved?.result?.filepath || saved?.filepath || ''
  };
}

async function saveModesSequentially(modes, options = {}) {
  const saveModeFn = options.saveMode
    ? (mode) => options.saveMode(mode, options)
    : (mode) => saveMode(mode, options);
  const list = Array.isArray(modes) ? modes : [];
  const results = [];
  let successCount = 0;
  let failureCount = 0;

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
      successCount += 1;
      results.push(buildSuccessfulSaveSummaryItem(baseResult, saved));
    } catch (error) {
      failureCount += 1;
      results.push({
        ...baseResult,
        status: 'failed',
        error: formatSaveNoteError(error)
      });
    }
  }

  return {
    total: list.length,
    successCount,
    failureCount,
    results
  };
}

async function runParsedInput(parsed, options = {}) {
  const modes = await resolveRunModes(parsed, options);
  const summary = await saveModesSequentially(modes, options);
  return { modes, summary };
}

async function saveLinksText(text, options = {}) {
  const { summary } = await runParsedInput({ mode: 'input', input: text }, options);
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
  return runParsedInput(parsed, options);
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

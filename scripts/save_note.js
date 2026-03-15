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
const { runTaskPipeline } = require('./lib/pipeline');
const {
  assertValidTask,
  buildNoteSaveTask,
  normalizeTaskInput
} = require('./lib/task');
const { resolveNumberEnv, resolveDelayMs, sleep } = require('./lib/async_control');
const { resolveProjectPaths } = require('./lib/config');
const { classifyTaskError } = require('./lib/errors');
const { buildTaskSummary } = require('./lib/report');

const PATHS = resolveProjectPaths(path.resolve(__dirname, '..'));
const PROJECT_DIR = PATHS.projectDir;
const OUTPUT_DIR = PATHS.outputDir;
const IMG_DIR = path.join(OUTPUT_DIR, '_images');
const CONFIG_PATH = path.join(PATHS.configDir, 'openrouter.json');
const CHROME_DEBUG_PORT = 9222;
const CHROME_DEBUG_URL = 'http://localhost:9222/json';
const AUTO_LAUNCH_PROFILE_DIR = path.join(PATHS.cacheDir, 'chrome-debug');

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

function formatSaveNoteError(error) {
  const info = classifyTaskError(error);
  const message = info.message || 'Unknown save note error';

  if (info.code === 'chrome_unavailable') {
    return `${message}. ${buildChromeDebugHelp()}`;
  }

  if (info.code === 'no_xiaohongshu_tab') {
    return `${message}. 请先在同一个 Chrome 实例中打开至少一个小红书笔记标签页，再重试。`;
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
        note: noteWithSource,
        configPath: options.configPath || CONFIG_PATH,
        visionConfigPath: options.visionConfigPath,
        conflictStrategy: options.conflictStrategy,
        maxTitleLength: options.maxTitleLength,
        runtime: options.uiRuntime
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
  return {
    ...baseResult,
    status: 'success',
    filepath: saved?.result?.filepath || saved?.filepath || '',
    warnings: saved?.result?.warnings || []
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
  const normalizedParsed = taskToParsed(task);
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

const fs = require('fs');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');
const { resolveNumberEnv, resolveDelayMs, retryAsync } = require('./async_control');
const { logWarn } = require('./logger');

const DEFAULT_ISOLATED_BROWSER_URL = 'http://localhost:9222/json';
const DEFAULT_CURRENT_BROWSER_PORTS = [9222, 9229];

function isNoteDetailUrl(url) {
  return /xiaohongshu\.com\/(?:explore|discovery\/item)\//i.test(String(url || ''));
}

function normalizeImageUrl(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  if (value.startsWith('//')) return `https:${value}`;
  if (value.startsWith('http://')) return `https://${value.slice('http://'.length)}`;
  return value;
}

function extractImageUrlsFromStateNote(note) {
  const list = Array.isArray(note?.imageList) ? note.imageList : [];
  const urls = [];
  const seen = new Set();

  for (const item of list) {
    const infoList = Array.isArray(item?.infoList) ? item.infoList : [];
    const candidates = [
      item?.url,
      item?.urlDefault,
      item?.urlPre,
      ...infoList
        .slice()
        .sort((left, right) => {
          const score = (entry) => {
            if (entry?.imageScene === 'WB_DFT') return 0;
            if (entry?.imageScene === 'WB_PRV') return 1;
            return 2;
          };
          return score(left) - score(right);
        })
        .map((entry) => entry?.url)
    ];

    const picked = candidates
      .map((value) => normalizeImageUrl(value))
      .find((value) => value && !seen.has(value));

    if (!picked) continue;
    seen.add(picked);
    urls.push(picked);
  }

  return urls;
}

function buildBaseNote({ detail, noteId, collection, account }) {
  return {
    title: detail.title || '',
    content: detail.content || '',
    author: detail.author || '',
    authorLink: '',
    date: detail.date || '',
    tags: Array.isArray(detail.tags) ? detail.tags : [],
    images: Array.isArray(detail.images) ? detail.images : [],
    comments: Array.isArray(detail.comments) ? detail.comments : [],
    commentError: detail.commentError || '',
    commentWarningCode: detail.commentWarningCode || '',
    commentTotal: detail.commentTotal || 0,
    noteUrl: detail.url || '',
    noteId: noteId || '',
    collection,
    accountKey: account?.accountKey || '',
    accountUid: account?.uid || '',
    accountNickname: account?.nickname || ''
  };
}

function buildBoardNote({ detail, noteId, collection, account }) {
  return buildBaseNote({ detail, noteId, collection, account });
}

function buildSingleNote({ detail, noteId, account }) {
  return buildBaseNote({
    detail,
    noteId,
    collection: '单条笔记保存',
    account
  });
}

function normalizeCommentControlText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isCommentLoadMoreText(text) {
  const value = normalizeCommentControlText(text);
  if (!value || value.length > 12) return false;
  if (/回复/.test(value)) return false;
  if (/登录/.test(value)) return false;
  if (/展开全文|阅读全文|收起/.test(value)) return false;
  return /更多|展开|查看|more|view/i.test(value);
}

function buildCommentCompletionWarning({ totalCount, actualCount, requiresLogin } = {}) {
  const total = Number(totalCount);
  const actual = Number(actualCount);
  if (!Number.isFinite(total) || total <= 0) return '';
  if (!Number.isFinite(actual) || actual < 0) return '';
  if (actual >= total) return '';
  if (requiresLogin) {
    return `评论可能未完整加载：页面显示共 ${total} 条，当前抓取 ${actual} 条。当前网页端提示“登录查看全部评论内容”，剩余评论可能被网页端登录门槛拦截，请先在当前 Chrome 会话中登录后重试。`;
  }
  return `\u8bc4\u8bba\u53ef\u80fd\u672a\u5b8c\u6574\u52a0\u8f7d\uff1a\u9875\u9762\u663e\u793a\u5171 ${total} \u6761\uff0c\u5f53\u524d\u6293\u53d6 ${actual} \u6761\u3002\u53ef\u80fd\u539f\u56e0\uff1a\u7f51\u9875\u7aef\u9650\u5236\u3001\u8bc4\u8bba\u9700\u5c55\u5f00\u6216\u9700\u8981\u767b\u5f55/\u6253\u5f00\u5e94\u7528\u67e5\u770b\u66f4\u591a\u3002`;
}

function buildCommentApiFailureMessage({ code, message, status } = {}) {
  const normalizedCode = Number.isFinite(code) ? Number(code) : code;
  const normalizedMessage = String(message || '').trim();

  if (normalizedCode === 300011) {
    return '\u8bc4\u8bba\u63a5\u53e3\u8fd4\u56de\uff1a\u5f53\u524d\u8d26\u53f7\u5b58\u5728\u5f02\u5e38\uff0c\u8bf7\u5207\u6362\u8d26\u53f7\u6216\u91cd\u65b0\u767b\u5f55\uff0c\u964d\u4f4e\u9891\u7387\u540e\u91cd\u8bd5\u3002';
  }
  if (normalizedCode === -101) {
    return '\u8bc4\u8bba\u63a5\u53e3\u8fd4\u56de\uff1a\u65e0\u767b\u5f55\u4fe1\u606f\u6216\u767b\u5f55\u5df2\u5931\u6548\uff0c\u8bf7\u5728\u6d4f\u89c8\u5668\u4e2d\u91cd\u65b0\u767b\u5f55\u540e\u91cd\u8bd5\u3002';
  }
  if (normalizedCode === -1 || status === 406) {
    return '\u8bc4\u8bba\u63a5\u53e3\u8bbf\u95ee\u53d7\u9650\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5\uff0c\u5e76\u964d\u4f4e\u91c7\u96c6\u9891\u7387\u540e\u518d\u6293\u53d6\u3002';
  }

  if (normalizedCode || normalizedMessage) {
    const suffix = normalizedMessage ? ` - ${normalizedMessage}` : '';
    return `\u8bc4\u8bba\u63a5\u53e3\u8fd4\u56de\u9519\u8bef\uff1a${normalizedCode || 'unknown'}${suffix}\u3002`;
  }

  return '';
}

function resolveCommentWarningCode({ totalCount, actualCount, requiresLogin, commentError } = {}) {
  const total = Number(totalCount);
  const actual = Number(actualCount);
  const message = String(commentError || '').trim();

  if (requiresLogin && Number.isFinite(total) && total > 0 && Number.isFinite(actual) && actual < total) {
    return 'comment_login_required';
  }
  if (/登录查看全部评论内容|网页端提示.*登录|先在当前 Chrome 会话中登录后重试/.test(message)) {
    return 'comment_login_required';
  }
  if (Number.isFinite(total) && total > 0 && Number.isFinite(actual) && actual < total) {
    return 'comment_incomplete';
  }
  if (message) {
    return 'comment_warning';
  }
  return '';
}

async function resolveCommentError({ comments, state, probeApi, onWarning } = {}) {
  const list = Array.isArray(comments) ? comments : [];
  const warning = buildCommentCompletionWarning({
    totalCount: state?.totalCount,
    actualCount: list.length,
    requiresLogin: state?.requiresLogin
  });
  if (!warning) return '';

  if (typeof probeApi === 'function') {
    try {
      const apiStatus = await probeApi();
      const apiWarning = buildCommentApiFailureMessage(apiStatus || {});
      if (apiWarning) {
        const combined = `${warning} ${apiWarning}`;
        if (typeof onWarning === 'function') {
          onWarning(combined);
        }
        return combined;
      }
    } catch (_) {
      // ignore api probe errors
    }
  }

  if (typeof onWarning === 'function') {
    onWarning(warning);
  }
  return warning;
}

function selectDebuggerTab(tabs, { requireXiaohongshu = true } = {}) {
  const list = Array.isArray(tabs) ? tabs : [];
  const xhsTab = list.find((tab) =>
    tab &&
    tab.type === 'page' &&
    tab.webSocketDebuggerUrl &&
    String(tab.url || '').includes('xiaohongshu.com') &&
    !String(tab.url || '').includes('sw.js')
  );
  if (xhsTab) return xhsTab.webSocketDebuggerUrl;

  if (requireXiaohongshu) {
    throw new Error('No xiaohongshu tab found');
  }

  const pageTab = list.find((tab) =>
    tab &&
    tab.type === 'page' &&
    tab.webSocketDebuggerUrl &&
    !String(tab.url || '').includes('sw.js')
  );
  if (pageTab) return pageTab.webSocketDebuggerUrl;

  throw new Error('No debuggable browser page found');
}

function normalizeBrowserUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^wss?:\/\//i.test(raw)) return raw;
  const normalized = /^https?:\/\//i.test(raw) ? raw : `http://${raw}`;
  if (/\/json(?:\/list)?$/i.test(normalized)) {
    return normalized;
  }
  return `${normalized.replace(/\/+$/, '')}/json`;
}

function uniqueList(values) {
  const seen = new Set();
  const list = [];
  for (const value of values || []) {
    const normalized = String(value || '').trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    list.push(normalized);
  }
  return list;
}

function resolveChromeUserDataDirs({ browserChannel, env = process.env } = {}) {
  const localAppData = String(env.LOCALAPPDATA || '').trim();
  if (!localAppData) return [];

  const channelMap = {
    stable: path.join(localAppData, 'Google', 'Chrome', 'User Data'),
    beta: path.join(localAppData, 'Google', 'Chrome Beta', 'User Data'),
    canary: path.join(localAppData, 'Google', 'Chrome SxS', 'User Data')
  };

  if (browserChannel && channelMap[browserChannel]) {
    return [channelMap[browserChannel]];
  }

  return uniqueList([
    channelMap.stable,
    channelMap.beta,
    channelMap.canary
  ]);
}

function readDevToolsActivePort(filePath, options = {}) {
  const existsSync = options.existsSync || fs.existsSync;
  const readFileSync = options.readFileSync || fs.readFileSync;

  if (!filePath || !existsSync(filePath)) {
    return 0;
  }

  try {
    const raw = String(readFileSync(filePath, 'utf-8') || '');
    const line = raw
      .split(/\r?\n/)
      .map((item) => item.trim())
      .find((item) => /^\d+$/.test(item));
    if (!line) return 0;
    const port = Number(line);
    return Number.isFinite(port) && port > 0 ? port : 0;
  } catch (_) {
    return 0;
  }
}

function buildBrowserTargets(options = {}, dependencies = {}) {
  const explicitBrowserUrl = normalizeBrowserUrl(options.browserUrl);
  if (explicitBrowserUrl) {
    return [explicitBrowserUrl];
  }

  const browserMode = String(options.browserMode || '').trim() || 'isolated';
  if (browserMode !== 'current-browser') {
    return [DEFAULT_ISOLATED_BROWSER_URL];
  }

  const env = dependencies.env || process.env;
  const existsSync = dependencies.existsSync || fs.existsSync;
  const readFileSync = dependencies.readFileSync || fs.readFileSync;
  const fallbackPorts = Array.isArray(dependencies.fallbackPorts) && dependencies.fallbackPorts.length > 0
    ? dependencies.fallbackPorts
    : DEFAULT_CURRENT_BROWSER_PORTS;

  const discoveredTargets = [];
  const userDataDirs = resolveChromeUserDataDirs({
    browserChannel: options.browserChannel || options.channel,
    env
  });

  for (const userDataDir of userDataDirs) {
    const filePath = path.join(userDataDir, 'DevToolsActivePort');
    const port = readDevToolsActivePort(filePath, { existsSync, readFileSync });
    if (port > 0) {
      discoveredTargets.push(`http://127.0.0.1:${port}/json`);
    }
  }

  const fallbackTargets = fallbackPorts.map((port) => `http://127.0.0.1:${port}/json`);
  return uniqueList([...discoveredTargets, ...fallbackTargets]);
}

function fetchTabsFromBrowserTarget(targetUrl) {
  return new Promise((resolve, reject) => {
    http.get(targetUrl, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const tabs = JSON.parse(data);
          resolve(Array.isArray(tabs) ? tabs : []);
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
}

async function getTabWsUrl(options = {}) {
  const resolveTargets = options.resolveTargets || ((params) => buildBrowserTargets(params));
  const fetchTabs = options.fetchTabs || ((target) => fetchTabsFromBrowserTarget(target));
  const targets = uniqueList(resolveTargets(options));
  const errors = [];
  let sawMissingXhs = false;

  for (const target of targets) {
    try {
      const tabs = await fetchTabs(target);
      try {
        return selectDebuggerTab(tabs, options);
      } catch (error) {
        errors.push(error);
        if (/No xiaohongshu tab found/i.test(String(error?.message || ''))) {
          sawMissingXhs = true;
        }
      }
    } catch (error) {
      errors.push(error);
    }
  }

  if (sawMissingXhs) {
    throw new Error('No xiaohongshu tab found');
  }
  if (errors.length > 0) {
    throw errors[0];
  }
  throw new Error('No debuggable browser page found');
}

let commandId = 1;
function send(ws, method, params = {}) {
  const id = commandId++;
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.removeListener('message', handler);
      reject(new Error(`CDP timeout: ${method}`));
    }, 30000);

    const handler = (message) => {
      const data = JSON.parse(message.toString());
      if (data.id !== id) return;
      clearTimeout(timeout);
      ws.removeListener('message', handler);
      if (data.error) {
        reject(new Error(JSON.stringify(data.error)));
        return;
      }
      resolve(data.result);
    };

    ws.on('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const DEBUG_COMMENTS = process.env.XHS_DEBUG_COMMENTS === '1';
// Comment expansion is sensitive to frequency. Default to a conservative throttle so
// bulk exports are less likely to trigger temporary account/anti-abuse limits.
const COMMENT_THROTTLE_MS = resolveNumberEnv(process.env.XHS_COMMENT_THROTTLE_MS, 1500);
const COMMENT_THROTTLE_JITTER_MS = resolveNumberEnv(process.env.XHS_COMMENT_THROTTLE_JITTER_MS, 800);
const COMMENT_RETRY_COUNT = resolveNumberEnv(process.env.XHS_COMMENT_RETRY_COUNT, 2);
const COMMENT_RETRY_BASE_MS = resolveNumberEnv(process.env.XHS_COMMENT_RETRY_BASE_MS, 600);
const COMMENT_RETRY_MAX_MS = resolveNumberEnv(process.env.XHS_COMMENT_RETRY_MAX_MS, 3000);
const COMMENT_MAX_ROUNDS_DEFAULT = 20;
const COMMENT_NO_CHANGE_ROUNDS_DEFAULT = 12;
const REPLY_MAX_ROUNDS_DEFAULT = 20;
const COMMENT_NON_TEXT_PLACEHOLDER = '[\u975e\u6587\u672c\u5185\u5bb9]';

function logCommentDebug(label, state) {
  if (!DEBUG_COMMENTS) return;
  const payload = state && typeof state === 'object' ? state : {};
  const snapshot = {
    hasCommentsRoot: payload.hasCommentsRoot,
    commentCount: payload.commentCount,
    buttonCount: payload.buttonCount,
    totalCount: payload.totalCount,
    reachedEnd: payload.reachedEnd,
    lastCommentId: payload.lastCommentId,
    isLoading: payload.isLoading
  };
  console.log(`[XHS][comments] ${label}: ${JSON.stringify(snapshot)}`);
}

async function connectToChrome(options = {}) {
  const wsUrl = String(options.wsEndpoint || '').trim() || await getTabWsUrl(options);
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve) => ws.on('open', resolve));
  return ws;
}

async function getCurrentPageUrl(ws) {
  const result = await send(ws, 'Runtime.evaluate', {
    expression: 'location.href',
    returnByValue: true
  });
  return result?.result?.value || '';
}

async function evaluateJson(ws, expression) {
  const result = await send(ws, 'Runtime.evaluate', {
    expression,
    returnByValue: true
  });
  return JSON.parse(result?.result?.value || '{}');
}

async function readNoteDetailReadyState(ws) {
  return evaluateJson(ws, `
    (function() {
      const root = document.querySelector('#noteContainer') || document;
      const titleEl = root.querySelector('#detail-title, .note-content .title, [class*="detail"] [class*="title"], h1');
      let errorCode = 0;
      let errorMsg = '';
      let errorPath = '';
      try {
        const parsed = new URL(location.href);
        errorPath = parsed.pathname || '';
        const rawCode = parsed.searchParams.get('error_code') || '';
        errorCode = rawCode ? Number(rawCode) : 0;
        errorMsg = String(parsed.searchParams.get('error_msg') || '').trim();
      } catch (_) {
        // ignore URL parsing failures
      }
      const state = window.__INITIAL_STATE__ || {};
      const noteMap = state.note && state.note.noteDetailMap ? state.note.noteDetailMap : {};
      const hasStateNote = Object.keys(noteMap).some((key) => noteMap[key] && noteMap[key].note);
      return JSON.stringify({
        url: location.href,
        title: titleEl ? titleEl.textContent.trim() : '',
        hasStateNote,
        errorCode,
        errorMsg,
        errorPath
      });
    })()
  `);
}

async function waitForNoteDetailReady({
  readState,
  wait = sleep,
  attempts = 10,
  intervalMs = 500
}) {
  let currentState = { url: '', title: '' };

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await wait(intervalMs);
    currentState = await readState();

    // Some notes are blocked on the web and redirect to a 404 page with an encoded error message.
    // Bail out early so callers can surface a concrete reason instead of a generic timeout.
    if (
      currentState &&
      (currentState.errorMsg || currentState.errorCode) &&
      String(currentState.errorPath || '').includes('/404')
    ) {
      return { ready: false, state: currentState };
    }
    if (
      isNoteDetailUrl(currentState.url) &&
      (String(currentState.title || '').trim() || currentState.hasStateNote)
    ) {
      return { ready: true, state: currentState };
    }
  }

  return { ready: false, state: currentState };
}

async function navigateToUrl(ws, url, options = {}) {
  await send(ws, 'Page.navigate', { url });
  const result = await waitForNoteDetailReady({
    readState: options.readState || (() => readNoteDetailReadyState(ws)),
    wait: options.wait || sleep,
    attempts: options.attempts || 10,
    intervalMs: options.intervalMs || 500
  });

  if (!result.ready) {
    const errorMsg = String(result.state?.errorMsg || '').trim();
    const errorCode = result.state?.errorCode;
    const finalUrl = result.state?.url || url;
    if (errorMsg || errorCode) {
      const codeText = errorCode ? `error_code=${errorCode}` : 'error_code=unknown';
      throw new Error(`无法打开笔记详情页：${errorMsg || '未知错误'}（${codeText}）。当前页面：${finalUrl}`);
    }
    throw new Error(`Timed out waiting for note detail page: ${finalUrl}`);
  }
}

async function readCommentExpansionState(ws) {
  return evaluateJson(ws, `
    (function() {
      const root = document.querySelector('#noteContainer') || document;
      const commentsRoot = root.querySelector('.comments-container, .comments-el');
      const commentCount = commentsRoot ? commentsRoot.querySelectorAll('.comment-item').length : 0;
      let buttonCount = 0;
      let replyButtonCount = 0;
      if (commentsRoot) {
        const primary = Array.from(commentsRoot.querySelectorAll('.show-more, [class*="show-more"]'));
        const nodes = Array.from(commentsRoot.querySelectorAll('button, a, div, span'));
        let candidates = 0;

        for (const node of primary) {
          const textValue = (node.textContent || '').trim();
          if (/\\u56de\\u590d/.test(textValue)) {
            replyButtonCount += 1;
          }
        }

        for (const node of nodes) {
          if (node.closest && node.closest('.comment-item')) continue;
          const textValue = (node.textContent || '').trim();
          if (!textValue || textValue.length > 12) continue;
          if (/\\u56de\\u590d/.test(textValue)) continue;
          if (/\\u767b\\u5f55/.test(textValue)) continue;
          if (/\\u5c55\\u5f00\\u5168\\u6587|\\u9605\\u8bfb\\u5168\\u6587|\\u6536\\u8d77/.test(textValue)) continue;
          if (/\\u66f4\\u591a|\\u5c55\\u5f00|\\u67e5\\u770b|more|view/i.test(textValue)) {
            candidates += 1;
          }
        }

        buttonCount = Math.max(
          primary.filter((node) => {
            const textValue = (node.textContent || '').trim();
            return !/\\u56de\\u590d/.test(textValue) && !/\\u767b\\u5f55/.test(textValue);
          }).length,
          candidates
        );
      }
      const text = commentsRoot ? String(commentsRoot.textContent || '') : '';
      const totalMatch = text.match(/\\u5171\\s*(\\d+)\\s*\\u6761\\u8bc4\\u8bba/);
      const items = commentsRoot ? Array.from(commentsRoot.querySelectorAll('.comment-item')) : [];
      const lastNode = items.length > 0 ? items[items.length - 1] : null;
      const lastCommentId = lastNode
        ? ((lastNode.getAttribute('id') || '').replace(/^comment-/, '') || lastNode.getAttribute('data-rid') || lastNode.getAttribute('data-id') || '')
        : '';
      return JSON.stringify({
        hasCommentsRoot: !!commentsRoot,
        commentCount,
        buttonCount,
        replyButtonCount,
        totalCount: totalMatch ? Number(totalMatch[1]) : 0,
        reachedEnd: text.includes('THE END'),
        lastCommentId,
        isLoading: /\\u52a0\\u8f7d\\u4e2d/.test(text),
        requiresLogin: /\\u767b\\u5f55\\u67e5\\u770b\\u5168\\u90e8\\u8bc4\\u8bba/.test(text) || !!(commentsRoot && commentsRoot.querySelector('.comments-login, .to-login'))
      });
    })()
  `);
}

async function readCommentExpansionStateWithRetry({
  readState,
  wait = sleep,
  attempts = 6,
  intervalMs = 500
} = {}) {
  if (typeof readState !== 'function') {
    throw new Error('readState is required');
  }

  let currentState = {};

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    currentState = await readState();
    if (
      currentState &&
      (
        currentState.totalCount > 0 ||
        currentState.commentCount > 0 ||
        currentState.buttonCount > 0 ||
        currentState.requiresLogin ||
        currentState.reachedEnd ||
        (currentState.hasCommentsRoot && !currentState.isLoading)
      )
    ) {
      return currentState;
    }

    if (attempt < attempts - 1) {
      await wait(intervalMs);
    }
  }

  return currentState || {};
}

function normalizeCommentField(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isStableCommentId(value) {
  const id = normalizeCommentField(value);
  if (!id) return false;
  return !/^comment_\d+$/i.test(id);
}

function buildFallbackCommentKey(comment) {
  if (!comment || typeof comment !== 'object') return '';
  const author = normalizeCommentField(comment.author);
  const content = normalizeCommentField(comment.content);
  const date = normalizeCommentField(comment.date);
  const parentId = normalizeCommentField(comment.parentId);
  const level = Number.isFinite(Number(comment.level)) ? Number(comment.level) : 0;
  if (!author && !content && !date) return '';
  return `f:${JSON.stringify([author, content, date, level, parentId])}`;
}

function mergeCommentPreferComplete(existing, incoming) {
  const left = existing && typeof existing === 'object' ? existing : {};
  const right = incoming && typeof incoming === 'object' ? incoming : {};
  const merged = { ...left, ...right };

  const leftId = normalizeCommentField(left.commentId);
  const rightId = normalizeCommentField(right.commentId);
  const chosenId = isStableCommentId(rightId) ? rightId : (isStableCommentId(leftId) ? leftId : (rightId || leftId));
  merged.commentId = chosenId;

  const leftAuthor = normalizeCommentField(left.author);
  const rightAuthor = normalizeCommentField(right.author);
  merged.author = rightAuthor || leftAuthor;

  const leftContent = normalizeCommentField(left.content);
  const rightContent = normalizeCommentField(right.content);
  const leftIsPlaceholder = leftContent === COMMENT_NON_TEXT_PLACEHOLDER;
  const rightIsPlaceholder = rightContent === COMMENT_NON_TEXT_PLACEHOLDER;

  if (rightContent && (!rightIsPlaceholder || leftIsPlaceholder)) {
    merged.content = rightContent;
  } else if (leftContent) {
    merged.content = leftContent;
  } else {
    merged.content = rightContent || leftContent;
  }

  if (!leftIsPlaceholder && !rightIsPlaceholder && leftContent && rightContent) {
    merged.content = (rightContent.length >= leftContent.length) ? rightContent : leftContent;
  }

  const leftDate = normalizeCommentField(left.date);
  const rightDate = normalizeCommentField(right.date);
  merged.date = (rightDate.length >= leftDate.length) ? rightDate : leftDate;

  const leftParent = normalizeCommentField(left.parentId);
  const rightParent = normalizeCommentField(right.parentId);
  merged.parentId = rightParent || leftParent;

  const leftRoot = normalizeCommentField(left.rootId);
  const rightRoot = normalizeCommentField(right.rootId);
  merged.rootId = rightRoot || leftRoot;

  const leftLevel = Number.isFinite(Number(left.level)) ? Number(left.level) : 0;
  const rightLevel = Number.isFinite(Number(right.level)) ? Number(right.level) : 0;
  merged.level = Math.max(leftLevel, rightLevel);

  const leftLike = Number.isFinite(Number(left.likeCount)) ? Number(left.likeCount) : 0;
  const rightLike = Number.isFinite(Number(right.likeCount)) ? Number(right.likeCount) : 0;
  merged.likeCount = Math.max(leftLike, rightLike);

  const leftReply = Number.isFinite(Number(left.replyCount)) ? Number(left.replyCount) : 0;
  const rightReply = Number.isFinite(Number(right.replyCount)) ? Number(right.replyCount) : 0;
  merged.replyCount = Math.max(leftReply, rightReply);

  merged.isAuthor = Boolean(left.isAuthor) || Boolean(right.isAuthor);
  merged.hasNonTextContent = Boolean(left.hasNonTextContent) || Boolean(right.hasNonTextContent);

  return merged;
}

function createCommentAccumulator(options = {}) {
  const placeholder = normalizeCommentField(options.placeholder || COMMENT_NON_TEXT_PLACEHOLDER) || COMMENT_NON_TEXT_PLACEHOLDER;
  const primaryMap = new Map();
  const fallbackToPrimary = new Map();

  const normalize = (raw) => {
    if (!raw || typeof raw !== 'object') return null;
    const normalized = {
      ...raw,
      commentId: normalizeCommentField(raw.commentId),
      rootId: normalizeCommentField(raw.rootId),
      parentId: normalizeCommentField(raw.parentId),
      author: normalizeCommentField(raw.author),
      content: normalizeCommentField(raw.content),
      date: normalizeCommentField(raw.date),
      level: Number.isFinite(Number(raw.level)) ? Number(raw.level) : 0,
      likeCount: Number.isFinite(Number(raw.likeCount)) ? Number(raw.likeCount) : 0,
      replyCount: Number.isFinite(Number(raw.replyCount)) ? Number(raw.replyCount) : 0,
      isAuthor: Boolean(raw.isAuthor),
      hasNonTextContent: Boolean(raw.hasNonTextContent)
    };

    if (!normalized.content && normalized.hasNonTextContent) {
      normalized.content = placeholder;
    }

    const stableId = isStableCommentId(normalized.commentId) ? normalized.commentId : '';
    if (!stableId && !normalized.author) {
      return null;
    }

    return normalized;
  };

  const addOne = (raw) => {
    const comment = normalize(raw);
    if (!comment) return false;

    const stableKey = isStableCommentId(comment.commentId) ? `id:${comment.commentId}` : '';
    const fallbackKey = buildFallbackCommentKey(comment);

    if (stableKey) {
      if (primaryMap.has(stableKey)) {
        primaryMap.set(stableKey, mergeCommentPreferComplete(primaryMap.get(stableKey), comment));
        if (fallbackKey && !fallbackToPrimary.has(fallbackKey)) fallbackToPrimary.set(fallbackKey, stableKey);
        return true;
      }

      if (fallbackKey && fallbackToPrimary.get(fallbackKey) === fallbackKey && primaryMap.has(fallbackKey)) {
        const merged = mergeCommentPreferComplete(primaryMap.get(fallbackKey), comment);
        primaryMap.delete(fallbackKey);
        primaryMap.set(stableKey, merged);
        fallbackToPrimary.set(fallbackKey, stableKey);
        return true;
      }

      primaryMap.set(stableKey, comment);
      if (fallbackKey && !fallbackToPrimary.has(fallbackKey)) fallbackToPrimary.set(fallbackKey, stableKey);
      return true;
    }

    if (!fallbackKey) return false;

    const mapped = fallbackToPrimary.get(fallbackKey) || fallbackKey;
    if (primaryMap.has(mapped)) {
      primaryMap.set(mapped, mergeCommentPreferComplete(primaryMap.get(mapped), comment));
      return true;
    }

    primaryMap.set(mapped, comment);
    if (!fallbackToPrimary.has(fallbackKey)) fallbackToPrimary.set(fallbackKey, mapped);
    return true;
  };

  return {
    addSnapshot(list) {
      const items = Array.isArray(list) ? list : [];
      let changed = false;
      for (const item of items) {
        if (addOne(item)) changed = true;
      }
      return { changed, size: primaryMap.size };
    },
    toArray() {
      return Array.from(primaryMap.values());
    },
    get size() {
      return primaryMap.size;
    }
  };
}

async function readVisibleComments(ws, options = {}) {
  const evaluate = options.evaluate || ((expression) => evaluateJson(ws, expression));

  const result = await evaluate(`
    (function() {
      const root = document.querySelector('#noteContainer') || document;
      const commentsRoot = root.querySelector('.comments-container, .comments-el');
      if (!commentsRoot) {
        return JSON.stringify({ comments: [] });
      }

      const parseCount = (text) => {
        const value = String(text || '').trim();
        const match = value.match(/\\d+/);
        return match ? Number(match[0]) : 0;
      };

      const nodes = Array.from(commentsRoot.querySelectorAll('.comment-item'));
      const comments = nodes.map((node, index) => {
        const authorEl = node.querySelector('.name');
        const contentEl = node.querySelector('.content, .note-text, .desc');
        const likeEl = node.querySelector('.like-wrapper .count, .like .count');
        const replyEl = node.querySelector('.reply.icon-container .count');
        const dateValueEl = node.querySelector('.info .date span:first-child');
        const locationEl = node.querySelector('.info .date .location');
        const isSub = node.classList.contains('comment-item-sub');
        const parentComment = node.closest('.reply-container')?.closest('.parent-comment');
        const parentNode = isSub ? parentComment?.querySelector('.comment-item:not(.comment-item-sub)') : null;
        const parentId = parentNode
          ? ((parentNode.getAttribute('id') || '').replace(/^comment-/, '') || parentNode.getAttribute('data-rid') || parentNode.getAttribute('data-id') || '')
          : '';
        const rawContent = (contentEl ? contentEl.textContent : node.querySelector('.right')?.childNodes?.[1]?.textContent || '').trim();
        const dateText = (dateValueEl ? dateValueEl.textContent : '').trim();
        const locationText = (locationEl ? locationEl.textContent : '').trim();
        const replyText = (replyEl ? replyEl.textContent : '').trim();
        const nodeId = ((node.getAttribute('id') || '').replace(/^comment-/, '')) || node.getAttribute('data-rid') || node.getAttribute('data-id') || ('comment_' + (index + 1));
        const target = contentEl || node.querySelector('.right') || node;
        const hasNonTextContent = !!(target && target.querySelector && target.querySelector('img, svg, video, canvas, picture'));

        return {
          commentId: nodeId,
          parentId,
          rootId: isSub ? (parentId || node.getAttribute('data-rootid') || nodeId) : nodeId,
          author: (authorEl ? authorEl.textContent : '').trim(),
          content: rawContent,
          hasNonTextContent,
          date: [dateText, locationText].filter(Boolean).join(' ').trim(),
          likeCount: parseCount(likeEl ? likeEl.textContent : ''),
          replyCount: /^\\d+$/.test(replyText) ? Number(replyText) : 0,
          level: isSub ? 1 : 0,
          isAuthor: !!node.querySelector('.tag') || /\\u4f5c\\u8005/.test((node.textContent || '').trim())
        };
      }).filter((item) => {
        if (item.author) return true;
        if (item.content) return true;
        if (item.hasNonTextContent) return true;
        if (item.commentId && (item.likeCount > 0 || item.replyCount > 0 || item.date)) return true;
        return false;
      });

      return JSON.stringify({ comments });
    })()
  `);

  return Array.isArray(result.comments) ? result.comments : [];
}

async function clickNextCommentExpander(ws, options = {}) {
  const evaluate = options.evaluate || ((expression) => evaluateJson(ws, expression));
  const wait = options.wait || sleep;
  const attempts = Number.isFinite(options.attempts) ? Math.max(1, options.attempts) : 2;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await evaluate(`
      (function() {
        const root = document.querySelector('#noteContainer') || document;
        const commentsRoot = root.querySelector('.comments-container, .comments-el');
        if (!commentsRoot) {
          return JSON.stringify({ clicked: false });
        }

        const isLoadMoreText = (text) => {
          const value = String(text || '').replace(/\\s+/g, ' ').trim();
          if (!value || value.length > 12) return false;
          if (/\\u56de\\u590d/.test(value)) return false;
          if (/\\u767b\\u5f55/.test(value)) return false;
          if (/\\u5c55\\u5f00\\u5168\\u6587|\\u9605\\u8bfb\\u5168\\u6587|\\u6536\\u8d77/.test(value)) return false;
          return /\\u66f4\\u591a|\\u5c55\\u5f00|\\u67e5\\u770b|more|view/i.test(value);
        };

        const primary = Array.from(commentsRoot.querySelectorAll('.show-more, [class*="show-more"]'));
        for (const node of primary) {
          const text = (node.textContent || '').trim();
          if (!isLoadMoreText(text)) continue;
          node.scrollIntoView({ block: 'center' });
          node.click();
          return JSON.stringify({ clicked: true });
        }

        const nodes = Array.from(commentsRoot.querySelectorAll('button, a, div, span'));
        for (const node of nodes) {
          if (node.closest && node.closest('.comment-item')) continue;
          const text = (node.textContent || '').trim();
          if (!isLoadMoreText(text)) continue;
          node.scrollIntoView({ block: 'center' });
          node.click();
          return JSON.stringify({ clicked: true });
        }

        return JSON.stringify({ clicked: false });
      })()
    `);

    const payload = typeof result === 'string'
      ? JSON.parse(result || '{}')
      : (result || {});
    if (payload.clicked) return true;
    if (attempt < attempts - 1) {
      await wait(200);
    }
  }

  return false;
}

async function clickNextReplyExpander(ws, options = {}) {
  const evaluate = options.evaluate || ((expression) => evaluateJson(ws, expression));
  const result = await evaluate(`
    (function() {
      const root = document.querySelector('#noteContainer') || document;
      const commentsRoot = root.querySelector('.comments-container, .comments-el');
      if (!commentsRoot) {
        return JSON.stringify({ clicked: false });
      }

      const nodes = Array.from(
        commentsRoot.querySelectorAll('.comment-item:not(.comment-item-sub) .reply.icon-container, .comment-item:not(.comment-item-sub) .reply')
      );

      for (const node of nodes) {
        if (node && node.dataset && node.dataset.xhsCollectorClicked === '1') continue;
        const text = (node.textContent || '').trim();
                const match = text.match(/[0-9\uFF10-\uFF19]+/);
        if (!match) continue;
        const normalized = match[0].replace(/[\uFF10-\uFF19]/g, (ch) => String(ch.charCodeAt(0) - 0xFF10));
        node.scrollIntoView({ block: 'center' });
        if (node && node.dataset) {
          node.dataset.xhsCollectorClicked = '1';
        }
        node.click();
        return JSON.stringify({ clicked: true, count: Number(normalized) });
      }

      return JSON.stringify({ clicked: false });
    })()
  `);

  const payload = typeof result === 'string'
    ? JSON.parse(result || '{}')
    : (result || {});
  return !!payload.clicked;
}

async function expandAllReplies(ws, maxRounds, options = {}) {
  const readState = options.readState || (() => readCommentExpansionState(ws));
  const clickNext = options.clickNext || (() => clickNextReplyExpander(ws));
  const waitForStateChange = options.waitForStateChange || ((params) => waitForCommentStateChange(params));
  const throttleMs = Number.isFinite(options.throttleMs) ? options.throttleMs : COMMENT_THROTTLE_MS;
  const throttleJitterMs = Number.isFinite(options.throttleJitterMs)
    ? options.throttleJitterMs
    : COMMENT_THROTTLE_JITTER_MS;
  const wait = options.wait || sleep;
  const maxRoundsSafe = Number.isFinite(maxRounds)
    ? maxRounds
    : resolveNumberEnv(process.env.XHS_REPLY_MAX_ROUNDS, REPLY_MAX_ROUNDS_DEFAULT);
  const maxNoChangeRounds = Number.isFinite(options.maxNoChangeRounds)
    ? Math.max(0, options.maxNoChangeRounds)
    : resolveNumberEnv(process.env.XHS_REPLY_NO_CHANGE_ROUNDS, 4);
  const throttle = async () => {
    const delay = resolveDelayMs({ baseMs: throttleMs, jitterMs: throttleJitterMs });
    if (delay > 0) {
      await wait(delay);
    }
  };

  let currentState = await readState();
  let noChangeRounds = 0;

  for (let round = 0; round < maxRoundsSafe; round += 1) {
    const clicked = await clickNext();
    if (!clicked) break;

    const result = await waitForStateChange({
      previousState: currentState,
      readState,
      wait,
      attempts: options.attempts || 6,
      intervalMs: options.intervalMs || 300
    });

    currentState = result.state;
    if (!result.changed) {
      noChangeRounds += 1;
      if (noChangeRounds >= maxNoChangeRounds) break;
      await throttle();
      continue;
    }
    noChangeRounds = 0;
    await throttle();
  }
}

async function scrollMoreComments(ws, options = {}) {
  const evaluate = options.evaluate || ((expression) => evaluateJson(ws, expression));
  const result = await evaluate(`
    (function() {
      const pageRoot = document.querySelector('#noteContainer') || document.scrollingElement || document.documentElement || document.body;
      const root = pageRoot || document;
      const commentsRoot = root.querySelector('.comments-container, .comments-el');
      const noteScroller = (commentsRoot && commentsRoot.closest && commentsRoot.closest('.note-scroller')) || document.querySelector('.note-scroller');
      let scrolled = false;
      let scrolledRoot = false;

      function scrollToBottom(el) {
        if (!el) return false;
        const top = el.scrollHeight || 0;
        try {
          if (typeof el.scrollTo === 'function') {
            el.scrollTo({ top, behavior: 'auto' });
          }
        } catch (_) {
          // ignore scrollTo failures
        }
        el.scrollTop = top;
        // Even if scrollTop does not change (already at bottom), keep returning true so callers
        // continue waiting for lazy-loaded comments to render.
        return true;
      }

      function nudgeScroll(el) {
        if (!el) return false;
        const scrollHeight = el.scrollHeight || 0;
        const clientHeight = el.clientHeight || 0;
        const maxTop = Math.max(0, scrollHeight - clientHeight);
        if (maxTop <= 0) return false;
        const before = el.scrollTop || 0;
        const nearBottom = before >= (maxTop - 4);
        if (!nearBottom) return false;

        const upTop = Math.max(0, maxTop - 120);
        el.scrollTop = upTop;
        el.scrollTop = maxTop;
        return (el.scrollTop || 0) !== before;
      }

      if (!commentsRoot) {
        const scrollTarget = noteScroller || pageRoot;
        scrolledRoot = scrollToBottom(scrollTarget) || nudgeScroll(scrollTarget);
        window.scrollBy(0, Math.max(480, Math.floor(window.innerHeight * 0.9)));
        scrolled = scrolled || scrolledRoot;
        return JSON.stringify({ scrolled, scrolledRoot });
      }

      const target =
        commentsRoot.querySelector('.comment-list, .comments-list, [class*="comment-list"], [class*="comments-list"]') ||
        commentsRoot;
      const lastItem = commentsRoot.querySelector('.comment-item:last-child');

      commentsRoot.scrollIntoView({ block: 'end' });
      if (lastItem) {
        lastItem.scrollIntoView({ block: 'end' });
      }

      const scrollCandidates = [target, noteScroller].filter(Boolean);
      for (const candidate of scrollCandidates) {
        const didScroll = scrollToBottom(candidate);
        const didNudge = !didScroll && nudgeScroll(candidate);
        scrolled = scrolled || didScroll || didNudge;
      }

      const rootScrollTarget = noteScroller || pageRoot;
      scrolledRoot = scrollToBottom(rootScrollTarget) || nudgeScroll(rootScrollTarget);
      window.scrollBy(0, Math.max(480, Math.floor(window.innerHeight * 0.9)));

      return JSON.stringify({ scrolled: scrolled || scrolledRoot, scrolledRoot });
    })()
  `);

  const payload = typeof result === 'string'
    ? JSON.parse(result || '{}')
    : (result || {});
  return Boolean(payload.scrolled || payload.scrolledRoot);
}

async function scrollCommentsToTop(ws, options = {}) {
  const evaluate = options.evaluate || ((expression) => evaluateJson(ws, expression));
  const result = await evaluate(`
    (function() {
      const pageRoot = document.querySelector('#noteContainer')
        || document.scrollingElement
        || document.documentElement
        || document.body;
      const root = pageRoot || document;
      const commentsRoot = root.querySelector('.comments-container, .comments-el');
      const noteScroller = (commentsRoot && commentsRoot.closest && commentsRoot.closest('.note-scroller')) || document.querySelector('.note-scroller');
      const target = commentsRoot
        ? (commentsRoot.querySelector('.comment-list, .comments-list, [class*="comment-list"], [class*="comments-list"]') || commentsRoot)
        : null;

      function scrollToTop(el) {
        if (!el) return false;
        const before = Number(el.scrollTop || 0);
        try {
          if (typeof el.scrollTo === 'function') {
            el.scrollTo({ top: 0, behavior: 'auto' });
          }
        } catch (_) {
          // ignore scrollTo failures
        }
        el.scrollTop = 0;
        return before !== 0;
      }

      let moved = false;
      moved = scrollToTop(target) || moved;
      moved = scrollToTop(noteScroller) || moved;
      moved = scrollToTop(pageRoot) || moved;
      try {
        window.scrollTo(0, 0);
      } catch (_) {
        // ignore window scroll failures
      }

      if (commentsRoot) {
        try {
          commentsRoot.scrollIntoView({ block: 'start' });
        } catch (_) {
          // ignore scrollIntoView failures
        }
      }

      return JSON.stringify({ moved });
    })()
  `);

  const payload = typeof result === 'string'
    ? JSON.parse(result || '{}')
    : (result || {});
  return Boolean(payload.moved);
}

async function scrollCommentsByStep(ws, options = {}) {
  const evaluate = options.evaluate || ((expression) => evaluateJson(ws, expression));
  const stepRatio = Number.isFinite(options.stepRatio) ? options.stepRatio : 0.75;
  const minStep = Number.isFinite(options.minStep) ? options.minStep : 180;

  const result = await evaluate(`
    (function() {
      const pageRoot = document.querySelector('#noteContainer')
        || document.scrollingElement
        || document.documentElement
        || document.body;
      const root = pageRoot || document;
      const commentsRoot = root.querySelector('.comments-container, .comments-el');
      const noteScroller = (commentsRoot && commentsRoot.closest && commentsRoot.closest('.note-scroller')) || document.querySelector('.note-scroller');
      const target = commentsRoot
        ? (commentsRoot.querySelector('.comment-list, .comments-list, [class*="comment-list"], [class*="comments-list"]') || commentsRoot)
        : null;

      function pickScrollable(el) {
        if (!el) return null;
        const scrollHeight = Number(el.scrollHeight || 0);
        const clientHeight = Number(el.clientHeight || 0);
        const maxTop = Math.max(0, scrollHeight - clientHeight);
        if (maxTop <= 0) return null;
        return { el, scrollHeight, clientHeight, maxTop };
      }

      const candidate = pickScrollable(target) || pickScrollable(noteScroller) || pickScrollable(pageRoot);
      if (!candidate) {
        try {
          const beforeY = Number(window.scrollY || window.pageYOffset || 0);
          window.scrollBy(0, Math.max(${Number(minStep)}, Math.floor(window.innerHeight * ${Number(stepRatio)})));
          const afterY = Number(window.scrollY || window.pageYOffset || 0);
          return JSON.stringify({ moved: afterY !== beforeY, top: afterY, maxTop: 0 });
        } catch (_) {
          return JSON.stringify({ moved: false, top: 0, maxTop: 0 });
        }
      }

      const before = Number(candidate.el.scrollTop || 0);
      const step = Math.max(${Number(minStep)}, Math.floor(candidate.clientHeight * ${Number(stepRatio)}));
      const maxTop = Number(candidate.maxTop || 0);
      const nearBottom = before >= (maxTop - 4);

      if (nearBottom) {
        // Nudge scroll to trigger lazy-load observers even when we're already at the end.
        const upTop = Math.max(0, maxTop - Math.max(120, Math.floor(step * 0.5)));
        candidate.el.scrollTop = upTop;
        candidate.el.scrollTop = maxTop;
        try {
          if (typeof candidate.el.scrollTo === 'function') {
            candidate.el.scrollTo({ top: maxTop, behavior: 'auto' });
          }
        } catch (_) {
          // ignore scrollTo failures
        }
        return JSON.stringify({ moved: true, top: Number(candidate.el.scrollTop || 0), maxTop });
      }

      const next = Math.min(maxTop, before + step);
      candidate.el.scrollTop = next;
      try {
        if (typeof candidate.el.scrollTo === 'function') {
          candidate.el.scrollTo({ top: next, behavior: 'auto' });
        }
      } catch (_) {
        // ignore scrollTo failures
      }
      return JSON.stringify({ moved: next !== before, top: next, maxTop });
    })()
  `);

  const payload = typeof result === 'string'
    ? JSON.parse(result || '{}')
    : (result || {});
  return Boolean(payload.moved);
}

async function sweepVirtualizedComments(ws, options = {}) {
  const readSnapshot = typeof options.readSnapshot === 'function'
    ? options.readSnapshot
    : (() => readVisibleComments(ws, options));
  const onSnapshot = typeof options.onSnapshot === 'function'
    ? options.onSnapshot
    : (() => {});
  const expandReplies = typeof options.expandReplies === 'function'
    ? options.expandReplies
    : null;
  const advance = typeof options.advance === 'function'
    ? options.advance
    : (() => scrollCommentsByStep(ws, options));
  const scrollToTop = typeof options.scrollToTop === 'function'
    ? options.scrollToTop
    : (() => scrollCommentsToTop(ws, options));
  const wait = options.wait || sleep;
  const settleMs = Number.isFinite(options.settleMs)
    ? Math.max(0, options.settleMs)
    : resolveNumberEnv(process.env.XHS_COMMENT_SWEEP_SETTLE_MS, 180);
  const maxSteps = Number.isFinite(options.maxSteps)
    ? Math.max(0, options.maxSteps)
    : resolveNumberEnv(process.env.XHS_COMMENT_SWEEP_STEPS, 120);

  try {
    await scrollToTop();
  } catch (_) {
    // ignore scroll to top failures
  }

  try {
    onSnapshot(await readSnapshot());
  } catch (_) {
    // ignore snapshot failures
  }

  for (let step = 0; step < maxSteps; step += 1) {
    if (expandReplies) {
      try {
        await expandReplies({ step });
      } catch (_) {
        // ignore reply expansion failures
      }
    }

    try {
      onSnapshot(await readSnapshot());
    } catch (_) {
      // ignore snapshot failures
    }

    let moved = false;
    try {
      moved = await advance({ step });
    } catch (_) {
      moved = false;
    }
    if (!moved) break;

    if (settleMs > 0) {
      await wait(settleMs);
    }

    try {
      onSnapshot(await readSnapshot());
    } catch (_) {
      // ignore snapshot failures
    }
  }
}

function shouldLoadMoreComments(state) {
  if (!state) return false;
  if (state.requiresLogin) return false;
  if (state.buttonCount > 0) return true;
  if (state.reachedEnd) return false;
  if (state.totalCount > 0) {
    return state.commentCount < state.totalCount;
  }
  return false;
}

function shouldSkipCommentSweep(state) {
  return Boolean(state?.requiresLogin);
}

function shouldPrimeComments(state) {
  if (!state?.hasCommentsRoot) return false;
  if (state.commentCount > 0) return false;
  if (state.buttonCount > 0) return false;
  if (state.totalCount > 0) return false;
  if (state.reachedEnd) return false;
  return !!state.isLoading;
}

async function waitForCommentStateChange({
  previousState,
  readState,
  wait = sleep,
  attempts = 6,
  intervalMs = 300
}) {
  let currentState = previousState;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await wait(intervalMs);
    currentState = await readState();
    if (
      currentState.hasCommentsRoot !== previousState.hasCommentsRoot ||
      currentState.commentCount !== previousState.commentCount ||
      currentState.buttonCount !== previousState.buttonCount ||
      currentState.totalCount !== previousState.totalCount ||
      currentState.lastCommentId !== previousState.lastCommentId ||
      currentState.reachedEnd !== previousState.reachedEnd ||
      currentState.isLoading !== previousState.isLoading
    ) {
      return { changed: true, state: currentState };
    }
  }

  return { changed: false, state: currentState };
}

async function ensureCommentsReady(ws, maxRounds = 4, options = {}) {
  const readState = options.readState || (() => readCommentExpansionState(ws));
  const scrollMore = options.scrollMore || (() => scrollMoreComments(ws));
  const waitForStateChange = options.waitForStateChange || ((params) => waitForCommentStateChange(params));
  const throttleMs = Number.isFinite(options.throttleMs) ? options.throttleMs : COMMENT_THROTTLE_MS;
  const throttleJitterMs = Number.isFinite(options.throttleJitterMs)
    ? options.throttleJitterMs
    : COMMENT_THROTTLE_JITTER_MS;
  const wait = options.wait || sleep;
  const throttle = async () => {
    const delay = resolveDelayMs({ baseMs: throttleMs, jitterMs: throttleJitterMs });
    if (delay > 0) {
      await wait(delay);
    }
  };

  let currentState = await readState();
  logCommentDebug('ready:init', currentState);

  for (let round = 0; round < maxRounds; round += 1) {
    if (!shouldPrimeComments(currentState)) break;

    let advanced = false;
    try {
      advanced = await scrollMore();
    } catch (_) {
      advanced = false;
    }

    const passiveWait = !advanced && Boolean(currentState?.isLoading);
    if (!advanced && !passiveWait) break;

    const result = await waitForStateChange({
      previousState: currentState,
      readState,
      wait: options.wait || sleep,
      attempts: passiveWait
        ? (options.loadingAttempts || Math.max(options.attempts || 8, 10))
        : (options.attempts || 8),
      intervalMs: passiveWait
        ? (options.loadingIntervalMs || Math.max(options.intervalMs || 300, 400))
        : (options.intervalMs || 300)
    });

    currentState = result.state;
    logCommentDebug(`ready:round:${round + 1}:${result.changed ? 'changed' : 'same'}`, currentState);
    if (!result.changed) {
      if (!currentState?.isLoading) break;
      await throttle();
      continue;
    }
    await throttle();
  }

  return currentState;
}

async function expandAllComments(ws, maxRounds, options = {}) {
  const readState = options.readState || (() => readCommentExpansionState(ws));
  const clickNext = options.clickNext || (() => clickNextCommentExpander(ws));
  const scrollMore = options.scrollMore || (() => scrollMoreComments(ws));
  const waitForStateChange = options.waitForStateChange || ((params) => waitForCommentStateChange(params));
  const shouldLoadMore = options.shouldLoadMore || ((state) => shouldLoadMoreComments(state));
  const throttleMs = Number.isFinite(options.throttleMs) ? options.throttleMs : COMMENT_THROTTLE_MS;
  const throttleJitterMs = Number.isFinite(options.throttleJitterMs)
    ? options.throttleJitterMs
    : COMMENT_THROTTLE_JITTER_MS;
  const wait = options.wait || sleep;
  const stuckAttempts = Number.isFinite(options.stuckAttempts)
    ? Math.max(1, options.stuckAttempts)
    : resolveNumberEnv(process.env.XHS_COMMENT_STUCK_ATTEMPTS, 18);
  const stuckIntervalMs = Number.isFinite(options.stuckIntervalMs)
    ? Math.max(50, options.stuckIntervalMs)
    : resolveNumberEnv(process.env.XHS_COMMENT_STUCK_INTERVAL_MS, 800);
  const maxRoundsSafe = Number.isFinite(maxRounds)
    ? maxRounds
    : resolveNumberEnv(process.env.XHS_COMMENT_MAX_ROUNDS, COMMENT_MAX_ROUNDS_DEFAULT);
  const maxNoChangeRounds = Number.isFinite(options.maxNoChangeRounds)
    ? Math.max(0, options.maxNoChangeRounds)
    : resolveNumberEnv(process.env.XHS_COMMENT_NO_CHANGE_ROUNDS, COMMENT_NO_CHANGE_ROUNDS_DEFAULT);
  const throttle = async (multiplier = 1) => {
    const baseMs = Math.max(0, throttleMs * (Number.isFinite(multiplier) ? multiplier : 1));
    const delay = resolveDelayMs({ baseMs, jitterMs: throttleJitterMs });
    if (delay > 0) {
      await wait(delay);
    }
  };
  let noChangeRounds = 0;

  let currentState = await ensureCommentsReady(ws, options.readyAttempts || 4, {
    readState,
    scrollMore,
    waitForStateChange,
    wait,
    attempts: options.attempts,
    intervalMs: options.intervalMs,
    throttleMs,
    throttleJitterMs
  });
  logCommentDebug('expand:init', currentState);

  for (let round = 0; round < maxRoundsSafe; round += 1) {
    if (!shouldLoadMore(currentState)) break;

    let advanced = false;
    if (currentState.buttonCount > 0) {
      advanced = await clickNext();
      if (!advanced) {
        advanced = await scrollMore();
      }
    } else {
      advanced = await scrollMore();
    }
    if (!advanced) break;

    const waitAttempts = noChangeRounds > 0 ? stuckAttempts : (options.attempts || 6);
    const waitIntervalMs = noChangeRounds > 0 ? stuckIntervalMs : (options.intervalMs || 300);

    const result = await waitForStateChange({
      previousState: currentState,
      readState,
      wait,
      attempts: waitAttempts,
      intervalMs: waitIntervalMs
    });

    currentState = result.state;
    logCommentDebug(`expand:round:${round + 1}:${result.changed ? 'changed' : 'same'}`, currentState);
    if (result.changed) {
      noChangeRounds = 0;
      await throttle();
      continue;
    }

    noChangeRounds += 1;
    if (!shouldLoadMore(currentState)) break;
    if (noChangeRounds >= maxNoChangeRounds) break;
    await throttle(1 + Math.min(noChangeRounds, 4));
  }
  if (options.expandReplies !== false) {
    await expandAllReplies(ws, options.replyRounds, {
      readState,
      waitForStateChange,
      wait,
      attempts: options.attempts,
      intervalMs: options.intervalMs,
      throttleMs,
      throttleJitterMs
    });
  }

}

async function extractNoteCommentsLegacy(ws) {
  await expandAllComments(ws);

  const result = await evaluateJson(ws, `
    (function() {
      const root = document.querySelector('#noteContainer') || document;
      const commentsRoot = root.querySelector('.comments-container, .comments-el');
      if (!commentsRoot) {
        return JSON.stringify({ comments: [] });
      }

      const parseCount = (text) => {
        const value = String(text || '').trim();
        const match = value.match(/\\d+/);
        return match ? Number(match[0]) : 0;
      };

      const nodes = Array.from(commentsRoot.querySelectorAll('.comment-item'));
      const comments = nodes.map((node, index) => {
        const authorEl = node.querySelector('.name');
        const contentEl = node.querySelector('.content, .note-text, .desc');
        const likeEl = node.querySelector('.like-wrapper .count, .like .count');
        const replyEl = node.querySelector('.reply.icon-container .count');
        const dateValueEl = node.querySelector('.info .date span:first-child');
        const locationEl = node.querySelector('.info .date .location');
        const isSub = node.classList.contains('comment-item-sub');
        const parentComment = node.closest('.reply-container')?.closest('.parent-comment');
        const parentNode = isSub ? parentComment?.querySelector('.comment-item:not(.comment-item-sub)') : null;
        const parentId = parentNode
          ? ((parentNode.getAttribute('id') || '').replace(/^comment-/, '') || parentNode.getAttribute('data-rid') || parentNode.getAttribute('data-id') || '')
          : '';
        const content = (contentEl ? contentEl.textContent : node.querySelector('.right')?.childNodes?.[1]?.textContent || '').trim();
        const dateText = (dateValueEl ? dateValueEl.textContent : '').trim();
        const locationText = (locationEl ? locationEl.textContent : '').trim();
        const replyText = (replyEl ? replyEl.textContent : '').trim();
        const nodeId = ((node.getAttribute('id') || '').replace(/^comment-/, '')) || node.getAttribute('data-rid') || node.getAttribute('data-id') || ('comment_' + (index + 1));

        return {
          commentId: nodeId,
          parentId,
          rootId: isSub ? (parentId || node.getAttribute('data-rootid') || nodeId) : nodeId,
          author: (authorEl ? authorEl.textContent : '').trim(),
          content,
          date: [dateText, locationText].filter(Boolean).join(' ').trim(),
          likeCount: parseCount(likeEl ? likeEl.textContent : ''),
          replyCount: /^\\d+$/.test(replyText) ? Number(replyText) : 0,
          level: isSub ? 1 : 0,
          isAuthor: !!node.querySelector('.tag') || /\u4f5c\u8005/.test((node.textContent || '').trim())
        };
      }).filter((item) => item.author && item.content);

      return JSON.stringify({ comments });
    })()
  `);

  return Array.isArray(result.comments) ? result.comments : [];
}

async function extractNoteComments(ws) {
  const accumulator = createCommentAccumulator();
  const addSnapshot = async (label = '') => {
    const snapshot = await readVisibleComments(ws);
    const before = accumulator.size;
    const result = accumulator.addSnapshot(snapshot);
    if (DEBUG_COMMENTS) {
      const tag = label ? `:${label}` : '';
      console.log(`[XHS][comments] snapshot${tag}: len=${Array.isArray(snapshot) ? snapshot.length : 0} size=${accumulator.size} changed=${Boolean(result?.changed)} (+${accumulator.size - before})`);
    }
  };

  await addSnapshot('init');

  const waitForStateChange = async (params) => {
    const result = await waitForCommentStateChange(params);
    try {
      await addSnapshot('state');
    } catch (_) {
      // ignore snapshot errors so expansion can continue
    }
    return result;
  };

  const shouldLoadMore = (state) => {
    if (!shouldLoadMoreComments(state)) return false;
    const total = Number(state?.totalCount || 0);
    if (total > 0 && accumulator.size >= total) return false;
    return true;
  };

  await expandAllComments(ws, undefined, {
    waitForStateChange,
    shouldLoadMore,
    expandReplies: false,
    scrollMore: () => scrollCommentsByStep(ws)
  });

  const postExpandState = await readCommentExpansionStateWithRetry({
    readState: () => readCommentExpansionState(ws),
    wait: sleep,
    attempts: 3,
    intervalMs: 250
  });
  if (shouldSkipCommentSweep(postExpandState)) {
    await addSnapshot('login-gated');
    return accumulator.toArray();
  }

  await sweepVirtualizedComments(ws, {
    onSnapshot: (list) => accumulator.addSnapshot(list),
    readSnapshot: () => readVisibleComments(ws),
    expandReplies: async () => {
      await expandAllReplies(ws, undefined, {
        waitForStateChange,
        throttleMs: Math.min(COMMENT_THROTTLE_MS, 800),
        throttleJitterMs: Math.min(COMMENT_THROTTLE_JITTER_MS, 400)
      });
    }
  });
  await addSnapshot('final');

  return accumulator.toArray();
}

async function extractNoteDetail(ws) {
  const result = await evaluateJson(ws, `
    (function() {
      const root = document.querySelector('#noteContainer') || document;
      const titleEl = root.querySelector('#detail-title, .note-content .title, [class*="detail"] [class*="title"], h1');
      const descEl = root.querySelector('#detail-desc, .note-content .desc, [class*="detail"] [class*="desc"], [class*="detail"] [class*="content"]');
      const authorEl = root.querySelector('.info .name, .author-container .name, [class*="author"] .name, a.name[href*="/user/profile/"]');
      const dateEl = root.querySelector('.bottom-container .date, .note-content .date, [class*="detail"] [class*="date"], [class*="detail"] [class*="time"], time');

      const tags = [];
      root.querySelectorAll('a[href*="keyword="], a[href*="/search_result/"]').forEach((a) => {
        const value = (a.textContent || '').trim().replace(/^#/, '');
        if (value && !tags.includes(value)) tags.push(value);
      });

      const images = [];
      root.querySelectorAll('.note-slider-img img, .swiper-slide .note-slider-img img, .swiper-slide .img-container img').forEach((img) => {
        const src = img.currentSrc || img.src || '';
        if (src.startsWith('http') && !images.includes(src) && !src.includes('avatar')) {
          images.push(src);
        }
      });

      const state = window.__INITIAL_STATE__ || {};
      const noteMap = state.note && state.note.noteDetailMap ? state.note.noteDetailMap : {};
      const noteKey = Object.keys(noteMap).find((key) => key && noteMap[key] && noteMap[key].note) || '';
      const stateNote = noteKey && noteMap[noteKey] ? (noteMap[noteKey].note || null) : null;

      return JSON.stringify({
        url: location.href,
        title: titleEl ? titleEl.textContent.trim() : '',
        content: descEl ? descEl.innerText.trim() : '',
        author: authorEl ? authorEl.textContent.trim() : '',
        date: dateEl ? dateEl.textContent.trim() : '',
        tags,
        images,
        stateNote
      });
    })()
  `);

  const stateImages = extractImageUrlsFromStateNote(result.stateNote);
  const domImages = Array.isArray(result.images)
    ? result.images.map((value) => normalizeImageUrl(value)).filter(Boolean)
    : [];
  result.images = domImages.length > 0 ? domImages : stateImages;
  delete result.stateNote;

  try {
    result.comments = await retryAsync(
      () => extractNoteComments(ws),
      {
        retries: COMMENT_RETRY_COUNT,
        baseDelayMs: COMMENT_RETRY_BASE_MS,
        jitterMs: COMMENT_THROTTLE_JITTER_MS,
        wait: sleep,
        onRetry: (error, attempt, delayMs) => {
          logWarn(`[XHS][comments] retry ${attempt} after ${delayMs}ms: ${error.message || error}`);
        }
      }
    );
    result.commentError = '';
    result.commentWarningCode = '';
    try {
      const state = await readCommentExpansionStateWithRetry({
        readState: () => readCommentExpansionState(ws),
        wait: sleep,
        attempts: 6,
        intervalMs: 500
      });
      result.commentTotal = Number(state?.totalCount || 0);
      // API probe is used only when comments appear incomplete. Default it on so exports
      // surface actionable hints (login expired / account abnormal) without requiring extra flags.
      const shouldProbeApi = process.env.XHS_COMMENT_PROBE_API !== '0';
      const warning = await resolveCommentError({
        comments: result.comments,
        state,
        probeApi: shouldProbeApi ? async () => {
          const response = await send(ws, 'Runtime.evaluate', {
            expression: `
              (async function() {
                const state = window.__INITIAL_STATE__ || {};
                const noteMap = state.note && state.note.noteDetailMap ? state.note.noteDetailMap : {};
                const pathMatch = (location.pathname || '').match(/\\/(?:explore|discovery\\/item)\\/([A-Za-z0-9]+)/i);
                const noteIdFromUrl = pathMatch ? pathMatch[1] : '';
                const noteKey = noteIdFromUrl && noteMap[noteIdFromUrl]
                  ? noteIdFromUrl
                  : (Object.keys(noteMap).find((key) => key && noteMap[key] && noteMap[key].note) || noteIdFromUrl);
                const commentState = noteKey && noteMap[noteKey] ? noteMap[noteKey].comments : null;
                const cursor = commentState && commentState.cursor ? commentState.cursor : '';
                const xsecToken = new URL(location.href).searchParams.get('xsec_token') || '';
                if (!noteIdFromUrl) {
                  return JSON.stringify({ status: 0, code: 0, message: '', success: true });
                }
                const api = 'https://edith.xiaohongshu.com/api/sns/web/v2/comment/page';
                const params = new URLSearchParams({
                  note_id: noteIdFromUrl,
                  cursor,
                  top_comment_id: '',
                  image_formats: 'jpg,webp',
                  xsec_token: xsecToken
                });
                const url = api + '?' + params.toString();
                const res = await fetch(url, { credentials: 'include' });
                let body = {};
                try {
                  body = await res.json();
                } catch (error) {
                  body = { message: await res.text() };
                }
                return JSON.stringify({
                  status: res.status,
                  code: body.code,
                  message: body.msg || body.message || '',
                  success: body.success
                });
              })()
            `,
            returnByValue: true,
            awaitPromise: true
          });

          return JSON.parse(response?.result?.value || '{}');
        } : undefined,
        onWarning: (message) => {
          logWarn(`[XHS][comments] ${message}`);
        }
      });
      if (warning) {
        result.commentError = warning;
        result.commentWarningCode = resolveCommentWarningCode({
          totalCount: state?.totalCount,
          actualCount: result.comments.length,
          requiresLogin: state?.requiresLogin,
          commentError: warning
        });
      }
    } catch (_) {
      // ignore completion warning errors
    }
  } catch (error) {
    result.comments = [];
    result.commentError = error && error.message ? error.message : '\u8bc4\u8bba\u533a\u91c7\u96c6\u5931\u8d25';
    result.commentWarningCode = resolveCommentWarningCode({
      totalCount: result.commentTotal || 0,
      actualCount: 0,
      commentError: result.commentError
    });
  }

  return result;
}

function extractNoteIdFromUrl(url) {
  const match = String(url || '').match(/\/(?:explore|discovery\/item)\/([A-Za-z0-9]+)/i);
  return match ? match[1] : '';
}

module.exports = {
  buildBoardNote,
  buildBrowserTargets,
  buildSingleNote,
  buildCommentApiFailureMessage,
  buildCommentCompletionWarning,
  clickNextCommentExpander,
  clickNextReplyExpander,
  connectToChrome,
  createCommentAccumulator,
  ensureCommentsReady,
  extractImageUrlsFromStateNote,
  expandAllComments,
  expandAllReplies,
  extractNoteComments,
  extractNoteDetail,
  extractNoteIdFromUrl,
  getTabWsUrl,
  getCurrentPageUrl,
  isCommentLoadMoreText,
  isNoteDetailUrl,
  navigateToUrl,
  readCommentExpansionState,
  readCommentExpansionStateWithRetry,
  readVisibleComments,
  readNoteDetailReadyState,
  resolveCommentError,
  resolveCommentWarningCode,
  selectDebuggerTab,
  send,
  shouldSkipCommentSweep,
  sleep,
  sweepVirtualizedComments,
  scrollMoreComments,
  waitForNoteDetailReady,
  waitForCommentStateChange
};




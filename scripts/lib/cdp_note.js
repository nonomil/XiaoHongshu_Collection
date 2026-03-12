const http = require('http');
const WebSocket = require('ws');

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

function getTabWsUrl(options = {}) {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:9222/json', (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const tabs = JSON.parse(data);
        try {
          resolve(selectDebuggerTab(tabs, options));
        } catch (error) {
          reject(error);
        }
      });
    }).on('error', reject);
  });
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

async function connectToChrome(options = {}) {
  const wsUrl = await getTabWsUrl(options);
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
      return JSON.stringify({
        url: location.href,
        title: titleEl ? titleEl.textContent.trim() : ''
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
    if (isNoteDetailUrl(currentState.url) && String(currentState.title || '').trim()) {
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
    throw new Error(`Timed out waiting for note detail page: ${result.state?.url || url}`);
  }
}

async function readCommentExpansionState(ws) {
  return evaluateJson(ws, `
    (function() {
      const root = document.querySelector('#noteContainer') || document;
      const commentsRoot = root.querySelector('.comments-container, .comments-el');
      const commentCount = commentsRoot ? commentsRoot.querySelectorAll('.comment-item').length : 0;
      const buttonCount = commentsRoot ? commentsRoot.querySelectorAll('.show-more').length : 0;
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
        totalCount: totalMatch ? Number(totalMatch[1]) : 0,
        reachedEnd: text.includes('THE END'),
        lastCommentId,
        isLoading: /加载中/.test(text)
      });
    })()
  `);
}

async function clickNextCommentExpander(ws) {
  const result = await evaluateJson(ws, `
    (function() {
      const root = document.querySelector('#noteContainer') || document;
      const commentsRoot = root.querySelector('.comments-container, .comments-el');
      if (!commentsRoot) {
        return JSON.stringify({ clicked: false });
      }

      commentsRoot.scrollIntoView({ block: 'end' });
      const button = commentsRoot.querySelector('.show-more');
      if (!button) {
        return JSON.stringify({ clicked: false });
      }

      button.scrollIntoView({ block: 'center' });
      button.click();
      return JSON.stringify({ clicked: true });
    })()
  `);

  return !!result.clicked;
}

async function scrollMoreComments(ws) {
  const result = await evaluateJson(ws, `
    (function() {
      const root = document.querySelector('#noteContainer') || document;
      const commentsRoot = root.querySelector('.comments-container, .comments-el');
      if (!commentsRoot) {
        return JSON.stringify({ scrolled: false });
      }

      const target =
        commentsRoot.querySelector('.comment-list, .comments-list, [class*="comment-list"], [class*="comments-list"]') ||
        commentsRoot;
      const lastItem = commentsRoot.querySelector('.comment-item:last-child');

      commentsRoot.scrollIntoView({ block: 'end' });
      if (lastItem) {
        lastItem.scrollIntoView({ block: 'end' });
      }

      if (typeof target.scrollTo === 'function') {
        target.scrollTo({ top: target.scrollHeight, behavior: 'instant' });
      }
      target.scrollTop = target.scrollHeight;
      window.scrollBy(0, Math.max(480, Math.floor(window.innerHeight * 0.9)));

      return JSON.stringify({ scrolled: true });
    })()
  `);

  return !!result.scrolled;
}

function shouldLoadMoreComments(state) {
  if (!state) return false;
  if (state.buttonCount > 0) return true;
  if (state.reachedEnd) return false;
  if (state.totalCount > 0) {
    return state.commentCount < state.totalCount;
  }
  return false;
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

  let currentState = await readState();

  for (let round = 0; round < maxRounds; round += 1) {
    if (!shouldPrimeComments(currentState)) break;

    const advanced = await scrollMore();
    if (!advanced) break;

    const result = await waitForStateChange({
      previousState: currentState,
      readState,
      wait: options.wait || sleep,
      attempts: options.attempts || 8,
      intervalMs: options.intervalMs || 300
    });

    currentState = result.state;
    if (!result.changed) break;
  }

  return currentState;
}

async function expandAllComments(ws, maxRounds = 12, options = {}) {
  const readState = options.readState || (() => readCommentExpansionState(ws));
  const clickNext = options.clickNext || (() => clickNextCommentExpander(ws));
  const scrollMore = options.scrollMore || (() => scrollMoreComments(ws));
  const waitForStateChange = options.waitForStateChange || ((params) => waitForCommentStateChange(params));

  let currentState = await ensureCommentsReady(ws, options.readyAttempts || 4, {
    readState,
    scrollMore,
    waitForStateChange,
    wait: options.wait,
    attempts: options.attempts,
    intervalMs: options.intervalMs
  });

  for (let round = 0; round < maxRounds; round += 1) {
    if (!shouldLoadMoreComments(currentState)) break;

    let advanced = false;
    if (currentState.buttonCount > 0) {
      advanced = await clickNext();
    } else {
      advanced = await scrollMore();
    }
    if (!advanced) break;

    const result = await waitForStateChange({
      previousState: currentState,
      readState,
      wait: options.wait || sleep,
      attempts: options.attempts || 6,
      intervalMs: options.intervalMs || 300
    });

    currentState = result.state;
    if (!result.changed && !shouldLoadMoreComments(currentState)) break;
    if (!result.changed) break;
  }
}

async function extractNoteComments(ws) {
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
    result.comments = await extractNoteComments(ws);
    result.commentError = '';
  } catch (error) {
    result.comments = [];
    result.commentError = error && error.message ? error.message : '\u8bc4\u8bba\u533a\u91c7\u96c6\u5931\u8d25';
  }

  return result;
}

function extractNoteIdFromUrl(url) {
  const match = String(url || '').match(/\/(?:explore|discovery\/item)\/([A-Za-z0-9]+)/i);
  return match ? match[1] : '';
}

module.exports = {
  buildBoardNote,
  buildSingleNote,
  clickNextCommentExpander,
  connectToChrome,
  ensureCommentsReady,
  extractImageUrlsFromStateNote,
  expandAllComments,
  extractNoteComments,
  extractNoteDetail,
  extractNoteIdFromUrl,
  getCurrentPageUrl,
  isNoteDetailUrl,
  navigateToUrl,
  readCommentExpansionState,
  readNoteDetailReadyState,
  selectDebuggerTab,
  send,
  sleep,
  scrollMoreComments,
  waitForNoteDetailReady,
  waitForCommentStateChange
};

const http = require('http');
const WebSocket = require('ws');

function isNoteDetailUrl(url) {
  return /xiaohongshu\.com\/(?:explore|discovery\/item)\//i.test(String(url || ''));
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
      return JSON.stringify({ commentCount, buttonCount });
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
      currentState.commentCount !== previousState.commentCount ||
      currentState.buttonCount !== previousState.buttonCount
    ) {
      return { changed: true, state: currentState };
    }
  }

  return { changed: false, state: currentState };
}

async function expandAllComments(ws, maxRounds = 12, options = {}) {
  const readState = options.readState || (() => readCommentExpansionState(ws));
  const clickNext = options.clickNext || (() => clickNextCommentExpander(ws));
  const waitForStateChange = options.waitForStateChange || ((params) => waitForCommentStateChange(params));

  let currentState = await readState();

  for (let round = 0; round < maxRounds; round += 1) {
    if (!currentState.buttonCount) break;

    const clicked = await clickNext();
    if (!clicked) break;

    const result = await waitForStateChange({
      previousState: currentState,
      readState,
      wait: options.wait || sleep,
      attempts: options.attempts || 6,
      intervalMs: options.intervalMs || 300
    });

    currentState = result.state;
    if (!result.changed && currentState.buttonCount === 0) break;
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

      return JSON.stringify({
        url: location.href,
        title: titleEl ? titleEl.textContent.trim() : '',
        content: descEl ? descEl.innerText.trim() : '',
        author: authorEl ? authorEl.textContent.trim() : '',
        date: dateEl ? dateEl.textContent.trim() : '',
        tags,
        images
      });
    })()
  `);

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
  waitForNoteDetailReady,
  waitForCommentStateChange
};

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { buildAccountKey } = require('./ai/account');
const { parseUserMeResponse } = require('./ai/account_detect');
const { buildAccountKeyFromDom } = require('./ai/account_dom');
const { assertValidTask, buildCollectionTask } = require('./lib/task');
const { runTaskPipeline } = require('./lib/pipeline');

const PROJECT_DIR = path.resolve(__dirname, '..');
const RAW_PATH = path.join(PROJECT_DIR, 'data', 'raw_notes.json');

const BOARDS = [
  { name: 'AI', href: 'https://www.xiaohongshu.com/board/699c2c9c0000000025031008' },
  { name: '笔记', href: 'https://www.xiaohongshu.com/board/699c2baa000000002600ba5b' }
];

function getTabWsUrl() {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:9222/json', res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const tabs = JSON.parse(data);
        const xhsTab = tabs.find(t => t.url.includes('xiaohongshu.com') && !t.url.includes('sw.js'));
        if (xhsTab) resolve(xhsTab.webSocketDebuggerUrl);
        else reject(new Error('No xiaohongshu tab found'));
      });
    }).on('error', reject);
  });
}

let cmdId = 1;
function send(ws, method, params = {}) {
  const id = cmdId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.removeListener('message', handler); reject(new Error('Timeout')); }, 30000);
    const handler = (msg) => {
      const data = JSON.parse(msg.toString());
      if (data.id === id) {
        clearTimeout(timer);
        ws.removeListener('message', handler);
        if (data.error) reject(new Error(JSON.stringify(data.error)));
        else resolve(data.result);
      }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getAccountInfo(ws) {
  const result = await send(ws, 'Runtime.evaluate', {
    expression: `
      (async function() {
        function pickUserFromState(state) {
          if (!state) return null;
          if (state.user && typeof state.user === 'object') return state.user;
          if (state.userInfo && typeof state.userInfo === 'object') return state.userInfo;
          if (state.user && state.user.userInfo) return state.user.userInfo;
          return null;
        }

        let nickname = '';
        let uid = '';

        try {
          const state = window.__INITIAL_STATE__ || null;
          const user = pickUserFromState(state);
          if (user) {
            nickname = user.nickname || user.name || '';
            uid = user.userId || user.uid || user.id || '';
          }
        } catch (e) {}

        try {
          const profileLink = document.querySelector('a[href*="/user/profile/"]');
          if (profileLink) {
            const match = profileLink.href.match(/\/user\/profile\/([a-f0-9]+)/);
            if (match && !uid) uid = match[1];
            if (!nickname) nickname = profileLink.getAttribute('title') || profileLink.textContent || '';
          }
        } catch (e) {}

        try {
          if (!uid) uid = localStorage.getItem('userId') || localStorage.getItem('uid') || '';
          if (!nickname) nickname = localStorage.getItem('nickname') || '';
        } catch (e) {}

        if (!uid || !nickname) {
          try {
            const res = await fetch('https://edith.xiaohongshu.com/api/sns/web/v2/user/me', { credentials: 'include' });
            if (res && res.ok) {
              const data = await res.json();
              const me = data?.data || data?.user || data?.data?.user || data?.data?.me || data?.data?.info || data?.data?.user_info;
              if (me) {
                if (!uid) uid = me.userId || me.uid || me.id || '';
                if (!nickname) nickname = me.nickname || me.name || '';
              }
            }
          } catch (e) {}
        }

        return { uid: String(uid || ''), nickname: String(nickname || '') };
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });
  return result?.result?.value || { uid: '', nickname: '' };
}

function loadExistingNotes() {
  if (!fs.existsSync(RAW_PATH)) return { boards: {}, failed: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(RAW_PATH, 'utf-8'));
    return {
      boards: raw.boards || {},
      failed: raw.failed || []
    };
  } catch {
    return { boards: {}, failed: [] };
  }
}

function buildExistingIdSet(boards) {
  const set = new Set();
  for (const notes of Object.values(boards || {})) {
    for (const note of notes || []) {
      if (note && note.noteId) set.add(note.noteId);
    }
  }
  return set;
}

async function collectCollectionData() {
  const wsUrl = await getTabWsUrl();
  const ws = new WebSocket(wsUrl);
  await new Promise(r => ws.on('open', r));
  console.log('Connected to Chrome');
  await send(ws, 'Network.enable');

  try {
    const existing = loadExistingNotes();
    const allResults = existing.boards || {};
    const failed = existing.failed || [];
    const existingNoteIds = buildExistingIdSet(allResults);

    let account = { uid: '', nickname: '', accountKey: 'unknown_000000' };
    setupNetworkAccountCapture(ws, account);
    try {
      const domInfo = await getAccountInfoFromDom(ws);
      if (domInfo.nickname || domInfo.uid) {
        account.uid = domInfo.uid || account.uid;
        account.nickname = domInfo.nickname || account.nickname;
        account.accountKey = buildAccountKeyFromDom(domInfo);
      }
    } catch {
      // ignore
    }
    try {
      const info = await getAccountInfo(ws);
      account = {
        uid: info.uid || '',
        nickname: info.nickname || '',
        accountKey: buildAccountKey({ nickname: info.nickname, uid: info.uid })
      };
      console.log(`Account: ${account.nickname || '(unknown)'} (${account.uid || 'unknown'}) -> ${account.accountKey}`);
    } catch (e) {
      console.log(`Account detection failed: ${e.message}`);
    }

    for (const board of BOARDS) {
      try {
        const notes = await processBoard(ws, board, existingNoteIds, account);
        const current = allResults[board.name] || [];
        const merged = [...current];
        for (const note of notes) {
          if (note && note.noteId && !existingNoteIds.has(note.noteId)) {
            merged.push(note);
            existingNoteIds.add(note.noteId);
          }
        }
        allResults[board.name] = merged;
        console.log(`Board "${board.name}": ${notes.length} notes`);
      } catch (e) {
        console.error(`Board "${board.name}" failed: ${e.message}`);
        failed.push({ board: board.name, error: e.message });
      }
    }

    return { boards: allResults, failed };
  } finally {
    ws.close();
  }
}

function persistCollectionData(payload) {
  const boards = payload?.boards || {};
  const failed = payload?.failed || [];
  fs.writeFileSync(RAW_PATH, JSON.stringify({ boards, failed }, null, 2), 'utf-8');
  console.log(`\nSaved to ${RAW_PATH}`);

  let total = 0;
  for (const [name, notes] of Object.entries(boards)) {
    console.log(`  ${name}: ${notes.length} notes`);
    total += notes.length;
  }
  console.log(`Total: ${total} notes, ${failed.length} failures`);

  return { rawPath: RAW_PATH, total, failures: failed.length };
}

async function clickAtPosition(ws, x, y) {
  await send(ws, 'Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await sleep(50);
  await send(ws, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}

async function clickCardAnchor(ws, index) {
  await send(ws, 'Runtime.evaluate', {
    expression: `
      (function() {
        const sections = document.querySelectorAll('section');
        const sec = sections[${index}];
        if (!sec) return 'no-section';
        const a = sec.querySelector('a');
        if (!a) return 'no-anchor';
        a.click();
        return 'clicked';
      })()
    `,
    returnByValue: true
  });
}

async function getCardLinkInfo(ws, index) {
  const result = await send(ws, 'Runtime.evaluate', {
    expression: `
      (function() {
        const sections = document.querySelectorAll('section');
        const sec = sections[${index}];
        if (!sec) return null;
        const a = sec.querySelector('a');
        if (!a) return null;
        const attrs = {};
        for (const attr of a.attributes) {
          if (attr && attr.name) attrs[attr.name] = attr.value;
        }
        return JSON.stringify({
          href: a.href || '',
          dataXsecToken: a.getAttribute('data-xsec-token') || '',
          dataXsecSource: a.getAttribute('data-xsec-source') || '',
          attrs
        });
      })()
    `,
    returnByValue: true
  });
  if (!result?.result?.value) return null;
  return JSON.parse(result.result.value);
}

async function getCardPositions(ws) {
  const result = await send(ws, 'Runtime.evaluate', {
    expression: `
      (function() {
        const cards = [];
        const sections = document.querySelectorAll('section');
        sections.forEach((sec, i) => {
          const a = sec.querySelector('a');
          if (a && a.href.includes('/explore/')) {
            const rect = sec.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
              const match = a.href.match(/\\/explore\\/([a-f0-9]+)/);
              cards.push({
                index: i,
                noteId: match ? match[1] : '',
                href: a.href,
                x: Math.round(rect.left + rect.width / 2),
                y: Math.round(rect.top + rect.height / 2),
                title: sec.textContent.trim().substring(0, 60)
              });
            }
          }
        });
        return JSON.stringify(cards);
      })()
    `,
    returnByValue: true
  });
  return JSON.parse(result.result.value);
}

async function extractFromModal(ws) {
  const result = await send(ws, 'Runtime.evaluate', {
    expression: `
      (function() {
        // Check if a note detail modal/overlay appeared
        // Look for common note detail selectors
        const selectors = [
          '[class*="note-detail"]', '[class*="noteDetail"]',
          '[id*="noteDetail"]', '[class*="detail-wrapper"]',
          '[class*="note-content"]', '[class*="feed-detail"]',
          '[class*="interaction"]'
        ];
        let container = null;
        for (const sel of selectors) {
          container = document.querySelector(sel);
          if (container) break;
        }

        // Get the whole page content structure for debugging
        const bodyClasses = [];
        document.querySelectorAll('[class]').forEach(el => {
          const cls = el.className;
          if (typeof cls === 'string' && (cls.includes('detail') || cls.includes('note') || cls.includes('modal') || cls.includes('overlay') || cls.includes('mask'))) {
            bodyClasses.push(cls.substring(0, 80));
          }
        });

        // Try to get note content from the current page/modal
        const titleEl = document.querySelector('#detail-title, [class*="detail"] [class*="title"]');
        const descEl = document.querySelector('#detail-desc, [class*="detail"] [class*="desc"], [class*="detail"] [class*="content"]');
        const authorEl = document.querySelector('[class*="detail"] [class*="name"], [class*="detail"] [class*="author"]');
        const dateEl = document.querySelector('[class*="detail"] [class*="date"], [class*="detail"] [class*="time"]');

        const tags = [];
        document.querySelectorAll('[class*="detail"] a[href*="keyword="]').forEach(a => {
          const t = a.textContent.trim().replace(/^#/, '');
          if (t && !tags.includes(t)) tags.push(t);
        });

        const images = [];
        document.querySelectorAll('[class*="detail"] img, [class*="slider"] img, [class*="swiper"] img').forEach(img => {
          const src = img.src || '';
          if (src.startsWith('http') && !images.includes(src) && !src.includes('avatar')) images.push(src);
        });

        return JSON.stringify({
          found: !!container,
          url: location.href,
          title: titleEl ? titleEl.textContent.trim() : '',
          content: descEl ? descEl.innerText.trim() : '',
          author: authorEl ? authorEl.textContent.trim() : '',
          date: dateEl ? dateEl.textContent.trim() : '',
          tags, images,
          debugClasses: bodyClasses.slice(0, 20)
        });
      })()
    `,
    returnByValue: true
  });
  return JSON.parse(result.result.value);
}

async function getAccountInfoFromDom(ws) {
  const result = await send(ws, 'Runtime.evaluate', {
    expression: `
      (function() {
        function pickText(selector) {
          const el = document.querySelector(selector);
          return el ? el.textContent.trim() : '';
        }
        const nicknameCandidates = [
          pickText('[class*="user-name"]'),
          pickText('[class*="nickname"]'),
          pickText('[class*="userName"]'),
          pickText('[class*="name"]')
        ].filter(Boolean);

        const nickname = nicknameCandidates[0] || '';
        let uid = '';
        try {
          const url = location.href || '';
          const match = url.match(/\\/user\\/profile\\/([a-f0-9]+)/);
          if (match) uid = match[1];
        } catch (e) {}

        return { nickname, uid };
      })()
    `,
    returnByValue: true
  });
  return result?.result?.value || { nickname: '', uid: '' };
}

function setupNetworkAccountCapture(ws, accountState) {
  const handler = async (msg) => {
    try {
      const data = JSON.parse(msg.toString());
      if (!data || !data.method) return;
      if (data.method !== 'Network.responseReceived') return;
      const response = data.params?.response;
      const requestId = data.params?.requestId;
      if (!response || !requestId) return;
      const url = response.url || '';
      if (!url.includes('/api/sns/web/v2/user/me')) return;
      if (accountState.uid && accountState.nickname) return;
      const bodyResult = await send(ws, 'Network.getResponseBody', { requestId });
      const bodyText = bodyResult?.body || '';
      const jsonText = bodyResult?.base64Encoded ? Buffer.from(bodyText, 'base64').toString('utf-8') : bodyText;
      const parsed = JSON.parse(jsonText);
      const info = parseUserMeResponse(parsed);
      if (info.uid || info.nickname) {
        accountState.uid = info.uid || accountState.uid;
        accountState.nickname = info.nickname || accountState.nickname;
        accountState.accountKey = buildAccountKey({ nickname: accountState.nickname, uid: accountState.uid });
      }
    } catch {
      // ignore network parsing errors
    }
  };
  ws.on('message', handler);
  return () => ws.off('message', handler);
}

async function processBoard(ws, board, existingNoteIds, account) {
  console.log(`\n=== Board: ${board.name} ===`);
  await send(ws, 'Page.navigate', { url: board.href });
  await sleep(4000);

  if (!account.nickname) {
    try {
      const domInfo = await getAccountInfoFromDom(ws);
      if (domInfo.nickname || domInfo.uid) {
        account.uid = domInfo.uid || account.uid;
        account.nickname = domInfo.nickname || account.nickname;
        const keyFromDom = buildAccountKeyFromDom(domInfo);
        account.accountKey = keyFromDom || account.accountKey;
      }
    } catch {
      // ignore DOM errors
    }
  }

  if (!account.uid || !account.nickname) {
    try {
      const info = await getAccountInfo(ws);
      if (info.uid || info.nickname) {
        account.uid = info.uid || account.uid;
        account.nickname = info.nickname || account.nickname;
        account.accountKey = buildAccountKey({ nickname: account.nickname, uid: account.uid });
      }
    } catch {
      // ignore
    }
  }

  const cards = await getCardPositions(ws);
  console.log(`Found ${cards.length} note cards`);

  const notes = [];

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    if (card.noteId && existingNoteIds.has(card.noteId)) {
      console.log(`  [${i + 1}/${cards.length}] Skip existing noteId ${card.noteId}`);
      continue;
    }
    console.log(`  [${i + 1}/${cards.length}] Clicking card at (${card.x}, ${card.y}) - ${card.title.substring(0, 30)}`);
    console.log(`    Href: ${card.href}`);

    // Navigate back to board if not on it
    const urlCheck = await send(ws, 'Runtime.evaluate', {
      expression: 'location.href', returnByValue: true
    });
    if (!urlCheck.result.value.includes('/board/')) {
      await send(ws, 'Page.navigate', { url: board.href });
      await sleep(3500);
      // Re-get positions since page reloaded
      const newCards = await getCardPositions(ws);
      if (newCards[i]) {
        card.x = newCards[i].x;
        card.y = newCards[i].y;
      }
    }

    // Simulate real mouse click on the card
    await clickAtPosition(ws, card.x, card.y);
    await sleep(3500);

    // Check what happened - modal or navigation?
    let detail = await extractFromModal(ws);
    console.log(`    URL: ${detail.url}`);
    console.log(`    Modal found: ${detail.found}`);
    console.log(`    Title: ${detail.title || '(empty)'}`);
    console.log(`    Content: ${(detail.content || '').substring(0, 60) || '(empty)'}`);
    console.log(`    Debug classes: ${detail.debugClasses.slice(0, 5).join(', ')}`);

    if (!detail.title && !detail.content) {
      console.log('    Retry: click anchor via JS');
      await clickCardAnchor(ws, card.index);
      await sleep(3500);
      detail = await extractFromModal(ws);
      console.log(`    Retry Title: ${detail.title || '(empty)'}`);
      console.log(`    Retry Content: ${(detail.content || '').substring(0, 60) || '(empty)'}`);
      const linkInfo = await getCardLinkInfo(ws, card.index);
      if (linkInfo) {
        console.log(`    Link data-xsec-token: ${linkInfo.dataXsecToken || '(none)'}`);
      }
    }

    if (detail.title || detail.content) {
      const currentAccountKey = buildAccountKey({ nickname: account.nickname, uid: account.uid });
      notes.push({
        title: detail.title,
        content: detail.content,
        author: detail.author,
        authorLink: '',
        date: detail.date,
        tags: detail.tags,
        images: detail.images,
        noteUrl: detail.url,
        noteId: card.noteId,
        collection: board.name,
        accountKey: currentAccountKey,
        accountUid: account.uid,
        accountNickname: account.nickname
      });
    }

    // Press Escape to close modal if it opened
    await send(ws, 'Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await sleep(1000);
    await sleep(1000 + Math.random() * 1500);
  }

  return notes;
}

async function main(task = buildCollectionTask({ source: 'cli' })) {
  assertValidTask(task);

  const pipeline = await runTaskPipeline({
    task,
    fetchFn: collectCollectionData,
    enrichFn: async (payload) => payload,
    writeFn: persistCollectionData,
    reportFn: async (payload) => ({
      task: payload.task,
      result: payload.steps.write?.data,
      warnings: payload.warnings
    })
  });

  if (!pipeline.ok) {
    throw pipeline.error || new Error('Collection export failed');
  }

  return pipeline.report;
}

main().catch(e => console.error('Fatal error:', e.message));

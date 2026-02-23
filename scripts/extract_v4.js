const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

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

async function clickAtPosition(ws, x, y) {
  await send(ws, 'Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await sleep(50);
  await send(ws, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
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

async function processBoard(ws, board) {
  console.log(`\n=== Board: ${board.name} ===`);
  await send(ws, 'Page.navigate', { url: board.href });
  await sleep(4000);

  const cards = await getCardPositions(ws);
  console.log(`Found ${cards.length} note cards`);

  const notes = [];

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    console.log(`  [${i + 1}/${cards.length}] Clicking card at (${card.x}, ${card.y}) - ${card.title.substring(0, 30)}`);

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
    const detail = await extractFromModal(ws);
    console.log(`    URL: ${detail.url}`);
    console.log(`    Modal found: ${detail.found}`);
    console.log(`    Title: ${detail.title || '(empty)'}`);
    console.log(`    Content: ${(detail.content || '').substring(0, 60) || '(empty)'}`);
    console.log(`    Debug classes: ${detail.debugClasses.slice(0, 5).join(', ')}`);

    if (detail.title || detail.content) {
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
        collection: board.name
      });
    }

    // Press Escape to close modal if it opened
    await send(ws, 'Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
    await sleep(1000);
    await sleep(1000 + Math.random() * 1500);
  }

  return notes;
}

async function main() {
  const wsUrl = await getTabWsUrl();
  const ws = new WebSocket(wsUrl);
  await new Promise(r => ws.on('open', r));
  console.log('Connected to Chrome');

  const allResults = {};
  const failed = [];

  for (const board of BOARDS) {
    try {
      const notes = await processBoard(ws, board);
      allResults[board.name] = notes;
      console.log(`Board "${board.name}": ${notes.length} notes`);
    } catch (e) {
      console.error(`Board "${board.name}" failed: ${e.message}`);
      failed.push({ board: board.name, error: e.message });
    }
  }

  const outputPath = path.join('G:', 'UserCode', 'XiaoHongshu_Collection', 'output', 'raw_notes.json');
  fs.writeFileSync(outputPath, JSON.stringify({ boards: allResults, failed }, null, 2), 'utf-8');
  console.log(`\nSaved to ${outputPath}`);

  let total = 0;
  for (const [name, notes] of Object.entries(allResults)) {
    console.log(`  ${name}: ${notes.length} notes`);
    total += notes.length;
  }
  console.log(`Total: ${total} notes, ${failed.length} failures`);
  ws.close();
}

main().catch(e => console.error('Fatal error:', e.message));

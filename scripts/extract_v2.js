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
function sendCommand(ws, method, params = {}) {
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

async function extractNoteFromModal(ws) {
  const result = await sendCommand(ws, 'Runtime.evaluate', {
    expression: `
      (function() {
        // Look for the note detail modal/overlay
        const modal = document.querySelector('[class*="note-detail"], [class*="noteDetail"], [id*="noteDetail"], [class*="detail-modal"]')
          || document.querySelector('[class*="overlay"]')
          || document;

        // Title
        const titleEl = modal.querySelector('#detail-title, [class*="title"]');
        const title = titleEl ? titleEl.textContent.trim() : '';

        // Content
        const descEl = modal.querySelector('#detail-desc, [class*="desc"]');
        let content = descEl ? descEl.innerText.trim() : '';

        // Author
        const authorEl = modal.querySelector('[class*="author"] [class*="name"], [class*="username"], [class*="nick"]');
        const author = authorEl ? authorEl.textContent.trim() : '';

        // Author link
        const authorLinkEl = modal.querySelector('a[href*="/user/profile/"]');
        const authorLink = authorLinkEl ? authorLinkEl.href : '';

        // Date
        const dateEl = modal.querySelector('[class*="date"], [class*="time"]');
        const date = dateEl ? dateEl.textContent.trim() : '';

        // Tags
        const tags = [];
        modal.querySelectorAll('a[href*="keyword="], [class*="tag"] a').forEach(a => {
          const tag = a.textContent.trim().replace(/^#/, '');
          if (tag && !tags.includes(tag)) tags.push(tag);
        });

        // Images
        const images = [];
        modal.querySelectorAll('[class*="slide"] img, [class*="swiper"] img, [class*="carousel"] img').forEach(img => {
          const src = img.src || img.getAttribute('data-src') || '';
          if (src && src.startsWith('http') && !images.includes(src)) images.push(src);
        });

        // Note URL from the address bar or share link
        const noteUrl = location.href;

        return JSON.stringify({ title, content, author, authorLink, date, tags, images, noteUrl });
      })()
    `,
    returnByValue: true
  });
  return JSON.parse(result.result.value);
}

async function processBoard(ws, board) {
  console.log(`\n=== Board: ${board.name} ===`);
  await sendCommand(ws, 'Page.navigate', { url: board.href });
  await sleep(4000);

  // Get count of note cards on the board page
  const countResult = await sendCommand(ws, 'Runtime.evaluate', {
    expression: `
      (function() {
        const sections = document.querySelectorAll('section.note-item, section[class*="note"]');
        if (sections.length > 0) return sections.length;
        // Fallback: count clickable covers
        const covers = document.querySelectorAll('[class*="cover"], [class*="card"]');
        return covers.length;
      })()
    `,
    returnByValue: true
  });
  const noteCount = countResult.result.value || 0;
  console.log(`Found ${noteCount} note cards on page`);

  // Get all clickable note elements info
  const cardsInfo = await sendCommand(ws, 'Runtime.evaluate', {
    expression: `
      (function() {
        const cards = [];
        // Try section.note-item first
        let items = document.querySelectorAll('section.note-item, section[class*="note"]');
        if (items.length === 0) {
          // Try any section with a link
          items = document.querySelectorAll('section');
        }
        items.forEach((sec, i) => {
          const a = sec.querySelector('a');
          const href = a ? a.href : '';
          const text = sec.textContent.trim().substring(0, 100);
          cards.push({ index: i, href, text });
        });
        return JSON.stringify(cards);
      })()
    `,
    returnByValue: true
  });
  const cards = JSON.parse(cardsInfo.result.value);
  console.log(`Card details: ${JSON.stringify(cards.map(c => c.href))}`);

  const notes = [];

  for (let i = 0; i < cards.length; i++) {
    console.log(`  [${i + 1}/${cards.length}] Clicking note card...`);

    // Navigate back to board page first
    await sendCommand(ws, 'Page.navigate', { url: board.href });
    await sleep(3000);

    // Click the i-th note card
    const clickResult = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `
        (async function() {
          let items = document.querySelectorAll('section.note-item, section[class*="note"]');
          if (items.length === 0) items = document.querySelectorAll('section');
          const target = items[${i}];
          if (!target) return JSON.stringify({ error: 'Card not found' });
          const a = target.querySelector('a');
          if (a) { a.click(); }
          else { target.click(); }
          return JSON.stringify({ clicked: true });
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });
    console.log(`    Click result: ${clickResult.result.value}`);
    await sleep(3500);

    // Extract note content from the resulting page/modal
    try {
      const detail = await extractNoteFromModal(ws);
      detail.collection = board.name;
      notes.push(detail);
      console.log(`    OK: ${detail.title || '(no title)'} | ${detail.content.substring(0, 50)}...`);
    } catch (e) {
      console.error(`    FAILED: ${e.message}`);
    }

    await sleep(1500 + Math.random() * 1500);
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
      console.log(`\nBoard "${board.name}": ${notes.length} notes extracted`);
    } catch (e) {
      console.error(`Board "${board.name}" failed: ${e.message}`);
      failed.push({ board: board.name, error: e.message });
    }
  }

  // Save raw results
  const outputPath = path.join('G:', 'UserCode', 'XiaoHongshu_Collection', 'output', 'raw_notes.json');
  fs.writeFileSync(outputPath, JSON.stringify({ boards: allResults, failed }, null, 2), 'utf-8');
  console.log(`\nSaved raw data to ${outputPath}`);

  // Summary
  let totalNotes = 0;
  for (const [name, notes] of Object.entries(allResults)) {
    console.log(`  ${name}: ${notes.length} notes`);
    totalNotes += notes.length;
  }
  console.log(`Total: ${totalNotes} notes, ${failed.length} failures`);

  ws.close();
}

main().catch(e => console.error('Fatal error:', e.message));

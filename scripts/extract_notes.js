const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const BOARDS = [
  { name: 'AI', href: 'https://www.xiaohongshu.com/board/699c2c9c0000000025031008' },
  { name: '笔记', href: 'https://www.xiaohongshu.com/board/699c2baa000000002600ba5b' }
];

async function getTabWsUrl() {
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

async function sendCommand(ws, method, params = {}) {
  const id = Math.floor(Math.random() * 100000);
  return new Promise((resolve, reject) => {
    const handler = (msg) => {
      const data = JSON.parse(msg.toString());
      if (data.id === id) {
        ws.removeListener('message', handler);
        if (data.error) reject(new Error(JSON.stringify(data.error)));
        else resolve(data.result);
      }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { ws.removeListener('message', handler); reject(new Error('Timeout')); }, 30000);
  });
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getNoteLinksFromBoard(ws, boardUrl) {
  await sendCommand(ws, 'Page.navigate', { url: boardUrl });
  await sleep(3500);

  // Scroll to load all notes
  let prevCount = 0;
  for (let i = 0; i < 10; i++) {
    const countResult = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `document.querySelectorAll('a[href*="/discovery/item/"], a[href*="/explore/"]').length`,
      returnByValue: true
    });
    const count = countResult.result.value;
    if (count > 0 && count === prevCount) break;
    prevCount = count;
    await sendCommand(ws, 'Runtime.evaluate', {
      expression: `window.scrollBy(0, 800)`,
      returnByValue: true
    });
    await sleep(1500);
  }

  // Extract note links
  const result = await sendCommand(ws, 'Runtime.evaluate', {
    expression: `
      (function() {
        const notes = [];
        const seen = new Set();
        // Get all section/card items in the board
        const cards = document.querySelectorAll('section a, div[class*="note"] a, a[href*="/discovery/item/"]');
        cards.forEach(a => {
          const href = a.href || '';
          // Only /discovery/item/ links are actual note links
          if (href.includes('/discovery/item/') && !seen.has(href)) {
            seen.add(href);
            const title = a.textContent.trim().split('\\n')[0] || '';
            notes.push({ title, href });
          }
        });
        // Also try finding note links from the board page structure
        document.querySelectorAll('a').forEach(a => {
          const href = a.href || '';
          if (href.includes('/discovery/item/') && !seen.has(href)) {
            seen.add(href);
            notes.push({ title: a.textContent.trim().split('\\n')[0] || '', href });
          }
        });
        return JSON.stringify(notes);
      })()
    `,
    returnByValue: true
  });

  return JSON.parse(result.result.value);
}

async function getNoteDetail(ws, noteUrl) {
  await sendCommand(ws, 'Page.navigate', { url: noteUrl });
  await sleep(3500);

  const result = await sendCommand(ws, 'Runtime.evaluate', {
    expression: `
      (function() {
        // Title
        const titleEl = document.querySelector('#detail-title') || document.querySelector('[class*="title"]');
        const title = titleEl ? titleEl.textContent.trim() : '';

        // Content/body
        const descEl = document.querySelector('#detail-desc') || document.querySelector('[class*="desc"], [class*="content"]');
        let content = '';
        if (descEl) {
          // Get text with line breaks preserved
          content = descEl.innerText.trim();
        }

        // Author
        const authorEl = document.querySelector('[class*="author"] [class*="name"], a[class*="name"], [class*="nickname"]');
        const author = authorEl ? authorEl.textContent.trim() : '';

        // Author link
        const authorLinkEl = document.querySelector('[class*="author"] a[href*="/user/profile/"]');
        const authorLink = authorLinkEl ? authorLinkEl.href : '';

        // Date
        const dateEl = document.querySelector('[class*="date"], [class*="time"], span[class*="bottom"] span');
        const date = dateEl ? dateEl.textContent.trim() : '';

        // Tags/topics
        const tags = [];
        document.querySelectorAll('a[href*="/search_result?keyword="]').forEach(a => {
          const tag = a.textContent.trim().replace(/^#/, '');
          if (tag && !tags.includes(tag)) tags.push(tag);
        });

        // Images
        const images = [];
        document.querySelectorAll('[class*="slide"] img, [class*="image"] img, [class*="carousel"] img').forEach(img => {
          const src = img.src || img.getAttribute('data-src') || '';
          if (src && !images.includes(src)) images.push(src);
        });

        // Current URL (may have been redirected)
        const currentUrl = location.href;

        return JSON.stringify({ title, content, author, authorLink, date, tags, images, currentUrl });
      })()
    `,
    returnByValue: true
  });

  return JSON.parse(result.result.value);
}

async function main() {
  const wsUrl = await getTabWsUrl();
  const ws = new WebSocket(wsUrl);
  await new Promise(r => ws.on('open', r));
  console.log('Connected to Chrome');

  const allResults = {};
  const failed = [];

  for (const board of BOARDS) {
    console.log(`\n=== Processing board: ${board.name} ===`);
    let noteLinks = [];
    try {
      noteLinks = await getNoteLinksFromBoard(ws, board.href);
      console.log(`Found ${noteLinks.length} note links`);
    } catch (e) {
      console.error(`Failed to get notes from board ${board.name}:`, e.message);
      continue;
    }

    // If no /discovery/item/ links found, try clicking into notes from the board page
    if (noteLinks.length === 0) {
      console.log('No discovery links found, trying to extract from board page...');
      await sendCommand(ws, 'Page.navigate', { url: board.href });
      await sleep(3500);
      const fallback = await sendCommand(ws, 'Runtime.evaluate', {
        expression: `
          (function() {
            const links = [];
            const seen = new Set();
            document.querySelectorAll('a').forEach(a => {
              const href = a.href || '';
              if ((href.includes('/explore/') || href.includes('/discovery/')) && !seen.has(href)) {
                seen.add(href);
                links.push({ title: a.textContent.trim().split('\\n')[0], href, type: 'fallback' });
              }
            });
            // Also get section covers that might be clickable
            document.querySelectorAll('section').forEach(sec => {
              const a = sec.querySelector('a');
              if (a && a.href && !seen.has(a.href)) {
                seen.add(a.href);
                links.push({ title: sec.textContent.trim().split('\\n')[0], href: a.href, type: 'section' });
              }
            });
            return JSON.stringify(links);
          })()
        `,
        returnByValue: true
      });
      noteLinks = JSON.parse(fallback.result.value);
      console.log(`Fallback found ${noteLinks.length} links`);
    }

    allResults[board.name] = [];

    for (let i = 0; i < noteLinks.length; i++) {
      const link = noteLinks[i];
      console.log(`  [${i + 1}/${noteLinks.length}] Fetching: ${link.title || link.href}`);
      try {
        const detail = await getNoteDetail(ws, link.href);
        detail.collection = board.name;
        detail.sourceUrl = link.href;
        allResults[board.name].push(detail);
        console.log(`    OK: ${detail.title || '(no title)'}`);
      } catch (e) {
        console.error(`    FAILED: ${e.message}`);
        failed.push({ board: board.name, href: link.href, error: e.message });
      }
      // Random delay between notes (1.5-3s)
      await sleep(1500 + Math.random() * 1500);
    }
  }

  // Save raw results to JSON
  const outputPath = path.join('G:', 'UserCode', 'XiaoHongshu_Collection', 'raw_notes.json');
  fs.writeFileSync(outputPath, JSON.stringify({ boards: allResults, failed }, null, 2), 'utf-8');
  console.log(`\nSaved raw data to ${outputPath}`);
  console.log(`Failed: ${failed.length}`);

  ws.close();
}

main().catch(e => console.error('Fatal error:', e.message));

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

async function processBoard(ws, board) {
  console.log(`\n=== Board: ${board.name} ===`);

  // Enable network interception to capture API responses
  await sendCommand(ws, 'Network.enable');

  // Collect API responses
  const apiResponses = [];
  const networkHandler = (msg) => {
    const data = JSON.parse(msg.toString());
    if (data.method === 'Network.responseReceived') {
      const url = data.params.response.url;
      if (url.includes('/api/sns/') || url.includes('/api/') && url.includes('note')) {
        apiResponses.push({ requestId: data.params.requestId, url });
      }
    }
  };
  ws.on('message', networkHandler);

  await sendCommand(ws, 'Page.navigate', { url: board.href });
  await sleep(4000);

  ws.removeListener('message', networkHandler);
  console.log(`Captured ${apiResponses.length} API calls`);
  apiResponses.forEach(r => console.log(`  API: ${r.url.substring(0, 120)}`));

  // Now try approach: click note cards to open modal overlay (not navigate)
  // First, get note IDs from the explore links on the page
  const noteIdsResult = await sendCommand(ws, 'Runtime.evaluate', {
    expression: `
      (function() {
        const noteIds = [];
        document.querySelectorAll('a[href*="/explore/"]').forEach(a => {
          const match = a.href.match(/\\/explore\\/([a-f0-9]+)/);
          if (match && !noteIds.includes(match[1])) noteIds.push(match[1]);
        });
        return JSON.stringify(noteIds);
      })()
    `,
    returnByValue: true
  });
  const noteIds = JSON.parse(noteIdsResult.result.value);
  console.log(`Note IDs: ${JSON.stringify(noteIds)}`);

  // Try to fetch note details using XHS internal API with proper cookies
  const notes = [];
  for (let i = 0; i < noteIds.length; i++) {
    const noteId = noteIds[i];
    console.log(`  [${i + 1}/${noteIds.length}] Fetching note ${noteId} via API...`);

    const apiResult = await sendCommand(ws, 'Runtime.evaluate', {
      expression: `
        (async function() {
          try {
            const resp = await fetch('/api/sns/web/v1/feed', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                source_note_id: '${noteId}',
                image_formats: ['jpg', 'webp', 'avif'],
                extra: { need_body_topic: 1 }
              })
            });
            const json = await resp.json();
            return JSON.stringify(json);
          } catch(e) {
            return JSON.stringify({ error: e.message });
          }
        })()
      `,
      awaitPromise: true,
      returnByValue: true
    });

    try {
      const apiData = JSON.parse(apiResult.result.value);
      if (apiData.data && apiData.data.items && apiData.data.items.length > 0) {
        const item = apiData.data.items[0];
        const noteCard = item.note_card || {};
        const note = {
          title: noteCard.title || '',
          content: noteCard.desc || '',
          author: noteCard.user ? noteCard.user.nickname : '',
          authorLink: noteCard.user ? 'https://www.xiaohongshu.com/user/profile/' + noteCard.user.user_id : '',
          date: noteCard.time ? new Date(noteCard.time).toISOString().split('T')[0] : '',
          tags: (noteCard.tag_list || []).map(t => t.name),
          images: (noteCard.image_list || []).map(img => img.url_default || img.url || ''),
          noteUrl: 'https://www.xiaohongshu.com/discovery/item/' + noteId,
          collection: board.name,
          noteId: noteId
        };
        notes.push(note);
        console.log(`    OK: ${note.title || '(no title)'}`);
      } else {
        console.log(`    API returned no data: ${JSON.stringify(apiData).substring(0, 200)}`);
      }
    } catch (e) {
      console.error(`    Parse error: ${e.message}`);
    }

    await sleep(1500 + Math.random() * 1500);
  }

  await sendCommand(ws, 'Network.disable');
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
      console.log(`Board "${board.name}": ${notes.length} notes extracted`);
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

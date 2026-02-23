const http = require('http');
const WebSocket = require('ws');

const UID = '62ade3ea000000001b026c75';

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
    setTimeout(() => { ws.removeListener('message', handler); reject(new Error('Timeout')); }, 20000);
  });
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const wsUrl = await getTabWsUrl();
  const ws = new WebSocket(wsUrl);
  await new Promise(r => ws.on('open', r));

  // Navigate to collection page
  const collectUrl = `https://www.xiaohongshu.com/user/profile/${UID}/collect`;
  console.log('Navigating to:', collectUrl);
  await sendCommand(ws, 'Page.navigate', { url: collectUrl });
  await sleep(4000);

  // Get all board links from the page
  const result = await sendCommand(ws, 'Runtime.evaluate', {
    expression: `
      (function() {
        const boards = [];
        // Look for board links
        const links = document.querySelectorAll('a[href*="/board/"]');
        links.forEach(a => {
          const name = a.textContent.trim();
          const href = a.href;
          if (name && href && !boards.find(b => b.href === href)) {
            boards.push({ name, href });
          }
        });
        // Also try collection items
        const items = document.querySelectorAll('[class*="board"], [class*="collect"], [class*="album"]');
        items.forEach(el => {
          const a = el.querySelector('a') || el.closest('a');
          if (a && a.href.includes('/board/')) {
            const name = el.textContent.trim().split('\\n')[0];
            if (name && !boards.find(b => b.href === a.href)) {
              boards.push({ name, href: a.href });
            }
          }
        });
        return JSON.stringify({ boardCount: boards.length, boards, pageTitle: document.title, url: location.href });
      })()
    `,
    returnByValue: true
  });

  console.log(result.result.value);
  ws.close();
}

main().catch(e => console.error('Error:', e.message));

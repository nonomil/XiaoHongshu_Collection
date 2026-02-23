const http = require('http');
const WebSocket = require('ws');

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

  // Click on the "收藏" tab and then "专辑" sub-tab
  const result = await sendCommand(ws, 'Runtime.evaluate', {
    expression: `
      (async function() {
        // Find and click "收藏" tab
        const allDivs = document.querySelectorAll('div, span, a');
        let collectTab = null;
        for (const el of allDivs) {
          if (el.textContent.trim() === '收藏' && el.offsetParent !== null) {
            collectTab = el;
            break;
          }
        }
        if (collectTab) {
          collectTab.click();
          await new Promise(r => setTimeout(r, 2000));
        }

        // Now find and click "专辑" sub-tab
        const allEls = document.querySelectorAll('div, span, a');
        for (const el of allEls) {
          const text = el.textContent.trim();
          if (text.startsWith('专辑') && el.offsetParent !== null && el.offsetWidth > 0) {
            el.click();
            await new Promise(r => setTimeout(r, 2000));
            break;
          }
        }

        // Now extract board info
        const boards = [];
        // Look for board/album items with links
        const allLinks = document.querySelectorAll('a');
        for (const a of allLinks) {
          const href = a.href || '';
          if (href.includes('/board/')) {
            const name = a.textContent.trim().split('\\n')[0];
            if (name && !boards.find(b => b.href === href)) {
              boards.push({ name, href });
            }
          }
        }

        // Also try to find board items by structure
        const sections = document.querySelectorAll('section, div[class*="board"], div[class*="album"], div[class*="collect"]');
        for (const sec of sections) {
          const a = sec.querySelector('a[href*="/board/"]');
          if (a) {
            const name = sec.textContent.trim().split('\\n')[0];
            if (name && !boards.find(b => b.href === a.href)) {
              boards.push({ name, href: a.href });
            }
          }
        }

        return JSON.stringify({ url: location.href, boardCount: boards.length, boards });
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });

  console.log(result.result.value);
  ws.close();
}

main().catch(e => console.error('Error:', e.message));

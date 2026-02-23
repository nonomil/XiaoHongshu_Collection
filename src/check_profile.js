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

  // Navigate to user profile page
  const profileUrl = `https://www.xiaohongshu.com/user/profile/${UID}`;
  console.log('Navigating to:', profileUrl);
  await sendCommand(ws, 'Page.navigate', { url: profileUrl });
  await sleep(4000);

  // Check current URL and page structure
  const result = await sendCommand(ws, 'Runtime.evaluate', {
    expression: `
      (function() {
        // Get all tabs/nav items on the profile page
        const tabs = [];
        document.querySelectorAll('a, div[role="tab"], [class*="tab"], [class*="nav"]').forEach(el => {
          const text = el.textContent.trim();
          const href = el.href || '';
          if (text && text.length < 20) {
            tabs.push({ text, href, tag: el.tagName });
          }
        });
        // Deduplicate
        const seen = new Set();
        const uniqueTabs = tabs.filter(t => {
          const key = t.text + t.href;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        return JSON.stringify({
          url: location.href,
          title: document.title,
          tabs: uniqueTabs.slice(0, 30),
          html: document.body.innerHTML.substring(0, 500)
        });
      })()
    `,
    returnByValue: true
  });

  console.log(result.result.value);
  ws.close();
}

main().catch(e => console.error('Error:', e.message));

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
    setTimeout(() => { ws.removeListener('message', handler); reject(new Error('Timeout')); }, 15000);
  });
}

async function main() {
  const wsUrl = await getTabWsUrl();
  const ws = new WebSocket(wsUrl);
  await new Promise(r => ws.on('open', r));

  // First navigate to xiaohongshu homepage
  await sendCommand(ws, 'Page.navigate', { url: 'https://www.xiaohongshu.com' });
  await new Promise(r => setTimeout(r, 3000));

  // Try to get UID from cookie or page context
  const result = await sendCommand(ws, 'Runtime.evaluate', {
    expression: `
      (function() {
        // Try getting from cookie
        const cookies = document.cookie;
        // Try getting from localStorage
        let lsData = {};
        try {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.includes('user') || key.includes('uid') || key.includes('id')) {
              lsData[key] = localStorage.getItem(key);
            }
          }
        } catch(e) {}
        // Try getting from page
        const profileLink = document.querySelector('a[href*="/user/profile/"]');
        const profileHref = profileLink ? profileLink.href : null;
        return JSON.stringify({ cookies: cookies.substring(0, 500), localStorage: lsData, profileLink: profileHref });
      })()
    `,
    returnByValue: true
  });

  console.log(result.result.value);
  ws.close();
}

main().catch(e => console.error('Error:', e.message));

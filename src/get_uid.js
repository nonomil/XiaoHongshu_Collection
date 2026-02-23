const WebSocket = require('ws') || null;
const http = require('http');

// If ws module not available, install it
async function getTabWsUrl() {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:9222/json', res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const tabs = JSON.parse(data);
        // Find a xiaohongshu tab
        const xhsTab = tabs.find(t => t.url.includes('xiaohongshu.com') && !t.url.includes('sw.js'));
        if (xhsTab) {
          resolve(xhsTab.webSocketDebuggerUrl);
        } else {
          reject(new Error('No xiaohongshu tab found'));
        }
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
  console.log('Connecting to:', wsUrl);

  const ws = new (require('ws'))(wsUrl);
  await new Promise(r => ws.on('open', r));

  // Navigate to xiaohongshu homepage to get user info
  const result = await sendCommand(ws, 'Runtime.evaluate', {
    expression: `
      (async () => {
        // Try to get user info from page
        const resp = await fetch('/api/sns/web/v1/user/selfinfo', { credentials: 'include' });
        const json = await resp.json();
        return JSON.stringify(json);
      })()
    `,
    awaitPromise: true,
    returnByValue: true
  });

  console.log('User info:', result.result.value);
  ws.close();
}

main().catch(e => console.error('Error:', e.message));

const http = require('http');
http.get('http://localhost:9222/json', res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const tabs = JSON.parse(data);
    tabs.forEach((t, i) => {
      console.log(`[${i}] ${t.title} | ${t.url} | ${t.id}`);
    });
  });
}).on('error', e => console.log('ERROR:', e.message));

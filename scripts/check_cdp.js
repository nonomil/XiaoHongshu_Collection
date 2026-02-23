const http = require('http');
http.get('http://localhost:9222/json/version', res => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(data));
}).on('error', e => {
  console.log('CONNECT_FAILED: ' + e.message);
});

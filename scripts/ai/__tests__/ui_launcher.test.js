const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const launcherPath = path.resolve(__dirname, '..', '..', '..', '启动小红书保存入口.bat');

test('bat launcher exists and points to the local ui server entry', () => {
  assert.equal(fs.existsSync(launcherPath), true, 'launcher file should exist');

  const content = fs.readFileSync(launcherPath, 'utf-8');
  assert.match(content, /cd \/d "%~dp0"/i);
  assert.match(content, /Stop-Process/i);
  assert.match(content, /Get-NetTCPConnection/i);
  assert.match(content, /LocalPort 3030/i);
  assert.match(content, /node ""%~dp0scripts\\ui_server\.js""/i);
  assert.match(content, /127\.0\.0\.1:3030/);
});

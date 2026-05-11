const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildLoginInstructions,
  parseArgs
} = require('../../login_browser');

test('login_browser parseArgs keeps headed default and accepts custom url/channel', () => {
  assert.deepEqual(
    parseArgs([
      '--browser-channel', 'beta',
      '--url', 'https://mp.weixin.qq.com/s/demo'
    ]),
    {
      browser: {
        channel: 'beta'
      },
      url: 'https://mp.weixin.qq.com/s/demo'
    }
  );
});

test('login_browser instructions explain profile reuse after manual login', () => {
  const message = buildLoginInstructions({
    profileDir: 'G:/UserCode/XiaoHongshu_Collection/cache/chrome-debug',
    debugUrl: 'http://127.0.0.1:9222/json',
    url: 'https://www.xiaohongshu.com/explore'
  });

  assert.match(message, /profile/i);
  assert.match(message, /login|登录/i);
  assert.match(message, /close|关闭/i);
  assert.match(message, /9222/);
});

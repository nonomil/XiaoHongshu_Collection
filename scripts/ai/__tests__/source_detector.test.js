const test = require('node:test');
const assert = require('node:assert/strict');

const {
  detectSourceFromUrl
} = require('../../lib/source_detector');

test('detectSourceFromUrl identifies XiaoHongshu note pages', () => {
  assert.equal(
    detectSourceFromUrl('https://www.xiaohongshu.com/discovery/item/69b82134000000001b0219f2'),
    'xiaohongshu'
  );
});

test('detectSourceFromUrl identifies WeChat article pages', () => {
  assert.equal(
    detectSourceFromUrl('https://mp.weixin.qq.com/s/abcdefghijk'),
    'wechat_article'
  );
});

test('detectSourceFromUrl identifies Zhihu article pages', () => {
  assert.equal(
    detectSourceFromUrl('https://zhuanlan.zhihu.com/p/123456789'),
    'zhihu_article'
  );
});

test('detectSourceFromUrl identifies Zhihu answer pages', () => {
  assert.equal(
    detectSourceFromUrl('https://www.zhihu.com/question/12345678/answer/87654321'),
    'zhihu_answer'
  );
});

test('detectSourceFromUrl identifies CSDN article pages', () => {
  assert.equal(
    detectSourceFromUrl('https://blog.csdn.net/example_user/article/details/146200001'),
    'csdn_article'
  );
});

test('detectSourceFromUrl falls back to generic web for unknown urls', () => {
  assert.equal(
    detectSourceFromUrl('https://example.com/posts/hello-world'),
    'generic_web'
  );
});

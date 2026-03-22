const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeArticlePayload
} = require('../../lib/sources/generic_types');

test('normalizeArticlePayload fills required defaults for article-like sources', () => {
  const payload = normalizeArticlePayload({
    platform: 'wechat',
    sourceType: 'wechat_article',
    sourceUrl: 'https://mp.weixin.qq.com/s/abcdefghijk',
    title: 'Chrome 146 一个开关，让 AI 接管当前浏览器',
    author: '圆圆大侠',
    content: '这里是正文',
    collection: '微信公众号文章'
  });

  assert.deepEqual(payload, {
    platform: 'wechat',
    sourceType: 'wechat_article',
    sourceUrl: 'https://mp.weixin.qq.com/s/abcdefghijk',
    canonicalUrl: 'https://mp.weixin.qq.com/s/abcdefghijk',
    title: 'Chrome 146 一个开关，让 AI 接管当前浏览器',
    author: '圆圆大侠',
    authorLink: '',
    date: '',
    tags: [],
    content: '这里是正文',
    images: [],
    comments: [],
    commentTotal: 0,
    commentError: '',
    commentWarningCode: '',
    collection: '微信公众号文章'
  });
});

test('normalizeArticlePayload preserves provided arrays and metadata', () => {
  const payload = normalizeArticlePayload({
    platform: 'zhihu',
    sourceType: 'zhihu_article',
    sourceUrl: 'https://zhuanlan.zhihu.com/p/123456789',
    canonicalUrl: 'https://zhuanlan.zhihu.com/p/123456789?utm_psn=1',
    title: '把当前 Chrome 交给 AI 之后能做什么',
    author: '测试作者',
    authorLink: 'https://www.zhihu.com/people/test-author',
    date: '2026-03-21',
    tags: ['浏览器自动化', '效率工具'],
    content: '正文内容',
    images: ['https://pic1.example.com/a.jpg'],
    collection: '知乎文章'
  });

  assert.equal(payload.platform, 'zhihu');
  assert.equal(payload.sourceType, 'zhihu_article');
  assert.equal(payload.authorLink, 'https://www.zhihu.com/people/test-author');
  assert.equal(payload.date, '2026-03-21');
  assert.deepEqual(payload.tags, ['浏览器自动化', '效率工具']);
  assert.deepEqual(payload.images, ['https://pic1.example.com/a.jpg']);
  assert.deepEqual(payload.comments, []);
  assert.equal(payload.commentTotal, 0);
  assert.equal(payload.commentError, '');
  assert.equal(payload.commentWarningCode, '');
});

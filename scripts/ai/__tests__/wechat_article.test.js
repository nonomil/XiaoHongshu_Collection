const test = require('node:test');
const assert = require('node:assert/strict');

const {
  extractWechatArticleFromHtml,
  extractWechatArticleFromPage
} = require('../../lib/sources/wechat_article');

test('extractWechatArticleFromHtml extracts title author date content and images', () => {
  const html = `
    <html>
      <head>
        <meta property="og:url" content="https://mp.weixin.qq.com/s/abc123?scene=1">
      </head>
      <body>
        <h1 id="activity-name">Chrome 146 lets AI drive the current browser</h1>
        <a id="js_name" href="https://weixin.sogou.com/wechat?query=test">Round Hero</a>
        <em id="publish_time">2026-03-21</em>
        <div id="js_content">
          <p>First paragraph.</p>
          <p>Second paragraph.</p>
          <img data-src="https://mmbiz.qpic.cn/example/cover.jpg">
        </div>
      </body>
    </html>
  `;

  const article = extractWechatArticleFromHtml({
    url: 'https://mp.weixin.qq.com/s/abc123?from=timeline',
    html
  });

  assert.equal(article.platform, 'wechat');
  assert.equal(article.sourceType, 'wechat_article');
  assert.equal(article.sourceUrl, 'https://mp.weixin.qq.com/s/abc123?from=timeline');
  assert.equal(article.canonicalUrl, 'https://mp.weixin.qq.com/s/abc123?scene=1');
  assert.equal(article.title, 'Chrome 146 lets AI drive the current browser');
  assert.equal(article.author, 'Round Hero');
  assert.equal(article.authorLink, 'https://weixin.sogou.com/wechat?query=test');
  assert.equal(article.date, '2026-03-21');
  assert.match(article.content, /First paragraph/);
  assert.match(article.content, /Second paragraph/);
  assert.deepEqual(article.images, ['https://mmbiz.qpic.cn/example/cover.jpg']);
  assert.equal(article.collection, '微信公众号文章');
});

test('extractWechatArticleFromPage normalizes a single browser-evaluated payload', async () => {
  const article = await extractWechatArticleFromPage({}, {
    sendFn: async (_ws, _method, params) => {
      const expression = String(params?.expression || '');
      assert.match(expression, /#js_content/);
      return {
        result: {
          value: {
            canonicalUrl: 'https://mp.weixin.qq.com/s/abc123?scene=1',
            title: 'Chrome 146 lets AI drive the current browser',
            author: 'Round Hero',
            authorLink: 'https://example.com/author',
            date: '2026-03-21',
            content: 'First paragraph.\\nSecond paragraph.',
            images: ['https://mmbiz.qpic.cn/example/cover.jpg']
          }
        }
      };
    }
  });

  assert.equal(article.platform, 'wechat');
  assert.equal(article.sourceType, 'wechat_article');
  assert.equal(article.canonicalUrl, 'https://mp.weixin.qq.com/s/abc123?scene=1');
  assert.equal(article.title, 'Chrome 146 lets AI drive the current browser');
  assert.equal(article.author, 'Round Hero');
  assert.equal(article.authorLink, 'https://example.com/author');
  assert.equal(article.date, '2026-03-21');
  assert.equal(article.content, 'First paragraph.\\nSecond paragraph.');
  assert.deepEqual(article.images, ['https://mmbiz.qpic.cn/example/cover.jpg']);
});

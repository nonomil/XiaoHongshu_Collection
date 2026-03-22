const test = require('node:test');
const assert = require('node:assert/strict');

const {
  extractCsdnArticleFromHtml,
  extractCsdnArticleFromPage
} = require('../../lib/sources/csdn');

test('extractCsdnArticleFromHtml extracts title author date content and images', () => {
  const html = `
    <html>
      <body>
        <h1 id="articleContentId">Chrome DevTools MCP vs agent-browser</h1>
        <a class="follow-nickName" href="https://blog.csdn.net/test_user">Test Author</a>
        <span class="time">2026-03-21 09:30:00</span>
        <div id="content_views">
          <p>Paragraph one.</p>
          <p>Paragraph two.</p>
          <img src="https://i-blog.csdnimg.cn/direct/example.png">
        </div>
      </body>
    </html>
  `;

  const article = extractCsdnArticleFromHtml({
    url: 'https://blog.csdn.net/test_user/article/details/146200001',
    html
  });

  assert.equal(article.platform, 'csdn');
  assert.equal(article.sourceType, 'csdn_article');
  assert.equal(article.title, 'Chrome DevTools MCP vs agent-browser');
  assert.equal(article.author, 'Test Author');
  assert.equal(article.authorLink, 'https://blog.csdn.net/test_user');
  assert.equal(article.date, '2026-03-21');
  assert.match(article.content, /Paragraph one/);
  assert.deepEqual(article.images, ['https://i-blog.csdnimg.cn/direct/example.png']);
  assert.equal(article.collection, 'CSDN文章');
});

test('extractCsdnArticleFromPage normalizes a single browser-evaluated payload', async () => {
  const article = await extractCsdnArticleFromPage({}, {
    sendFn: async (_ws, _method, params) => {
      const expression = String(params?.expression || '');
      assert.match(expression, /#content_views/);
      return {
        result: {
          value: {
            title: 'Chrome DevTools MCP vs agent-browser',
            author: 'Test Author',
            authorLink: 'https://blog.csdn.net/test_user',
            date: '2026-03-21',
            content: 'Article body',
            images: ['https://i-blog.csdnimg.cn/direct/example.png']
          }
        }
      };
    },
    url: 'https://blog.csdn.net/test_user/article/details/146200001'
  });

  assert.equal(article.platform, 'csdn');
  assert.equal(article.sourceType, 'csdn_article');
  assert.equal(article.title, 'Chrome DevTools MCP vs agent-browser');
  assert.equal(article.author, 'Test Author');
  assert.equal(article.authorLink, 'https://blog.csdn.net/test_user');
  assert.equal(article.date, '2026-03-21');
  assert.equal(article.content, 'Article body');
  assert.deepEqual(article.images, ['https://i-blog.csdnimg.cn/direct/example.png']);
});

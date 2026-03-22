const test = require('node:test');
const assert = require('node:assert/strict');

const {
  extractZhihuArticleFromHtml,
  extractZhihuAnswerFromHtml,
  extractZhihuArticleFromPage,
  extractZhihuAnswerFromPage
} = require('../../lib/sources/zhihu');

test('extractZhihuArticleFromHtml extracts title author date content and images', () => {
  const html = `
    <html>
      <body>
        <h1 class="Post-Title">Hand Chrome to AI</h1>
        <a class="AuthorInfo-name" href="/people/test-author">Test Author</a>
        <div class="ContentItem-time">
          <span>Published 2026-03-21</span>
        </div>
        <div class="Post-RichTextContainer">
          <p>Article paragraph one.</p>
          <p>Article paragraph two.</p>
          <img src="https://pic1.zhimg.com/v2-abc.jpg">
        </div>
      </body>
    </html>
  `;

  const article = extractZhihuArticleFromHtml({
    url: 'https://zhuanlan.zhihu.com/p/123456789',
    html
  });

  assert.equal(article.platform, 'zhihu');
  assert.equal(article.sourceType, 'zhihu_article');
  assert.equal(article.title, 'Hand Chrome to AI');
  assert.equal(article.author, 'Test Author');
  assert.equal(article.authorLink, 'https://www.zhihu.com/people/test-author');
  assert.equal(article.date, '2026-03-21');
  assert.match(article.content, /Article paragraph one/);
  assert.deepEqual(article.images, ['https://pic1.zhimg.com/v2-abc.jpg']);
  assert.equal(article.collection, '知乎文章');
});

test('extractZhihuAnswerFromHtml extracts question title answer author and images', () => {
  const html = `
    <html>
      <body>
        <h1 class="QuestionHeader-title">Can Chrome 146 attach to the current browser?</h1>
        <div class="AnswerItem">
          <meta itemprop="dateCreated" content="2026-03-20">
          <a class="AuthorInfo-name" href="/people/answer-author">Answer Author</a>
          <div class="RichContent RichContent--unescapable">
            <p>Yes, after remote debugging is enabled.</p>
            <img src="https://pic2.zhimg.com/v2-def.jpg">
          </div>
        </div>
      </body>
    </html>
  `;

  const article = extractZhihuAnswerFromHtml({
    url: 'https://www.zhihu.com/question/12345678/answer/87654321',
    html
  });

  assert.equal(article.platform, 'zhihu');
  assert.equal(article.sourceType, 'zhihu_answer');
  assert.equal(article.title, 'Can Chrome 146 attach to the current browser?');
  assert.equal(article.author, 'Answer Author');
  assert.equal(article.authorLink, 'https://www.zhihu.com/people/answer-author');
  assert.equal(article.date, '2026-03-20');
  assert.match(article.content, /remote debugging/);
  assert.deepEqual(article.images, ['https://pic2.zhimg.com/v2-def.jpg']);
  assert.equal(article.collection, '知乎回答');
});

test('extractZhihuArticleFromPage normalizes a single browser-evaluated payload', async () => {
  const article = await extractZhihuArticleFromPage({}, {
    sendFn: async (_ws, _method, params) => {
      const expression = String(params?.expression || '');
      assert.match(expression, /Post-RichTextContainer/);
      return {
        result: {
          value: {
            title: 'Hand Chrome to AI',
            author: 'Test Author',
            authorLink: 'https://www.zhihu.com/people/test-author',
            date: '2026-03-21',
            content: 'Zhihu article body',
            images: ['https://pic1.zhimg.com/v2-abc.jpg']
          }
        }
      };
    },
    url: 'https://zhuanlan.zhihu.com/p/123456789'
  });

  assert.equal(article.platform, 'zhihu');
  assert.equal(article.sourceType, 'zhihu_article');
  assert.equal(article.title, 'Hand Chrome to AI');
  assert.equal(article.author, 'Test Author');
  assert.equal(article.authorLink, 'https://www.zhihu.com/people/test-author');
  assert.equal(article.date, '2026-03-21');
  assert.equal(article.content, 'Zhihu article body');
  assert.deepEqual(article.images, ['https://pic1.zhimg.com/v2-abc.jpg']);
});

test('extractZhihuAnswerFromPage normalizes a single browser-evaluated payload', async () => {
  const article = await extractZhihuAnswerFromPage({}, {
    sendFn: async (_ws, _method, params) => {
      const expression = String(params?.expression || '');
      assert.match(expression, /AnswerItem/);
      return {
        result: {
          value: {
            title: 'Can Chrome 146 attach to the current browser?',
            author: 'Answer Author',
            authorLink: 'https://www.zhihu.com/people/answer-author',
            date: '2026-03-20',
            content: 'Yes, after remote debugging is enabled.',
            images: ['https://pic2.zhimg.com/v2-def.jpg']
          }
        }
      };
    },
    url: 'https://www.zhihu.com/question/12345678/answer/87654321'
  });

  assert.equal(article.platform, 'zhihu');
  assert.equal(article.sourceType, 'zhihu_answer');
  assert.equal(article.title, 'Can Chrome 146 attach to the current browser?');
  assert.equal(article.author, 'Answer Author');
  assert.equal(article.authorLink, 'https://www.zhihu.com/people/answer-author');
  assert.equal(article.date, '2026-03-20');
  assert.equal(article.content, 'Yes, after remote debugging is enabled.');
  assert.deepEqual(article.images, ['https://pic2.zhimg.com/v2-def.jpg']);
});

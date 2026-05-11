const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  buildZhihuCollectionApiUrl,
  buildZhihuFavoritesPaths,
  collectZhihuFavoriteEntries,
  extractZhihuCollectionTitleFromHtml,
  fetchZhihuCollectionPage,
  fetchZhihuCollectionTitle,
  normalizeZhihuCollectionPage,
  parseZhihuCollectionId,
  readZhihuFavoritesProgress,
  writeZhihuFavoritesProgress
} = require('../../lib/zhihu_favorites');
const { createTempDir } = require('./test_tmp');

test('parseZhihuCollectionId extracts collection id from Zhihu favorites url', () => {
  assert.equal(
    parseZhihuCollectionId('https://www.zhihu.com/collection/123456789'),
    '123456789'
  );
});

test('buildZhihuCollectionApiUrl builds Zhihu collection paging api url', () => {
  assert.equal(
    buildZhihuCollectionApiUrl({
      collectionId: '123456789',
      offset: 40,
      limit: 20
    }),
    'https://www.zhihu.com/api/v4/collections/123456789/items?offset=40&limit=20'
  );
});

test('buildZhihuFavoritesPaths creates collection root and progress path under 知乎收藏夹', () => {
  const tempRoot = createTempDir('zhihu-favorites-');
  const paths = buildZhihuFavoritesPaths({
    outputRoot: tempRoot,
    collectionId: '123456789',
    collectionTitle: 'AI / 自动化收藏'
  });

  assert.match(paths.rootDir, /知乎收藏夹[\\/]AI 自动化收藏$/);
  assert.match(paths.stateDir, /知乎收藏夹[\\/]AI 自动化收藏[\\/]_state$/);
  assert.match(paths.progressPath, /export-progress-123456789\.json$/);
});

test('readZhihuFavoritesProgress returns default state when progress file is missing', () => {
  const tempRoot = createTempDir('zhihu-favorites-');
  const progress = readZhihuFavoritesProgress(path.join(tempRoot, 'missing.json'));

  assert.deepEqual(progress, {
    collectionId: '',
    nextOffset: 0,
    exportedIds: [],
    completed: false,
    warnings: []
  });
});

test('writeZhihuFavoritesProgress persists normalized progress payload', () => {
  const tempRoot = createTempDir('zhihu-favorites-');
  const progressPath = path.join(tempRoot, '_state', 'export-progress-123456789.json');

  const progress = writeZhihuFavoritesProgress(progressPath, {
    collectionId: '123456789',
    nextOffset: 40,
    exportedIds: ['answer-1', '', 'answer-1', 'article-2'],
    completed: true,
    warnings: ['跳过 1 条失效内容']
  });

  assert.deepEqual(progress, {
    collectionId: '123456789',
    nextOffset: 40,
    exportedIds: ['answer-1', 'article-2'],
    completed: true,
    warnings: ['跳过 1 条失效内容']
  });

  const saved = JSON.parse(fs.readFileSync(progressPath, 'utf-8'));
  assert.deepEqual(saved, progress);
});

test('normalizeZhihuCollectionPage maps raw Zhihu api payload into collector page shape', () => {
  const page = normalizeZhihuCollectionPage({
    data: [
      {
        content: {
          id: '101',
          type: 'answer',
          url: 'https://www.zhihu.com/question/1/answer/101',
          question: { title: '问题 1' }
        },
        created_time: 1700000000
      },
      {
        content: {
          id: '202',
          type: 'article',
          url: 'https://zhuanlan.zhihu.com/p/202',
          title: '文章 202'
        },
        created_time: 1700000001
      }
    ],
    paging: {
      is_end: false,
      next: 'http://www.zhihu.com/api/v4/collections/123456789/items?offset=20&limit=20',
      totals: 88
    }
  });

  assert.deepEqual(page, {
    items: [
      {
        id: '101',
        url: 'https://www.zhihu.com/question/1/answer/101',
        title: '问题 1',
        type: 'answer',
        createdTime: 1700000000
      },
      {
        id: '202',
        url: 'https://zhuanlan.zhihu.com/p/202',
        title: '文章 202',
        type: 'article',
        createdTime: 1700000001
      }
    ],
    hasMore: true,
    nextOffset: 20,
    totals: 88
  });
});

test('extractZhihuCollectionTitleFromHtml reads collection title from meta tags and strips site suffix', () => {
  const title = extractZhihuCollectionTitleFromHtml(`
    <html>
      <head>
        <meta property="og:title" content="AI 自动化收藏 - 收藏夹 - 知乎" />
        <title>备用标题 - 知乎</title>
      </head>
      <body>
        <h1>页面标题</h1>
      </body>
    </html>
  `);

  assert.equal(title, 'AI 自动化收藏');
});

test('fetchZhihuCollectionTitle requests collection html with cookie header', async () => {
  let captured = null;
  const title = await fetchZhihuCollectionTitle({
    collectionUrl: 'https://www.zhihu.com/collection/123456789',
    cookie: 'd_c0=abc123',
    requestTextFn: async (url, options = {}) => {
      captured = { url, options };
      return `
        <html>
          <head>
            <title>AI 自动化收藏 - 收藏夹 - 知乎</title>
          </head>
          <body></body>
        </html>
      `;
    }
  });

  assert.deepEqual(captured, {
    url: 'https://www.zhihu.com/collection/123456789',
    options: {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        Cookie: 'd_c0=abc123'
      }
    }
  });
  assert.equal(title, 'AI 自动化收藏');
});

test('fetchZhihuCollectionPage requests Zhihu api with cookie header and returns normalized page', async () => {
  let captured = null;
  const page = await fetchZhihuCollectionPage({
    collectionId: '123456789',
    offset: 20,
    limit: 10,
    cookie: 'd_c0=abc123',
    requestJsonFn: async (url, options = {}) => {
      captured = { url, options };
      return {
        data: [
          {
            content: {
              id: '101',
              type: 'answer',
              url: 'https://www.zhihu.com/question/1/answer/101',
              question: { title: '问题 1' }
            },
            created_time: 1700000000
          }
        ],
        paging: {
          is_end: true,
          next: 'https://www.zhihu.com/api/v4/collections/123456789/items?offset=30&limit=10',
          totals: 1
        }
      };
    }
  });

  assert.deepEqual(captured, {
    url: 'https://www.zhihu.com/api/v4/collections/123456789/items?offset=20&limit=10',
    options: {
      headers: {
        Accept: 'application/json',
        Cookie: 'd_c0=abc123'
      }
    }
  });
  assert.deepEqual(page, {
    items: [
      {
        id: '101',
        url: 'https://www.zhihu.com/question/1/answer/101',
        title: '问题 1',
        type: 'answer',
        createdTime: 1700000000
      }
    ],
    hasMore: false,
    nextOffset: 30,
    totals: 1
  });
});

test('collectZhihuFavoriteEntries paginates from saved offset and skips exported ids', async () => {
  const seen_offsets = [];
  const paced_offsets = [];

  const result = await collectZhihuFavoriteEntries({
    collectionId: '123456789',
    progress: {
      collectionId: '123456789',
      nextOffset: 20,
      exportedIds: ['answer-1'],
      completed: false,
      warnings: []
    },
    fetchPageFn: async ({ offset }) => {
      seen_offsets.push(offset);
      if (offset === 20) {
        return {
          items: [
            { id: 'answer-1', url: 'https://www.zhihu.com/question/1/answer/1' },
            { id: 'answer-2', url: 'https://www.zhihu.com/question/1/answer/2' }
          ],
          hasMore: true,
          nextOffset: 40
        };
      }

      return {
        items: [
          { id: 'article-3', url: 'https://zhuanlan.zhihu.com/p/3' }
        ],
        hasMore: false,
        nextOffset: 60
      };
    },
    paceFn: async ({ offset }) => {
      paced_offsets.push(offset);
    }
  });

  assert.deepEqual(seen_offsets, [20, 40]);
  assert.deepEqual(paced_offsets, [20]);
  assert.deepEqual(result.entries, [
    {
      id: 'answer-2',
      url: 'https://www.zhihu.com/question/1/answer/2',
      sourceType: 'zhihu_answer'
    },
    {
      id: 'article-3',
      url: 'https://zhuanlan.zhihu.com/p/3',
      sourceType: 'zhihu_article'
    }
  ]);
  assert.deepEqual(result.progress, {
    collectionId: '123456789',
    nextOffset: 60,
    exportedIds: ['answer-1', 'answer-2', 'article-3'],
    completed: true,
    warnings: []
  });
  assert.deepEqual(result.warnings, []);
});

test('collectZhihuFavoriteEntries keeps earlier pages and returns warnings when a later page fails', async () => {
  const result = await collectZhihuFavoriteEntries({
    collectionId: '123456789',
    fetchPageFn: async ({ offset }) => {
      if (offset === 0) {
        return {
          items: [
            { id: 'answer-2', url: 'https://www.zhihu.com/question/1/answer/2' }
          ],
          hasMore: true,
          nextOffset: 20
        };
      }

      throw new Error('mock page failure');
    }
  });

  assert.deepEqual(result.entries, [
    {
      id: 'answer-2',
      url: 'https://www.zhihu.com/question/1/answer/2',
      sourceType: 'zhihu_answer'
    }
  ]);
  assert.equal(result.progress.nextOffset, 20);
  assert.equal(result.progress.completed, false);
  assert.deepEqual(result.progress.exportedIds, ['answer-2']);
  assert.match(result.warnings[0], /offset 20/i);
});

test('collectZhihuFavoriteEntries skips invalid or unsupported items but records warnings', async () => {
  const result = await collectZhihuFavoriteEntries({
    collectionId: '123456789',
    fetchPageFn: async () => ({
      items: [
        { id: 'empty-url', url: '' },
        { id: 'unsupported', url: 'https://example.com/post/1' },
        { id: 'article-3', url: 'https://zhuanlan.zhihu.com/p/3' }
      ],
      hasMore: false,
      nextOffset: 20
    })
  });

  assert.deepEqual(result.entries, [
    {
      id: 'article-3',
      url: 'https://zhuanlan.zhihu.com/p/3',
      sourceType: 'zhihu_article'
    }
  ]);
  assert.equal(result.warnings.length, 2);
  assert.match(result.warnings[0], /empty-url/);
  assert.match(result.warnings[1], /unsupported/);
});

test('collectZhihuFavoriteEntries writes normalized progress to progressPath after pagination', async () => {
  const tempRoot = createTempDir('zhihu-favorites-');
  const progressPath = path.join(tempRoot, '_state', 'export-progress-123456789.json');

  const result = await collectZhihuFavoriteEntries({
    collectionId: '123456789',
    progressPath,
    fetchPageFn: async ({ offset }) => {
      if (offset === 0) {
        return {
          items: [
            { id: 'answer-2', url: 'https://www.zhihu.com/question/1/answer/2' }
          ],
          hasMore: true,
          nextOffset: 20
        };
      }

      return {
        items: [
          { id: 'article-3', url: 'https://zhuanlan.zhihu.com/p/3' }
        ],
        hasMore: false,
        nextOffset: 40
      };
    }
  });

  assert.equal(fs.existsSync(progressPath), true);
  assert.deepEqual(readZhihuFavoritesProgress(progressPath), result.progress);
  assert.deepEqual(result.progress.exportedIds, ['answer-2', 'article-3']);
  assert.equal(result.progress.completed, true);
  assert.equal(result.progress.nextOffset, 40);
});

test('collectZhihuFavoriteEntries accepts raw Zhihu api page payloads', async () => {
  const result = await collectZhihuFavoriteEntries({
    collectionId: '123456789',
    fetchPageFn: async () => ({
      data: [
        {
          content: {
            id: '101',
            type: 'answer',
            url: 'https://www.zhihu.com/question/1/answer/101',
            question: { title: '问题 1' }
          },
          created_time: 1700000000
        }
      ],
      paging: {
        is_end: true,
        next: 'https://www.zhihu.com/api/v4/collections/123456789/items?offset=20&limit=20',
        totals: 1
      }
    })
  });

  assert.deepEqual(result.entries, [
    {
      id: '101',
      url: 'https://www.zhihu.com/question/1/answer/101',
      sourceType: 'zhihu_answer'
    }
  ]);
  assert.equal(result.progress.completed, true);
});

test('collectZhihuFavoriteEntries can continue after page failure when enabled', async () => {
  const result = await collectZhihuFavoriteEntries({
    collectionId: '123456789',
    continueOnPageError: true,
    limit: 20,
    fetchPageFn: async ({ offset }) => {
      if (offset === 0) {
        return {
          items: [
            { id: 'answer-2', url: 'https://www.zhihu.com/question/1/answer/2' }
          ],
          hasMore: true,
          nextOffset: 20
        };
      }

      if (offset === 20) {
        throw new Error('mock page failure');
      }

      return {
        items: [
          { id: 'article-3', url: 'https://zhuanlan.zhihu.com/p/3' }
        ],
        hasMore: false,
        nextOffset: 60
      };
    }
  });

  assert.deepEqual(result.entries, [
    {
      id: 'answer-2',
      url: 'https://www.zhihu.com/question/1/answer/2',
      sourceType: 'zhihu_answer'
    },
    {
      id: 'article-3',
      url: 'https://zhuanlan.zhihu.com/p/3',
      sourceType: 'zhihu_article'
    }
  ]);
  assert.equal(result.progress.completed, true);
  assert.equal(result.progress.nextOffset, 60);
  assert.match(result.warnings[0], /offset 20/i);
});

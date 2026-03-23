const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
  parseArgs,
  resolveZhihuCookie,
  run
} = require('../../save_zhihu_favorites');
const { createTempDir } = require('./test_tmp');

test('parseArgs accepts collection url with cookie, title, output root, and limit', () => {
  assert.deepEqual(
    parseArgs([
      'https://www.zhihu.com/collection/123456789',
      '--cookie', 'd_c0=abc123',
      '--title', 'AI 收藏',
      '--output-root', 'G:/exports',
      '--limit', '10'
    ]),
    {
      collectionUrl: 'https://www.zhihu.com/collection/123456789',
      cookie: 'd_c0=abc123',
      title: 'AI 收藏',
      outputRoot: 'G:/exports',
      limit: 10
    }
  );
});

test('parseArgs requires collection url input', () => {
  assert.throws(() => parseArgs([]), /Usage/);
});

test('run collects favorite urls and forwards them into saveLinksText', async () => {
  const tempRoot = createTempDir('zhihu-favorites-cli-');
  let capturedText = '';
  let capturedOptions = null;

  const result = await run(
    [
      'https://www.zhihu.com/collection/123456789',
      '--cookie', 'd_c0=abc123',
      '--title', 'AI 收藏',
      '--output-root', tempRoot,
      '--limit', '10'
    ],
    {
      collectZhihuFavoriteEntriesFn: async ({ collectionId, progressPath, limit, fetchPageFn }) => {
        assert.equal(collectionId, '123456789');
        assert.match(progressPath, /知乎收藏夹[\\/]AI 收藏[\\/]_state[\\/]export-progress-123456789\.json$/);
        assert.equal(limit, 10);
        const page = await fetchPageFn({ offset: 0, limit });
        assert.deepEqual(page.items[0], {
          id: '101',
          url: 'https://www.zhihu.com/question/1/answer/101',
          title: '问题 1',
          type: 'answer',
          createdTime: 1700000000
        });
        return {
          entries: [
            { id: '101', url: 'https://www.zhihu.com/question/1/answer/101', sourceType: 'zhihu_answer' },
            { id: '202', url: 'https://zhuanlan.zhihu.com/p/202', sourceType: 'zhihu_article' }
          ],
          warnings: ['skip one item'],
          progress: {
            collectionId: '123456789',
            nextOffset: 20,
            exportedIds: ['101', '202'],
            completed: true,
            warnings: ['skip one item']
          }
        };
      },
      fetchZhihuCollectionPageFn: async ({ collectionId, offset, limit, cookie }) => {
        assert.equal(collectionId, '123456789');
        assert.equal(offset, 0);
        assert.equal(limit, 10);
        assert.equal(cookie, 'd_c0=abc123');
        return {
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
          nextOffset: 10,
          totals: 1
        };
      },
      saveLinksTextFn: async (text, options = {}) => {
        capturedText = text;
        capturedOptions = options;
        return {
          total: 2,
          successCount: 2,
          failureCount: 0,
          results: [
            { status: 'success', filepath: 'G:/output/知乎收藏夹/AI 收藏/知乎回答/问题 1.md' },
            { status: 'success', filepath: 'G:/output/知乎收藏夹/AI 收藏/知乎文章/文章 202.md' }
          ]
        };
      }
    }
  );

  assert.equal(capturedText, 'https://www.zhihu.com/question/1/answer/101\nhttps://zhuanlan.zhihu.com/p/202');
  assert.equal(capturedOptions.outputRoot, path.join(tempRoot, '知乎收藏夹', 'AI 收藏'));
  assert.equal(result.collectionId, '123456789');
  assert.equal(result.collect.warnings[0], 'skip one item');
  assert.equal(result.summary.successCount, 2);
});

test('run rejects when cookie is missing', async () => {
  await assert.rejects(
    () => run(['https://www.zhihu.com/collection/123456789']),
    /--cookie|ZHIHU_COOKIE|Chrome session/i
  );
});

test('resolveZhihuCookie falls back to browser cookie resolver when explicit cookie is missing', async () => {
  const cookie = await resolveZhihuCookie({
    collectionUrl: 'https://www.zhihu.com/collection/123456789'
  }, {
    resolveCookieHeaderFromBrowserFn: async ({ urls, domains, candidates }) => {
      assert.equal(urls[0], 'https://www.zhihu.com/collection/123456789');
      assert.deepEqual(domains, ['zhihu.com']);
      assert.equal(candidates.length, 2);
      assert.equal(candidates[0].label, 'project-browser');
      assert.equal(candidates[1].label, 'current-browser');
      return {
        cookie: 'd_c0=auto123; z_c0=token456',
        source: 'current-browser'
      };
    }
  });

  assert.equal(cookie, 'd_c0=auto123; z_c0=token456');
});

test('run resolves missing cookie and title via injected resolvers', async () => {
  const tempRoot = createTempDir('zhihu-favorites-cli-');
  let capturedText = '';
  let capturedOptions = null;

  const result = await run(
    [
      'https://www.zhihu.com/collection/123456789',
      '--output-root', tempRoot
    ],
    {
      resolveCookieFn: async ({ parsed, collectionId, collectionUrl }) => {
        assert.equal(parsed.collectionUrl, 'https://www.zhihu.com/collection/123456789');
        assert.equal(collectionId, '123456789');
        assert.equal(collectionUrl, 'https://www.zhihu.com/collection/123456789');
        return {
          cookie: 'd_c0=auto123; z_c0=token456',
          source: 'project-browser'
        };
      },
      resolveCollectionTitleFn: async ({ collectionId, collectionUrl, cookie }) => {
        assert.equal(collectionId, '123456789');
        assert.equal(collectionUrl, 'https://www.zhihu.com/collection/123456789');
        assert.equal(cookie, 'd_c0=auto123; z_c0=token456');
        return '自动识别收藏夹';
      },
      collectZhihuFavoriteEntriesFn: async ({ collectionId, progressPath, limit, fetchPageFn }) => {
        assert.equal(collectionId, '123456789');
        assert.match(progressPath, /知乎收藏夹[\\/]自动识别收藏夹[\\/]_state[\\/]export-progress-123456789\.json$/);
        assert.equal(limit, 20);
        const page = await fetchPageFn({ offset: 0, limit });
        assert.deepEqual(page.items[0], {
          id: '101',
          url: 'https://www.zhihu.com/question/1/answer/101',
          title: '问题 1',
          type: 'answer',
          createdTime: 1700000000
        });
        return {
          entries: [
            { id: '101', url: 'https://www.zhihu.com/question/1/answer/101', sourceType: 'zhihu_answer' }
          ],
          warnings: [],
          progress: {
            collectionId: '123456789',
            nextOffset: 20,
            exportedIds: ['101'],
            completed: true,
            warnings: []
          }
        };
      },
      fetchZhihuCollectionPageFn: async ({ collectionId, offset, limit, cookie }) => {
        assert.equal(collectionId, '123456789');
        assert.equal(offset, 0);
        assert.equal(limit, 20);
        assert.equal(cookie, 'd_c0=auto123; z_c0=token456');
        return {
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
          nextOffset: 20,
          totals: 1
        };
      },
      saveLinksTextFn: async (text, options = {}) => {
        capturedText = text;
        capturedOptions = options;
        return {
          total: 1,
          successCount: 1,
          failureCount: 0,
          results: [
            { status: 'success', filepath: 'G:/output/知乎收藏夹/自动识别收藏夹/知乎回答/问题 1.md' }
          ]
        };
      }
    }
  );

  assert.equal(capturedText, 'https://www.zhihu.com/question/1/answer/101');
  assert.equal(capturedOptions.outputRoot, path.join(tempRoot, '知乎收藏夹', '自动识别收藏夹'));
  assert.equal(result.collectionTitle, '自动识别收藏夹');
  assert.equal(result.summary.successCount, 1);
});

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createTempDir } = require('./test_tmp');
const { exportLinksList } = require('../../lib/export_links_list');

test('exportLinksList writes a txt file for one result group under _lists', () => {
  const tempDir = createTempDir('xhs-export-links-');
  const result = exportLinksList({
    report: {
      results: [
        {
          status: 'success',
          filepath: path.join(tempDir, 'AI', 'note-a.md'),
          input: 'https://mp.weixin.qq.com/s/abc123'
        },
        {
          status: 'success',
          filepath: path.join(tempDir, 'AI', 'note-b.md'),
          canonicalUrl: 'https://www.zhihu.com/question/1/answer/2'
        },
        {
          status: 'success',
          filepath: path.join(tempDir, '工具', 'note-c.md'),
          navigationUrl: 'https://blog.csdn.net/test/article/details/123'
        }
      ]
    },
    groupKey: 'AI',
    uiConfig: {
      paths: {
        saveLinksOutputRoot: tempDir
      }
    },
    projectDir: tempDir,
    defaultOutputDir: tempDir,
    now: new Date('2026-03-21T10:11:12Z')
  });

  assert.equal(result.count, 2);
  assert.equal(path.dirname(result.filePath), path.join(tempDir, '_lists'));
  assert.match(path.basename(result.filePath), /AI-links\.txt$/);

  const fileText = fs.readFileSync(result.filePath, 'utf-8');
  assert.equal(
    fileText,
    'https://mp.weixin.qq.com/s/abc123\nhttps://www.zhihu.com/question/1/answer/2\n'
  );
});

test('exportLinksList can export failure group links', () => {
  const tempDir = createTempDir('xhs-export-links-');
  const result = exportLinksList({
    report: {
      results: [
        {
          status: 'failed',
          input: 'https://example.com/fail-1',
          error: 'failed'
        },
        {
          status: 'failed',
          canonicalUrl: 'https://example.com/fail-2',
          error: 'failed'
        }
      ]
    },
    groupKey: 'failure',
    uiConfig: {
      paths: {
        saveLinksOutputRoot: tempDir
      }
    },
    projectDir: tempDir,
    defaultOutputDir: tempDir,
    now: new Date('2026-03-21T10:11:12Z')
  });

  assert.equal(result.count, 2);
  assert.match(path.basename(result.filePath), /failure-links\.txt$/);
});

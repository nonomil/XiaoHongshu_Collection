const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  buildInboxVerificationReport,
  verifyRecentInboxCopies
} = require('../../lib/inbox_verify');
const { parseArgs, run } = require('../../inbox_verify_recent');
const { createTempDir } = require('./test_tmp');

function writeMarkdown(filepath, sourceUrl) {
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.writeFileSync(filepath, `---\nsource: "${sourceUrl}"\n---\n\n正文`, 'utf-8');
}

test('buildInboxVerificationReport marks urls with both classified and total copies as complete', () => {
  const report = buildInboxVerificationReport({
    urls: [
      'https://mp.weixin.qq.com/s/demo-1',
      'https://www.zhihu.com/question/1/answer/2'
    ],
    markdownEntries: [
      {
        filepath: 'G:/output/收件箱同步/AI/demo-1.md',
        text: 'source: "https://mp.weixin.qq.com/s/demo-1"'
      },
      {
        filepath: 'G:/output/收件箱同步/全部/demo-1.md',
        text: 'source: "https://mp.weixin.qq.com/s/demo-1"'
      },
      {
        filepath: 'G:/output/收件箱同步/全部/answer-2.md',
        text: 'source: "https://www.zhihu.com/question/1/answer/2"'
      }
    ]
  });

  assert.equal(report.summary.candidateCount, 2);
  assert.equal(report.summary.okBoth, 1);
  assert.deepEqual(report.summary.missingTotal, []);
  assert.deepEqual(report.summary.missingClassified, ['https://www.zhihu.com/question/1/answer/2']);
});

test('verifyRecentInboxCopies only checks recent zhihu and wechat links', async () => {
  const tempRoot = createTempDir('inbox-verify-');
  const inboxPath = path.join(tempRoot, 'inbox_links.jsonl');
  const outputRoot = path.join(tempRoot, 'output');
  const lines = [
    JSON.stringify({ url: 'https://example.com/not-supported' }),
    JSON.stringify({ url: 'https://mp.weixin.qq.com/s/older-link' }),
    JSON.stringify({ url: 'https://mp.weixin.qq.com/s/recent-1' }),
    JSON.stringify({ url: 'https://www.zhihu.com/question/1/answer/2' })
  ].join('\n') + '\n';
  fs.writeFileSync(inboxPath, lines, 'utf-8');

  writeMarkdown(
    path.join(outputRoot, '收件箱同步', 'AI', 'recent-1.md'),
    'https://mp.weixin.qq.com/s/recent-1'
  );
  writeMarkdown(
    path.join(outputRoot, '收件箱同步', '全部', 'recent-1.md'),
    'https://mp.weixin.qq.com/s/recent-1'
  );
  writeMarkdown(
    path.join(outputRoot, '收件箱同步', '全部', 'answer-2.md'),
    'https://www.zhihu.com/question/1/answer/2'
  );

  const report = await verifyRecentInboxCopies({
    inboxPath,
    outputRoot,
    limit: 2
  });

  assert.equal(report.summary.candidateCount, 2);
  assert.equal(report.summary.okBoth, 1);
  assert.deepEqual(report.summary.missingTotal, []);
  assert.deepEqual(report.summary.missingClassified, ['https://www.zhihu.com/question/1/answer/2']);
  assert.equal(report.report[0].url, 'https://mp.weixin.qq.com/s/recent-1');
  assert.equal(report.report[1].url, 'https://www.zhihu.com/question/1/answer/2');
});

test('parseArgs accepts limit and output root', () => {
  assert.deepEqual(
    parseArgs(['--limit', '30', '--output-root', 'G:/exports/inbox']),
    {
      limit: 30,
      outputRoot: 'G:/exports/inbox'
    }
  );
});

test('parseArgs also accepts npm forwarded positional limit', () => {
  assert.deepEqual(
    parseArgs(['30']),
    {
      limit: 30
    }
  );
});

test('run forwards parsed args into verifyRecentInboxCopies', async () => {
  const result = await run(
    ['--limit', '20', '--output-root', 'G:/exports/inbox'],
    {
      pushbulletConfigPath: path.join(createTempDir('inbox-verify-config-'), 'pushbullet.json'),
      inboxPath: 'G:/UserCode/XiaoHongshu_Collection/data/inbox_links.jsonl',
      verifyRecentInboxCopiesFn: async (options) => {
        assert.equal(options.limit, 20);
        assert.equal(options.outputRoot, 'G:/exports/inbox');
        assert.equal(options.inboxPath, 'G:/UserCode/XiaoHongshu_Collection/data/inbox_links.jsonl');
        return {
          summary: {
            candidateCount: 1,
            okBoth: 1,
            missingTotal: [],
            missingClassified: []
          },
          report: []
        };
      }
    }
  );

  assert.equal(result.summary.okBoth, 1);
});

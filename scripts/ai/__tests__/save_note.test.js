const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildChromeLaunchArgs,
  buildChromeDebugHelp,
  formatSaveNoteError,
  getNavigationUrl,
  parseArgs,
  resolveRunModes,
  resolveRunMode,
  saveModesSequentially,
  shouldAutoLaunchChrome
} = require('../../save_note');

test('parseArgs returns current mode for --current', () => {
  assert.deepEqual(parseArgs(['--current']), { mode: 'current' });
});

test('parseArgs returns input mode for url or share text', () => {
  assert.deepEqual(parseArgs(['https://www.xiaohongshu.com/explore/abc123']), {
    mode: 'input',
    input: 'https://www.xiaohongshu.com/explore/abc123'
  });
});

test('parseArgs rejects empty input', () => {
  assert.throws(() => parseArgs([]), /Usage/);
});

test('resolveRunMode returns current mode unchanged', async () => {
  const result = await resolveRunMode({ mode: 'current' });
  assert.deepEqual(result, { mode: 'current' });
});

test('resolveRunMode normalizes direct note urls', async () => {
  const result = await resolveRunMode({
    mode: 'input',
    input: 'https://www.xiaohongshu.com/explore/abc123'
  });

  assert.equal(result.mode, 'url');
  assert.equal(result.noteId, 'abc123');
  assert.equal(result.canonicalUrl, 'https://www.xiaohongshu.com/discovery/item/abc123');
});

test('resolveRunModes resolves mixed text into deduplicated note targets', async () => {
  const modes = await resolveRunModes(
    {
      mode: 'input',
      input: [
        '短链 http://xhslink.com/o/short1',
        '重复 https://www.xiaohongshu.com/explore/abc123',
        '第二条 https://www.xiaohongshu.com/discovery/item/def456'
      ].join('\n')
    },
    {
      resolveRedirectFn: async (url) => {
        if (url === 'http://xhslink.com/o/short1') {
          return 'https://www.xiaohongshu.com/discovery/item/abc123?xsec_token=foo';
        }
        return url;
      }
    }
  );

  assert.deepEqual(modes.map((item) => item.noteId), ['abc123', 'def456']);
  assert.equal(modes[0].navigationUrl, 'http://xhslink.com/o/short1');
  assert.equal(modes[0].sourceType, 'share_text');
});

test('saveModesSequentially aggregates results without aborting after a failure', async () => {
  const order = [];
  const summary = await saveModesSequentially(
    [
      { noteId: 'abc123', canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/abc123' },
      { noteId: 'def456', canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/def456' },
      { noteId: 'ghi789', canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/ghi789' }
    ],
    {
      saveMode: async (mode) => {
        order.push(mode.noteId);
        if (mode.noteId === 'def456') {
          throw new Error('mock failure');
        }
        return { result: { filepath: `G:/output/${mode.noteId}.md` } };
      }
    }
  );

  assert.deepEqual(order, ['abc123', 'def456', 'ghi789']);
  assert.equal(summary.total, 3);
  assert.equal(summary.successCount, 2);
  assert.equal(summary.failureCount, 1);
  assert.equal(summary.results[1].status, 'failed');
  assert.match(summary.results[1].error, /mock failure/);
  assert.equal(summary.results[2].status, 'success');
  assert.deepEqual(Object.keys(summary).sort(), ['failureCount', 'results', 'successCount', 'total']);
  assert.deepEqual(
    Object.keys(summary.results[0]).sort(),
    ['canonicalUrl', 'filepath', 'index', 'input', 'navigationUrl', 'noteId', 'status']
  );
  assert.deepEqual(
    Object.keys(summary.results[1]).sort(),
    ['canonicalUrl', 'error', 'index', 'input', 'navigationUrl', 'noteId', 'status']
  );
});

test('getNavigationUrl prefers original navigation url over canonical url', () => {
  const result = getNavigationUrl({
    mode: 'url',
    navigationUrl: 'http://xhslink.com/o/7AXKPbGMN6Q',
    canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/abc123'
  });

  assert.equal(result, 'http://xhslink.com/o/7AXKPbGMN6Q');
});

test('shouldAutoLaunchChrome only applies to direct url mode', () => {
  assert.equal(shouldAutoLaunchChrome({ mode: 'url' }), true);
  assert.equal(shouldAutoLaunchChrome({ mode: 'current' }), false);
});

test('buildChromeLaunchArgs includes debug port, isolated profile, and navigation url', () => {
  const args = buildChromeLaunchArgs({
    userDataDir: 'G:/tmp/chrome-debug',
    url: 'http://xhslink.com/o/7AXKPbGMN6Q'
  });

  assert.deepEqual(args.slice(0, 4), [
    '--remote-debugging-port=9222',
    '--no-first-run',
    '--no-default-browser-check',
    '--new-window'
  ]);
  assert.equal(args.includes('--user-data-dir=G:/tmp/chrome-debug'), true);
  assert.equal(args.at(-1), 'http://xhslink.com/o/7AXKPbGMN6Q');
});

test('buildChromeDebugHelp includes launch guidance for remote debugging', () => {
  const help = buildChromeDebugHelp();
  assert.match(help, /9222/);
  assert.match(help, /--remote-debugging-port=9222/);
  assert.match(help, /Chrome/);
});

test('formatSaveNoteError explains how to start Chrome debug port when connection is refused', () => {
  const message = formatSaveNoteError(new Error('connect ECONNREFUSED 127.0.0.1:9222'));
  assert.match(message, /9222/);
  assert.match(message, /Chrome/);
  assert.match(message, /--remote-debugging-port=9222/);
});

test('formatSaveNoteError unwraps aggregate connection errors from localhost resolution', () => {
  const error = new AggregateError([
    new Error('connect ECONNREFUSED ::1:9222'),
    new Error('connect ECONNREFUSED 127.0.0.1:9222')
  ], '');
  error.code = 'ECONNREFUSED';

  const message = formatSaveNoteError(error);
  assert.match(message, /9222/);
  assert.match(message, /Chrome/);
  assert.match(message, /ECONNREFUSED/i);
});

test('formatSaveNoteError preserves no-tab guidance', () => {
  const message = formatSaveNoteError(new Error('No xiaohongshu tab found'));
  assert.match(message, /小红书/i);
  assert.match(message, /标签页|tab/i);
});

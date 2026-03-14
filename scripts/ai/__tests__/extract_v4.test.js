const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildCollectionThrottle,
  buildCollectionReportMarkdown,
  buildCollectionReportPath,
  writeCollectionReport,
  retryCollectionTask,
  buildNoteFailureEntry,
  ensureLoggedIn
} = require('../../extract_v4');

test('buildCollectionThrottle waits with jittered delay', async () => {
  const waits = [];
  const throttle = buildCollectionThrottle({
    throttleMs: 100,
    throttleJitterMs: 50,
    rng: () => 0.5,
    wait: async (ms) => { waits.push(ms); }
  });

  const delay = await throttle();
  assert.equal(delay, 125);
  assert.deepEqual(waits, [125]);
});

test('retryCollectionTask retries with exponential backoff', async () => {
  let attempts = 0;
  const waits = [];
  const result = await retryCollectionTask(async () => {
    attempts += 1;
    if (attempts < 3) throw new Error('fail');
    return 'ok';
  }, {
    retries: 2,
    baseDelayMs: 100,
    maxDelayMs: 500,
    jitterMs: 0,
    wait: async (ms) => { waits.push(ms); }
  });

  assert.equal(result, 'ok');
  assert.equal(attempts, 3);
  assert.deepEqual(waits, [100, 200]);
});

test('buildNoteFailureEntry keeps board and note info', () => {
  const entry = buildNoteFailureEntry({
    boardName: 'AI',
    noteId: 'abc123',
    href: 'https://www.xiaohongshu.com/explore/abc123',
    error: 'detail empty'
  });

  assert.deepEqual(entry, {
    type: 'note',
    board: 'AI',
    noteId: 'abc123',
    href: 'https://www.xiaohongshu.com/explore/abc123',
    error: 'detail empty'
  });
});

test('buildCollectionReportPath uses output root and timestamp', () => {
  const now = new Date(2026, 2, 15, 16, 9, 10);
  const reportPath = buildCollectionReportPath({
    outputRoot: 'G:/output',
    now
  });

  assert.equal(reportPath.includes('G:'), true);
  assert.equal(reportPath.includes('_reports'), true);
  assert.equal(reportPath.includes('collection-export-20260315-160910.md'), true);
});

test('buildCollectionReportMarkdown includes failures and suggestions', () => {
  const markdown = buildCollectionReportMarkdown({
    rawPath: 'G:/data/raw_notes.json',
    total: 2,
    failures: 1,
    failed: [
      {
        type: 'note',
        board: 'AI',
        noteId: 'abc123',
        href: 'https://www.xiaohongshu.com/explore/abc123',
        error: 'note detail empty'
      }
    ]
  });

  assert.match(markdown, /raw_notes\.json/);
  assert.match(markdown, /abc123/);
  assert.match(markdown, /note detail empty/);
  assert.match(markdown, /重新登录|降低频率|稍后重试/);
});

test('ensureLoggedIn throws when account is missing', () => {
  assert.throws(
    () => ensureLoggedIn({ uid: '', nickname: '' }),
    /登录/
  );
});

test('ensureLoggedIn passes when account exists', () => {
  assert.equal(ensureLoggedIn({ uid: 'u1', nickname: 'nick' }), true);
});

test('writeCollectionReport writes markdown report', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xhs-report-'));
  const reportPath = writeCollectionReport({
    outputRoot: tmp,
    rawPath: path.join(tmp, 'raw_notes.json'),
    total: 1,
    failures: 1,
    failed: [{
      board: 'AI',
      noteId: 'n1',
      href: 'https://xhs.com/explore/n1',
      error: 'note detail empty'
    }],
    now: new Date(2026, 2, 15, 16, 9, 10)
  });
  assert.equal(fs.existsSync(reportPath), true);
  const content = fs.readFileSync(reportPath, 'utf-8');
  assert.match(content, /note detail empty/);
});

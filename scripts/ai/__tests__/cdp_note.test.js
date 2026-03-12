const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildBoardNote,
  buildSingleNote,
  ensureCommentsReady,
  extractImageUrlsFromStateNote,
  expandAllComments,
  isNoteDetailUrl,
  selectDebuggerTab,
  waitForNoteDetailReady,
  waitForCommentStateChange
} = require('../../lib/cdp_note');

test('isNoteDetailUrl accepts explore and discovery item urls', () => {
  assert.equal(isNoteDetailUrl('https://www.xiaohongshu.com/explore/abc123'), true);
  assert.equal(isNoteDetailUrl('https://www.xiaohongshu.com/discovery/item/abc123?xsec_token=foo'), true);
  assert.equal(isNoteDetailUrl('https://www.xiaohongshu.com/board/abc123'), false);
});

test('buildSingleNote maps extracted detail into 单条笔记保存 note shape', () => {
  const note = buildSingleNote({
    detail: {
      title: '标题',
      content: '正文',
      author: '作者',
      date: '2026-03-08',
      tags: ['标签1'],
      images: ['https://example.com/a.jpg'],
      comments: [{ commentId: 'c1', author: '评论者', content: '有用评论', likeCount: 3 }],
      url: 'https://www.xiaohongshu.com/explore/abc123'
    },
    noteId: 'abc123',
    account: {
      uid: 'u1',
      nickname: 'nick',
      accountKey: 'nick_u1'
    }
  });

  assert.equal(note.collection, '单条笔记保存');
  assert.equal(note.noteId, 'abc123');
  assert.equal(note.accountKey, 'nick_u1');
  assert.equal(note.comments.length, 1);
  assert.equal(note.comments[0].commentId, 'c1');
});

test('buildBoardNote preserves board collection', () => {
  const note = buildBoardNote({
    detail: {
      title: '标题',
      content: '正文',
      author: '作者',
      date: '2026-03-08',
      tags: [],
      images: [],
      url: 'https://www.xiaohongshu.com/explore/abc123'
    },
    noteId: 'abc123',
    collection: 'AI'
  });

  assert.equal(note.collection, 'AI');
  assert.equal(note.noteUrl, 'https://www.xiaohongshu.com/explore/abc123');
});

test('extractImageUrlsFromStateNote falls back to imageList urls when DOM images are unavailable', () => {
  const images = extractImageUrlsFromStateNote({
    imageList: [
      {
        url: '',
        urlDefault: 'http://example.com/default-1.webp',
        urlPre: 'http://example.com/pre-1.webp',
        infoList: [
          { imageScene: 'WB_PRV', url: 'http://example.com/pre-1.webp' },
          { imageScene: 'WB_DFT', url: 'http://example.com/default-1.webp' }
        ]
      },
      {
        url: '',
        urlDefault: '',
        urlPre: '',
        infoList: [
          { imageScene: 'WB_PRV', url: 'http://example.com/pre-2.webp' }
        ]
      }
    ]
  });

  assert.deepEqual(images, [
    'https://example.com/default-1.webp',
    'https://example.com/pre-2.webp'
  ]);
});

test('waitForCommentStateChange polls until comment state changes', async () => {
  const states = [
    { commentCount: 11, buttonCount: 2 },
    { commentCount: 11, buttonCount: 2 },
    { commentCount: 16, buttonCount: 1 }
  ];
  const waits = [];

  const result = await waitForCommentStateChange({
    previousState: { commentCount: 11, buttonCount: 2 },
    readState: async () => states.shift(),
    wait: async (ms) => { waits.push(ms); },
    attempts: 3,
    intervalMs: 300
  });

  assert.deepEqual(result, { changed: true, state: { commentCount: 16, buttonCount: 1 } });
  assert.deepEqual(waits, [300, 300, 300]);
});

test('waitForCommentStateChange treats comment window replacement as a state change', async () => {
  const states = [
    { commentCount: 20, buttonCount: 0, lastCommentId: 'c20' },
    { commentCount: 20, buttonCount: 0, lastCommentId: 'c40' }
  ];

  const result = await waitForCommentStateChange({
    previousState: { commentCount: 20, buttonCount: 0, lastCommentId: 'c20' },
    readState: async () => states.shift(),
    wait: async () => {},
    attempts: 2,
    intervalMs: 50
  });

  assert.deepEqual(result, {
    changed: true,
    state: { commentCount: 20, buttonCount: 0, lastCommentId: 'c40' }
  });
});

test('expandAllComments keeps clicking while delayed updates still reveal more comments', async () => {
  const loopStates = [
    { commentCount: 11, buttonCount: 2 }
  ];
  const waitResults = [
    { changed: true, state: { commentCount: 16, buttonCount: 1 } },
    { changed: true, state: { commentCount: 16, buttonCount: 0 } }
  ];
  const clicks = [];

  await expandAllComments(null, 5, {
    readState: async () => loopStates.shift() || { commentCount: 16, buttonCount: 0 },
    clickNext: async () => {
      clicks.push('clicked');
      return true;
    },
    waitForStateChange: async () => waitResults.shift() || { changed: false, state: { commentCount: 16, buttonCount: 0 } }
  });

  assert.equal(clicks.length, 2);
});

test('ensureCommentsReady scrolls lazy-loaded comments into a readable state before expansion', async () => {
  const readyState = {
    hasCommentsRoot: true,
    commentCount: 13,
    buttonCount: 0,
    totalCount: 30,
    reachedEnd: false,
    lastCommentId: 'c13',
    isLoading: false
  };
  const scrolls = [];

  const state = await ensureCommentsReady(null, 3, {
    readState: async () => ({
      hasCommentsRoot: true,
      commentCount: 0,
      buttonCount: 0,
      totalCount: 0,
      reachedEnd: false,
      lastCommentId: '',
      isLoading: true
    }),
    scrollMore: async () => {
      scrolls.push('scrolled');
      return true;
    },
    waitForStateChange: async () => ({
      changed: true,
      state: readyState
    })
  });

  assert.equal(scrolls.length, 1);
  assert.deepEqual(state, readyState);
});

test('expandAllComments keeps advancing when more top-level comments require scrolling instead of show-more buttons', async () => {
  const loopStates = [
    { commentCount: 10, buttonCount: 0, totalCount: 30, reachedEnd: false, lastCommentId: 'c10' }
  ];
  const waitResults = [
    { changed: true, state: { commentCount: 20, buttonCount: 0, totalCount: 30, reachedEnd: false, lastCommentId: 'c20' } },
    { changed: true, state: { commentCount: 30, buttonCount: 0, totalCount: 30, reachedEnd: true, lastCommentId: 'c30' } }
  ];
  const scrolls = [];

  await expandAllComments(null, 5, {
    readState: async () => loopStates.shift() || { commentCount: 30, buttonCount: 0, totalCount: 30, reachedEnd: true, lastCommentId: 'c30' },
    clickNext: async () => false,
    scrollMore: async () => {
      scrolls.push('scrolled');
      return true;
    },
    waitForStateChange: async () => waitResults.shift() || { changed: false, state: { commentCount: 30, buttonCount: 0, totalCount: 30, reachedEnd: true, lastCommentId: 'c30' } }
  });

  assert.equal(scrolls.length, 2);
});

test('waitForNoteDetailReady polls until the note detail title is available', async () => {
  const states = [
    { url: 'about:blank', title: '' },
    { url: 'https://www.xiaohongshu.com/explore/abc123', title: '' },
    { url: 'https://www.xiaohongshu.com/explore/abc123', title: '标题' }
  ];
  const waits = [];

  const result = await waitForNoteDetailReady({
    readState: async () => states.shift(),
    wait: async (ms) => { waits.push(ms); },
    attempts: 3,
    intervalMs: 500
  });

  assert.deepEqual(result, {
    ready: true,
    state: { url: 'https://www.xiaohongshu.com/explore/abc123', title: '标题' }
  });
  assert.deepEqual(waits, [500, 500, 500]);
});

test('selectDebuggerTab falls back to a regular page tab when xiaohongshu is not open yet', () => {
  const wsUrl = selectDebuggerTab([
    {
      type: 'page',
      title: 'about:blank',
      url: 'about:blank',
      webSocketDebuggerUrl: 'ws://localhost:9222/devtools/page/1'
    }
  ], { requireXiaohongshu: false });

  assert.equal(wsUrl, 'ws://localhost:9222/devtools/page/1');
});

test('selectDebuggerTab requires an existing xiaohongshu page for current-page mode', () => {
  assert.throws(() => selectDebuggerTab([
    {
      type: 'page',
      title: 'about:blank',
      url: 'about:blank',
      webSocketDebuggerUrl: 'ws://localhost:9222/devtools/page/1'
    }
  ], { requireXiaohongshu: true }), /No xiaohongshu tab found/);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  buildBoardNote,
  buildBrowserTargets,
  buildSingleNote,
  ensureCommentsReady,
  extractNoteCoreDetail,
  extractNoteDetail,
  extractImageUrlsFromStateNote,
  expandAllComments,
  getTabWsUrl,
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
      noteType: 'video',
      hasVideoMedia: true,
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
  assert.equal(note.noteType, 'video');
  assert.equal(note.hasVideoMedia, true);
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

test('extractNoteCoreDetail falls back to state images when DOM images are empty', async () => {
  const detail = await extractNoteCoreDetail(null, {
    evaluate: async () => ({
      url: 'https://www.xiaohongshu.com/explore/abc123',
      title: '标题',
      content: '正文',
      author: '作者',
      date: '2026-04-06',
      tags: ['标签'],
      images: [],
      stateNote: {
        imageList: [
          {
            urlDefault: 'http://example.com/default-1.webp',
            infoList: [
              { imageScene: 'WB_DFT', url: 'http://example.com/default-1.webp' }
            ]
          }
        ]
      }
    })
  });

  assert.deepEqual(detail.images, ['https://example.com/default-1.webp']);
  assert.equal(detail.title, '标题');
});

test('extractNoteDetail composes core detail and comment diagnostics', async () => {
  const detail = await extractNoteDetail(null, {
    extractNoteCoreDetailFn: async () => ({
      url: 'https://www.xiaohongshu.com/explore/abc123',
      title: '标题',
      content: '正文',
      author: '作者',
      date: '2026-04-06',
      tags: [],
      images: ['https://example.com/a.jpg']
    }),
    collectNoteCommentDiagnosticsFn: async () => ({
      comments: [{ commentId: 'c1', content: '评论1' }],
      commentTotal: 3,
      commentError: '评论可能未完整加载：页面显示共 3 条，当前抓取 1 条。',
      commentWarningCode: 'comment_incomplete'
    })
  });

  assert.equal(detail.title, '标题');
  assert.equal(detail.comments.length, 1);
  assert.equal(detail.commentWarningCode, 'comment_incomplete');
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
    scrollMore: async () => true,
    waitForStateChange: async () => waitResults.shift() || { changed: false, state: { commentCount: 16, buttonCount: 0 } },
    expandReplies: false,
    throttleMs: 0,
    throttleJitterMs: 0
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
    waitForStateChange: async () => waitResults.shift() || { changed: false, state: { commentCount: 30, buttonCount: 0, totalCount: 30, reachedEnd: true, lastCommentId: 'c30' } },
    expandReplies: false,
    throttleMs: 0,
    throttleJitterMs: 0
  });

  assert.equal(scrolls.length, 2);
});

test('expandAllComments honors env max rounds when maxRounds is not provided', async () => {
  const previous = process.env.XHS_COMMENT_MAX_ROUNDS;
  process.env.XHS_COMMENT_MAX_ROUNDS = '2';

  const clicks = [];
  await expandAllComments(null, undefined, {
    readState: async () => ({ commentCount: 1, buttonCount: 1 }),
    clickNext: async () => {
      clicks.push('clicked');
      return true;
    },
    scrollMore: async () => true,
    waitForStateChange: async () => ({
      changed: true,
      state: { commentCount: 1, buttonCount: 1 }
    }),
    expandReplies: false,
    throttleMs: 0,
    throttleJitterMs: 0
  });

  if (typeof previous === 'undefined') {
    delete process.env.XHS_COMMENT_MAX_ROUNDS;
  } else {
    process.env.XHS_COMMENT_MAX_ROUNDS = previous;
  }

  assert.equal(clicks.length, 2);
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

test('waitForNoteDetailReady treats state note data as ready even without title', async () => {
  const states = [
    { url: 'about:blank', title: '' },
    { url: 'https://www.xiaohongshu.com/explore/abc123', title: '', hasStateNote: false },
    { url: 'https://www.xiaohongshu.com/explore/abc123', title: '', hasStateNote: true }
  ];
  const waits = [];

  const result = await waitForNoteDetailReady({
    readState: async () => states.shift(),
    wait: async (ms) => { waits.push(ms); },
    attempts: 3,
    intervalMs: 200
  });

  assert.deepEqual(result, {
    ready: true,
    state: { url: 'https://www.xiaohongshu.com/explore/abc123', title: '', hasStateNote: true }
  });
  assert.deepEqual(waits, [200, 200, 200]);
});

test('waitForNoteDetailReady aborts early when redirected to a 404 error page with message', async () => {
  const states = [
    { url: 'about:blank', title: '' },
    {
      url: 'https://www.xiaohongshu.com/404?error_code=300031&error_msg=%E5%BD%93%E5%89%8D%E7%AC%94%E8%AE%B0%E6%9A%82%E6%97%B6%E6%97%A0%E6%B3%95%E6%B5%8F%E8%A7%88',
      title: '',
      errorCode: 300031,
      errorMsg: '当前笔记暂时无法浏览',
      errorPath: '/404'
    },
    { url: 'https://www.xiaohongshu.com/explore/abc123', title: '标题' }
  ];
  const waits = [];

  const result = await waitForNoteDetailReady({
    readState: async () => states.shift(),
    wait: async (ms) => { waits.push(ms); },
    attempts: 10,
    intervalMs: 200
  });

  assert.deepEqual(result, {
    ready: false,
    state: {
      url: 'https://www.xiaohongshu.com/404?error_code=300031&error_msg=%E5%BD%93%E5%89%8D%E7%AC%94%E8%AE%B0%E6%9A%82%E6%97%B6%E6%97%A0%E6%B3%95%E6%B5%8F%E8%A7%88',
      title: '',
      errorCode: 300031,
      errorMsg: '当前笔记暂时无法浏览',
      errorPath: '/404'
    }
  });
  assert.deepEqual(waits, [200, 200]);
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

test('buildBrowserTargets prefers explicit browser url', () => {
  const targets = buildBrowserTargets({
    browserUrl: 'http://127.0.0.1:9333'
  });

  assert.deepEqual(targets, ['http://127.0.0.1:9333/json']);
});

test('buildBrowserTargets reads DevToolsActivePort for current-browser mode and keeps fallback ports', () => {
  const userDataDir = path.join('C:', 'Users', 'tester', 'AppData', 'Local', 'Google', 'Chrome', 'User Data');
  const activePortPath = path.join(userDataDir, 'DevToolsActivePort');
  const targets = buildBrowserTargets(
    {
      browserMode: 'current-browser',
      browserChannel: 'stable'
    },
    {
      env: {
        LOCALAPPDATA: path.join('C:', 'Users', 'tester', 'AppData', 'Local')
      },
      existsSync: (filepath) => filepath === activePortPath,
      readFileSync: () => '9444\n/devtools/browser/abc123',
      fallbackPorts: [9222, 9229]
    }
  );

  assert.deepEqual(targets, [
    'http://127.0.0.1:9444/json',
    'http://127.0.0.1:9222/json',
    'http://127.0.0.1:9229/json'
  ]);
});

test('getTabWsUrl tries multiple browser targets until it finds a xiaohongshu tab', async () => {
  const calls = [];
  const wsUrl = await getTabWsUrl({
    browserMode: 'current-browser',
    requireXiaohongshu: true,
    resolveTargets: () => [
      'http://127.0.0.1:9333/json',
      'http://127.0.0.1:9444/json'
    ],
    fetchTabs: async (target) => {
      calls.push(target);
      if (target.includes('9333')) {
        return [
          {
            type: 'page',
            title: 'about:blank',
            url: 'about:blank',
            webSocketDebuggerUrl: 'ws://127.0.0.1:9333/devtools/page/1'
          }
        ];
      }
      return [
        {
          type: 'page',
          title: 'xhs note',
          url: 'https://www.xiaohongshu.com/explore/abc123',
          webSocketDebuggerUrl: 'ws://127.0.0.1:9444/devtools/page/2'
        }
      ];
    }
  });

  assert.deepEqual(calls, [
    'http://127.0.0.1:9333/json',
    'http://127.0.0.1:9444/json'
  ]);
  assert.equal(wsUrl, 'ws://127.0.0.1:9444/devtools/page/2');
});

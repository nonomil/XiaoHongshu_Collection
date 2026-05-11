const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  ensureCommentsReady,
  expandAllComments,
  buildCommentApiFailureMessage,
  buildCommentCompletionWarning,
  collectPreparedNoteComments,
  collectNoteCommentDiagnostics,
  createCommentAccumulator,
  isCommentLoadMoreText,
  isReplyExpandText,
  sweepVirtualizedComments,
  resolveCommentError,
  readCommentExpansionStateWithRetry,
  shouldSkipCommentSweep,
  clickNextReplyExpander,
  expandAllReplies
} = require('../../lib/cdp_note');

test('expandAllComments retries when no change but totalCount not reached', async () => {
  let scrollCalls = 0;
  const state = {
    hasCommentsRoot: true,
    commentCount: 1,
    buttonCount: 0,
    totalCount: 10,
    reachedEnd: false,
    lastCommentId: 'c1',
    isLoading: false
  };

  await expandAllComments(null, 5, {
    readState: async () => state,
    scrollMore: async () => {
      scrollCalls += 1;
      return true;
    },
    clickNext: async () => {
      throw new Error('clickNext should not be called');
    },
    waitForStateChange: async () => ({ changed: false, state }),
    maxNoChangeRounds: 2,
    expandReplies: false,
    throttleMs: 0,
    throttleJitterMs: 0
  });

  assert.equal(scrollCalls, 2);
});

test('buildCommentCompletionWarning returns message when counts differ', () => {
  const message = buildCommentCompletionWarning({ totalCount: 10, actualCount: 3 });
  assert.match(message, /10/);
  assert.match(message, /3/);
});

test('buildCommentCompletionWarning mentions login gate when all comments require login', () => {
  const message = buildCommentCompletionWarning({
    totalCount: 86,
    actualCount: 19,
    requiresLogin: true
  });
  assert.match(message, /86/);
  assert.match(message, /19/);
  assert.match(message, /登录/);
});

test('buildCommentCompletionWarning returns empty when counts match', () => {
  const message = buildCommentCompletionWarning({ totalCount: 5, actualCount: 5 });
  assert.equal(message, '');
});

test('buildCommentApiFailureMessage maps account abnormal errors to hints', () => {
  const message = buildCommentApiFailureMessage({
    code: 300011,
    message: '当前账号存在异常，请切换账号后重试'
  });
  assert.match(message, /账号/);
  assert.match(message, /切换/);
});

test('buildCommentApiFailureMessage maps login required errors to hints', () => {
  const message = buildCommentApiFailureMessage({
    code: -101,
    message: '无登录信息，或登录信息为空'
  });
  assert.match(message, /登录/);
});

test('buildCommentApiFailureMessage ignores successful probe payloads', () => {
  const message = buildCommentApiFailureMessage({
    status: 200,
    code: 0,
    message: '成功',
    success: true
  });
  assert.equal(message, '');
});

test('isCommentLoadMoreText ignores reply expanders but keeps top-level load-more copy', () => {
  assert.equal(isCommentLoadMoreText('展开 5 条回复'), false);
  assert.equal(isCommentLoadMoreText('查看更多评论'), true);
  assert.equal(isCommentLoadMoreText('展开更多评论'), true);
  assert.equal(isCommentLoadMoreText('查看全部评论'), true);
});

test('isReplyExpandText recognizes reply expansion copy', () => {
  assert.equal(isReplyExpandText('展开 5 条回复'), true);
  assert.equal(isReplyExpandText('查看 2 条回复'), true);
  assert.equal(isReplyExpandText('查看全部回复'), true);
  assert.equal(isReplyExpandText('查看更多评论'), false);
});

test('resolveCommentError appends api hint when comments are incomplete', async () => {
  let warned = '';
  const message = await resolveCommentError({
    comments: [{ commentId: 'c1' }, { commentId: 'c2' }],
    state: { totalCount: 10 },
    probeApi: async () => ({ code: 300011, message: '当前账号存在异常，请切换账号后重试' }),
    onWarning: (text) => { warned = text; }
  });

  assert.match(message, /10/);
  assert.match(message, /账号/);
  assert.equal(warned, message);
});

test('resolveCommentError explains when DOM sweep finishes but comment api paging is blocked', async () => {
  const message = await resolveCommentError({
    comments: Array.from({ length: 34 }, (_, index) => ({ commentId: `c${index + 1}` })),
    state: { totalCount: 58, requiresLogin: false },
    probeApi: async () => ({
      status: 200,
      code: 300011,
      success: false,
      message: '当前账号存在异常，请切换账号后重试',
      cursor: 'cursor-1',
      hasMore: true
    })
  });

  assert.match(message, /58/);
  assert.match(message, /34/);
  assert.match(message, /300011/);
  assert.match(message, /拦截|补齐/);
});

test('resolveCommentError prefers login-gate hint when page asks to log in for all comments', async () => {
  let warned = '';
  const message = await resolveCommentError({
    comments: Array.from({ length: 19 }, (_, index) => ({ commentId: `c${index + 1}` })),
    state: { totalCount: 86, requiresLogin: true },
    onWarning: (text) => { warned = text; }
  });

  assert.match(message, /登录/);
  assert.match(message, /86/);
  assert.equal(warned, message);
});

test('collectNoteCommentDiagnostics classifies login-gated comment state', async () => {
  const result = await collectNoteCommentDiagnostics(null, {
    extractComments: async () => Array.from({ length: 19 }, (_, index) => ({
      commentId: `c${index + 1}`
    })),
    readExpansionStateWithRetry: async () => ({
      totalCount: 86,
      requiresLogin: true
    }),
    retryAsyncFn: async (fn) => fn(),
    probeApi: false
  });

  assert.equal(result.commentTotal, 86);
  assert.equal(result.comments.length, 19);
  assert.equal(result.commentWarningCode, 'comment_login_required');
  assert.match(result.commentError, /登录/);
});

test('collectNoteCommentDiagnostics merges extra comments from api paging when probe succeeds', async () => {
  const result = await collectNoteCommentDiagnostics(null, {
    extractComments: async () => [
      { commentId: 'c1', author: 'a', content: '1' },
      { commentId: 'c2', author: 'b', content: '2' }
    ],
    readExpansionStateWithRetry: async () => ({
      totalCount: 3,
      requiresLogin: false,
      replyButtonCount: 0
    }),
    retryAsyncFn: async (fn) => fn(),
    probeApi: async () => ({
      status: 200,
      code: 0,
      success: true,
      message: '成功',
      cursor: 'cursor-2',
      hasMore: false,
      list: [
        {
          id: 'c3',
          content: '3',
          createTime: 1772593639000,
          likeCount: '0',
          subCommentCount: '0',
          showTags: [],
          userInfo: {
            nickname: 'c',
            userId: 'u3'
          },
          subComments: []
        }
      ]
    })
  });

  assert.equal(result.comments.length, 3);
  assert.equal(result.commentError, '');
  assert.equal(result.commentWarningCode, '');
  assert.equal(result.commentDiagnostics.api_paging_attempted, true);
  assert.equal(result.commentDiagnostics.api_paging_added, 1);
  assert.equal(result.commentDiagnostics.api_paging_blocked, false);
});

test('collectNoteCommentDiagnostics records structured diagnostics when api paging is blocked after partial DOM load', async () => {
  const result = await collectNoteCommentDiagnostics(null, {
    extractComments: async () => Array.from({ length: 34 }, (_, index) => ({
      commentId: `c${index + 1}`,
      author: `author-${index + 1}`,
      content: `content-${index + 1}`
    })),
    readExpansionStateWithRetry: async () => ({
      totalCount: 58,
      requiresLogin: false,
      replyButtonCount: 0
    }),
    retryAsyncFn: async (fn) => fn(),
    probeApi: async () => ({
      status: 200,
      code: 300011,
      success: false,
      message: '当前账号存在异常，请切换账号后重试',
      cursor: 'cursor-1',
      hasMore: true
    })
  });

  assert.equal(result.comments.length, 34);
  assert.equal(result.commentDiagnostics.dom_comments_collected, 34);
  assert.equal(result.commentDiagnostics.dom_total_count, 58);
  assert.equal(result.commentDiagnostics.reply_expand_completed, true);
  assert.equal(result.commentDiagnostics.api_probe_code, 300011);
  assert.equal(result.commentDiagnostics.api_probe_has_more, true);
  assert.equal(result.commentDiagnostics.api_paging_attempted, true);
  assert.equal(result.commentDiagnostics.api_paging_blocked, true);
  assert.equal(result.commentDiagnostics.api_paging_blocked_code, 300011);
  assert.match(result.commentError, /300011/);
});

test('readCommentExpansionStateWithRetry waits for non-empty state', async () => {
  let calls = 0;
  const states = [
    {},
    { totalCount: 10, commentCount: 3 }
  ];
  const result = await readCommentExpansionStateWithRetry({
    readState: async () => states[Math.min(calls++, states.length - 1)],
    wait: async () => {},
    attempts: 3,
    intervalMs: 1
  });

  assert.equal(result.totalCount, 10);
  assert.equal(calls, 2);
});

test('ensureCommentsReady keeps waiting when comment container is still loading but not scrollable yet', async () => {
  const states = [
    {
      hasCommentsRoot: true,
      commentCount: 0,
      buttonCount: 0,
      totalCount: 0,
      reachedEnd: false,
      lastCommentId: '',
      isLoading: true
    },
    {
      hasCommentsRoot: true,
      commentCount: 12,
      buttonCount: 2,
      totalCount: 40,
      reachedEnd: false,
      lastCommentId: 'c12',
      isLoading: false
    }
  ];
  let readCalls = 0;
  let waitCalls = 0;
  let scrollCalls = 0;

  const result = await ensureCommentsReady(null, 2, {
    readState: async () => states[Math.min(readCalls++, states.length - 1)],
    scrollMore: async () => {
      scrollCalls += 1;
      return false;
    },
    waitForStateChange: async ({ readState }) => {
      waitCalls += 1;
      return { changed: true, state: await readState() };
    },
    wait: async () => {},
    throttleMs: 0,
    throttleJitterMs: 0
  });

  assert.equal(scrollCalls, 1);
  assert.equal(waitCalls, 1);
  assert.equal(result.commentCount, 12);
  assert.equal(result.totalCount, 40);
  assert.equal(result.isLoading, false);
});

test('clickNextReplyExpander returns true when evaluate says clicked', async () => {
  const result = await clickNextReplyExpander(null, {
    evaluate: async () => ({ clicked: true })
  });
  assert.equal(result, true);
});

test('expandAllReplies stops when no reply expander', async () => {
  let clickCalls = 0;
  await expandAllReplies(null, 3, {
    readState: async () => ({ commentCount: 1 }),
    clickNext: async () => {
      clickCalls += 1;
      return false;
    },
    waitForStateChange: async () => ({ changed: false, state: { commentCount: 1 } }),
    throttleMs: 0,
    throttleJitterMs: 0
  });
  assert.equal(clickCalls, 1);
});

test('createCommentAccumulator merges snapshots across virtualized DOM', () => {
  const accumulator = createCommentAccumulator();
  accumulator.addSnapshot([
    { commentId: 'c1', author: 'a', content: '1' },
    { commentId: 'c2', author: 'b', content: '2' },
    { commentId: 'c3', author: 'c', content: '3' }
  ]);
  accumulator.addSnapshot([
    { commentId: 'c4', author: 'd', content: '4' },
    { commentId: 'c5', author: 'e', content: '5' }
  ]);

  assert.equal(accumulator.size, 5);
  const ids = new Set(accumulator.toArray().map((item) => item.commentId));
  assert.equal(ids.has('c1'), true);
  assert.equal(ids.has('c2'), true);
  assert.equal(ids.has('c3'), true);
  assert.equal(ids.has('c4'), true);
  assert.equal(ids.has('c5'), true);
});

test('createCommentAccumulator dedupes comments with generated ids', () => {
  const accumulator = createCommentAccumulator();
  accumulator.addSnapshot([
    { commentId: 'comment_1', author: 'u', content: 'hello', date: 'd' }
  ]);
  accumulator.addSnapshot([
    { commentId: 'comment_2', author: 'u', content: 'hello', date: 'd' }
  ]);

  assert.equal(accumulator.size, 1);
});

test('createCommentAccumulator promotes fallback key entry to stable id', () => {
  const accumulator = createCommentAccumulator();
  accumulator.addSnapshot([
    { commentId: 'comment_1', author: 'u', content: 'hello', date: 'd' }
  ]);
  accumulator.addSnapshot([
    { commentId: 'c123', author: 'u', content: 'hello', date: 'd', likeCount: 3 }
  ]);

  assert.equal(accumulator.size, 1);
  const value = accumulator.toArray()[0];
  assert.equal(value.commentId, 'c123');
  assert.equal(value.likeCount, 3);
});

test('createCommentAccumulator keeps non-text comment with placeholder content', () => {
  const accumulator = createCommentAccumulator();
  accumulator.addSnapshot([
    { commentId: 'comment_1', author: 'u', content: '', hasNonTextContent: true }
  ]);

  assert.equal(accumulator.size, 1);
  const value = accumulator.toArray()[0];
  assert.equal(value.content, '[非文本内容]');
});

test('expandAllComments respects shouldLoadMore option', async () => {
  let scrollCalls = 0;
  let clickCalls = 0;
  const state = {
    hasCommentsRoot: true,
    commentCount: 1,
    buttonCount: 0,
    totalCount: 10,
    reachedEnd: false,
    lastCommentId: 'c1',
    isLoading: false
  };

  await expandAllComments(null, 5, {
    readState: async () => state,
    scrollMore: async () => {
      scrollCalls += 1;
      return true;
    },
    clickNext: async () => {
      clickCalls += 1;
      return true;
    },
    waitForStateChange: async () => ({ changed: true, state }),
    shouldLoadMore: () => false,
    expandReplies: false,
    throttleMs: 0,
    throttleJitterMs: 0
  });

  assert.equal(scrollCalls, 0);
  assert.equal(clickCalls, 0);
});

test('expandAllComments keeps trying when comments are gated behind login but still incomplete', async () => {
  let scrollCalls = 0;
  let clickCalls = 0;
  const state = {
    hasCommentsRoot: true,
    commentCount: 19,
    buttonCount: 9,
    totalCount: 86,
    reachedEnd: false,
    lastCommentId: 'c19',
    isLoading: false,
    requiresLogin: true
  };

  await expandAllComments(null, 5, {
    readState: async () => state,
    scrollMore: async () => {
      scrollCalls += 1;
      return true;
    },
    clickNext: async () => {
      clickCalls += 1;
      return true;
    },
    waitForStateChange: async () => ({ changed: false, state }),
    expandReplies: false,
    throttleMs: 0,
    throttleJitterMs: 0
  });

  assert.equal(scrollCalls > 0, true);
  assert.equal(clickCalls > 0, true);
});

test('expandAllComments nudges the comment list after clicking load more', async () => {
  let scrollCalls = 0;
  let clickCalls = 0;
  const state = {
    hasCommentsRoot: true,
    commentCount: 25,
    buttonCount: 1,
    totalCount: 32,
    reachedEnd: false,
    lastCommentId: 'c25',
    isLoading: false,
    requiresLogin: true
  };

  await expandAllComments(null, 1, {
    readState: async () => state,
    scrollMore: async () => {
      scrollCalls += 1;
      return true;
    },
    clickNext: async () => {
      clickCalls += 1;
      return true;
    },
    waitForStateChange: async () => ({ changed: false, state }),
    maxNoChangeRounds: 1,
    expandReplies: false,
    throttleMs: 0,
    throttleJitterMs: 0
  });

  assert.equal(clickCalls, 1);
  assert.equal(scrollCalls, 1);
});

test('shouldSkipCommentSweep only skips fully blocked login-gated states', () => {
  assert.equal(shouldSkipCommentSweep({ requiresLogin: true, totalCount: 86, commentCount: 0 }), true);
  assert.equal(shouldSkipCommentSweep({ requiresLogin: true, totalCount: 86, commentCount: 19 }), false);
  assert.equal(shouldSkipCommentSweep({ requiresLogin: false, totalCount: 86, commentCount: 19 }), false);
});

test('collectPreparedNoteComments still sweeps virtualized comments when login gate appears after partial load', async () => {
  const accumulator = createCommentAccumulator();
  const windows = [
    [
      { commentId: 'c1', author: 'a', content: '1' },
      { commentId: 'c2', author: 'b', content: '2' }
    ],
    [
      { commentId: 'c3', author: 'c', content: '3' },
      { commentId: 'c4', author: 'd', content: '4' }
    ],
    [
      { commentId: 'c5', author: 'e', content: '5' }
    ]
  ];
  let index = 0;
  const messageHandlers = new Set();
  const ws = {
    on(event, handler) {
      if (event === 'message') {
        messageHandlers.add(handler);
      }
    },
    removeListener(event, handler) {
      if (event === 'message') {
        messageHandlers.delete(handler);
      }
    },
    send(payload) {
      const data = JSON.parse(payload);
      const response = JSON.stringify({
        id: data.id,
        result: {
          value: JSON.stringify({ clicked: false })
        }
      });
      for (const handler of Array.from(messageHandlers)) {
        handler(response);
      }
    }
  };

  const result = await collectPreparedNoteComments(ws, {
    accumulator,
    addSnapshot: async () => {},
    readSnapshot: async () => windows[index],
    waitForStateChange: async () => ({ changed: false, state: {} }),
    wait: async () => {},
    postExpandState: {
      hasCommentsRoot: true,
      commentCount: 2,
      totalCount: 58,
      buttonCount: 0,
      reachedEnd: false,
      lastCommentId: 'c2',
      isLoading: false,
      requiresLogin: true
    }
  }, {
    maxSteps: 10,
    settleMs: 0,
    scrollToTop: async () => { index = 0; },
    advance: async () => {
      index += 1;
      return index < windows.length;
    }
  });

  assert.equal(result.comments.length, 5);
});

test('sweepVirtualizedComments iterates snapshots across scroll windows', async () => {
  const accumulator = createCommentAccumulator();
  const windows = [
    [
      { commentId: 'c1', author: 'a', content: '1' },
      { commentId: 'c2', author: 'b', content: '2' }
    ],
    [
      { commentId: 'c3', author: 'c', content: '3' },
      { commentId: 'c4', author: 'd', content: '4' }
    ],
    [
      { commentId: 'c5', author: 'e', content: '5' }
    ]
  ];
  let index = 0;
  let expandCalls = 0;
  let advanceCalls = 0;

  await sweepVirtualizedComments(null, {
    maxSteps: 10,
    settleMs: 0,
    scrollToTop: async () => { index = 0; },
    readSnapshot: async () => windows[index],
    onSnapshot: (list) => accumulator.addSnapshot(list),
    expandReplies: async () => { expandCalls += 1; },
    advance: async () => {
      advanceCalls += 1;
      index += 1;
      return index < windows.length;
    }
  });

  assert.equal(accumulator.size, 5);
  assert.equal(expandCalls >= 1, true);
  assert.equal(advanceCalls >= 1, true);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  ensureCommentsReady,
  expandAllComments,
  buildCommentApiFailureMessage,
  buildCommentCompletionWarning,
  createCommentAccumulator,
  isCommentLoadMoreText,
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

test('isCommentLoadMoreText ignores reply expanders but keeps top-level load-more copy', () => {
  assert.equal(isCommentLoadMoreText('展开 5 条回复'), false);
  assert.equal(isCommentLoadMoreText('查看更多评论'), true);
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

test('expandAllComments stops early when comments are gated behind login', async () => {
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

  assert.equal(scrollCalls, 0);
  assert.equal(clickCalls, 0);
});

test('shouldSkipCommentSweep returns true for login-gated comment states', () => {
  assert.equal(shouldSkipCommentSweep({ requiresLogin: true, totalCount: 86, commentCount: 19 }), true);
  assert.equal(shouldSkipCommentSweep({ requiresLogin: false, totalCount: 86, commentCount: 19 }), false);
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

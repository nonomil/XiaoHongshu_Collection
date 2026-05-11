const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('fs');
const { PassThrough } = require('node:stream');
const path = require('path');

const {
  buildChromeRecoveryMode,
  buildChromeLaunchArgs,
  buildChromeDebugHelp,
  fetchPageForMode,
  fetchNoteWithOrchestration,
  formatSaveNoteError,
  getNavigationUrl,
  locateTargetForMode,
  parseArgs,
  probeBrowserSessionForMode,
  runParsedInput,
  resolveRunModes,
  resolveRunMode,
  saveLinksText,
  saveMode,
  saveModesSequentially,
  resumeNoteSaveFromCheckpoint,
  shouldAutoLaunchChrome,
  validateFetchedPageResult
} = require('../../save_note');
const { createJsonCheckpointStore } = require('../../lib/browser_checkpoint_store');
const { buildTaskRunId } = require('../../lib/browser_orchestrator');
const { CodexTaskError } = require('../../lib/errors');

function createMemoryCheckpointStore() {
  const writes = new Map();
  return createJsonCheckpointStore({
    rootDir: 'G:/tmp/browser-task-checkpoints',
    mkdirSync: () => {},
    existsSync: (filepath) => writes.has(filepath),
    readFileSync: (filepath) => writes.get(filepath),
    writeFileSync: (filepath, payload) => {
      writes.set(filepath, payload);
    }
  });
}

test('parseArgs returns current mode for --current', () => {
  assert.deepEqual(parseArgs(['--current']), { mode: 'current' });
});

test('parseArgs returns input mode for url or share text', () => {
  assert.deepEqual(parseArgs(['https://www.xiaohongshu.com/explore/abc123']), {
    mode: 'input',
    input: 'https://www.xiaohongshu.com/explore/abc123'
  });
});

test('parseArgs extracts browser flags alongside note input', () => {
  assert.deepEqual(
    parseArgs([
      '--browser-mode', 'current-browser',
      '--browser-channel', 'beta',
      '--browser-url', 'http://127.0.0.1:9333',
      'https://www.xiaohongshu.com/explore/abc123'
    ]),
    {
      mode: 'input',
      input: 'https://www.xiaohongshu.com/explore/abc123',
      browser: {
        mode: 'current-browser',
        channel: 'beta',
        browserUrl: 'http://127.0.0.1:9333'
      }
    }
  );
});

test('parseArgs accepts browser headless flag for project session reuse', () => {
  assert.deepEqual(
    parseArgs([
      '--browser-headless',
      'https://www.xiaohongshu.com/explore/abc123'
    ]),
    {
      mode: 'input',
      input: 'https://www.xiaohongshu.com/explore/abc123',
      browser: {
        headless: true
      }
    }
  );
});

test('parseArgs rejects empty input', () => {
  assert.throws(() => parseArgs([]), /Usage/);
});

test('resolveRunMode returns current mode unchanged', async () => {
  const result = await resolveRunMode({ mode: 'current' });
  assert.deepEqual(result, { mode: 'current' });
});

test('probeBrowserSessionForMode attaches to browser and returns observation', async () => {
  let closed = false;
  const observation = await probeBrowserSessionForMode(
    {
      mode: 'url',
      navigationUrl: 'https://www.xiaohongshu.com/explore/abc123',
      browser: {
        mode: 'current-browser',
        browserUrl: 'http://127.0.0.1:9333'
      }
    },
    {
      connectToChromeFn: async (options = {}) => {
        assert.equal(options.browserMode, 'current-browser');
        assert.equal(options.browserUrl, 'http://127.0.0.1:9333');
        return {
          close: () => { closed = true; }
        };
      }
    }
  );

  assert.equal(closed, true);
  assert.equal(observation.browser_mode, 'current-browser');
  assert.equal(observation.used_browser_url, true);
});

test('locateTargetForMode validates current tab detail page in current mode', async () => {
  let closed = false;
  const observation = await locateTargetForMode(
    { mode: 'current' },
    {
      connectToChromeFn: async () => ({
        close: () => { closed = true; }
      }),
      getCurrentPageUrlFn: async () => 'https://www.xiaohongshu.com/explore/abc123'
    }
  );

  assert.equal(closed, true);
  assert.equal(observation.source_type, 'xiaohongshu');
  assert.equal(observation.target_strategy, 'current_tab');
});

test('fetchPageForMode rejects when Xiaohongshu navigation does not land on a note detail page', async () => {
  let extractCalled = false;

  await assert.rejects(
    () => fetchPageForMode(
      {
        mode: 'url',
        noteId: 'abc123',
        sourceType: 'url',
        extractedUrl: 'https://www.xiaohongshu.com/explore/abc123',
        canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/abc123',
        navigationUrl: 'https://www.xiaohongshu.com/explore/abc123'
      },
      {
        connectToChromeFn: async () => ({
          on: () => {},
          removeListener: () => {},
          close: () => {}
        }),
        navigateToUrlFn: async () => {},
        getCurrentPageUrlFn: async () => 'https://www.xiaohongshu.com/explore',
        extractNoteDetailFn: async () => {
          extractCalled = true;
          return {
            title: '错误页面',
            content: '不应该继续提取'
          };
        }
      }
    ),
    /无法打开笔记详情页|未落在小红书笔记详情页|当前页面/
  );

  assert.equal(extractCalled, false);
});

test('validateFetchedPageResult rejects empty XiaoHongshu notes', () => {
  assert.throws(
    () => validateFetchedPageResult(
      {
        noteId: 'abc123',
        title: '',
        content: ''
      },
      {
        mode: 'url',
        noteId: 'abc123',
        navigationUrl: 'https://www.xiaohongshu.com/explore/abc123',
        sourceType: 'url'
      }
    ),
    /missing title and content/i
  );
});

test('runParsedInput carries browser settings into save execution modes', async () => {
  let capturedMode;
  const result = await runParsedInput(
    {
      mode: 'input',
      input: 'https://www.xiaohongshu.com/explore/abc123',
      browser: {
        mode: 'current-browser',
        channel: 'stable'
      }
    },
    {
      saveMode: async (mode) => {
        capturedMode = mode;
        return { result: { filepath: 'G:/output/abc123.md' } };
      },
      noteDelayMs: 0,
      noteDelayJitterMs: 0,
      sleep: async () => {}
    }
  );

  assert.equal(result.summary.successCount, 1);
  assert.equal(capturedMode.browser.mode, 'current-browser');
  assert.equal(capturedMode.browser.channel, 'stable');
});

test('fetchNoteWithOrchestration launches recovery browser once before loading note', async () => {
  let connectCalls = 0;
  let launchCalls = 0;
  const note = await fetchNoteWithOrchestration(
    {
      mode: 'url',
      noteId: 'abc123',
      sourceType: 'url',
      extractedUrl: 'https://www.xiaohongshu.com/explore/abc123',
      canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/abc123',
      navigationUrl: 'https://www.xiaohongshu.com/explore/abc123'
    },
    {
      orchestration: {
        checkpointStore: createMemoryCheckpointStore()
      },
      connectToChromeFn: async () => {
        connectCalls += 1;
        if (connectCalls === 1) {
          throw new Error('connect ECONNREFUSED 127.0.0.1:9222');
        }
        return {
          close: () => {}
        };
      },
      launchChromeForModeFn: async () => {
        launchCalls += 1;
      },
      fetchPageForModeFn: async () => ({
        noteId: 'abc123',
        title: '测试笔记',
        content: '正文',
        comments: [],
        commentTotal: 0
      })
    }
  );

  assert.equal(launchCalls, 1);
  assert.equal(note.noteId, 'abc123');
  assert.equal(note.browser_orchestration.status, 'done');
  assert.match(note.browser_orchestration.checkpoint_path, /note-save-cli-/);
});

test('fetchNoteWithOrchestration switches to isolated browser when current browser has no Xiaohongshu tab', async () => {
  let connectCalls = 0;
  let launchedRecoveryMode = null;

  const note = await fetchNoteWithOrchestration(
    {
      mode: 'url',
      noteId: 'abc123',
      sourceType: 'share_text',
      extractedUrl: 'https://www.xiaohongshu.com/discovery/item/abc123',
      canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/abc123',
      navigationUrl: 'http://xhslink.com/o/demo',
      browser: {
        mode: 'current-browser',
        channel: 'stable'
      }
    },
    {
      orchestration: {
        checkpointStore: createMemoryCheckpointStore()
      },
      connectToChromeFn: async (options = {}) => {
        connectCalls += 1;
        if (connectCalls === 1) {
          assert.equal(options.browserMode, 'current-browser');
          throw new Error('No xiaohongshu tab found');
        }
        assert.equal(options.browserMode, 'isolated');
        return {
          close: () => {}
        };
      },
      launchChromeForModeFn: async (recoveryMode) => {
        launchedRecoveryMode = recoveryMode;
      },
      fetchPageForModeFn: async (activeMode) => {
        assert.equal(activeMode.browser.mode, 'isolated');
        return {
          noteId: 'abc123',
          title: '测试笔记',
          content: '正文',
          comments: [],
          commentTotal: 0
        };
      }
    }
  );

  assert.equal(connectCalls, 2);
  assert.equal(launchedRecoveryMode.browser.mode, 'isolated');
  assert.equal(note.noteId, 'abc123');
  assert.equal(note.browser_orchestration.status, 'done');
});

test('split Xiaohongshu orchestration switches to isolated browser when current browser has no Xiaohongshu tab', async () => {
  let connectCalls = 0;
  let launchedRecoveryMode = null;

  const note = await fetchNoteWithOrchestration(
    {
      mode: 'url',
      noteId: 'abc123',
      sourceType: 'share_text',
      extractedUrl: 'https://www.xiaohongshu.com/explore/abc123',
      canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/abc123',
      navigationUrl: 'http://xhslink.com/o/demo',
      browser: {
        mode: 'current-browser',
        channel: 'stable'
      }
    },
    {
      orchestration: {
        checkpointStore: createMemoryCheckpointStore()
      },
      connectToChromeFn: async (options = {}) => {
        connectCalls += 1;
        if (connectCalls === 1) {
          assert.equal(options.browserMode, 'current-browser');
          throw new Error('No xiaohongshu tab found');
        }
        assert.equal(options.browserMode, 'isolated');
        return {
          on: () => {},
          removeListener: () => {},
          close: () => {}
        };
      },
      launchChromeForModeFn: async (recoveryMode) => {
        launchedRecoveryMode = recoveryMode;
      },
      navigateToUrlFn: async () => {},
      getCurrentPageUrlFn: async () => 'https://www.xiaohongshu.com/discovery/item/abc123',
      extractNoteCoreDetailFn: async () => ({
        url: 'https://www.xiaohongshu.com/discovery/item/abc123',
        title: '测试笔记',
        content: '正文',
        author: '作者',
        date: '2026-04-11',
        tags: [],
        images: []
      }),
      prepareNoteCommentCollectionFn: async () => ({
        readyState: {
          commentCount: 0,
          totalCount: 0,
          buttonCount: 0,
          requiresLogin: false,
          reachedEnd: true,
          lastCommentId: ''
        }
      }),
      expandPreparedNoteCommentsFn: async (_ws, context) => ({
        ...context,
        postExpandState: {
          commentCount: 0,
          totalCount: 0,
          buttonCount: 0,
          requiresLogin: false,
          reachedEnd: true,
          lastCommentId: ''
        }
      }),
      collectPreparedNoteCommentsFn: async (_ws, context) => ({
        comments: [],
        state: context.postExpandState,
        context
      }),
      collectNoteCommentDiagnosticsFn: async () => ({
        comments: [],
        commentTotal: 0,
        commentError: '',
        commentWarningCode: ''
      })
    }
  );

  assert.equal(connectCalls, 2);
  assert.equal(launchedRecoveryMode.browser.mode, 'isolated');
  assert.equal(note.noteId, 'abc123');
  assert.equal(note.browser_orchestration.status, 'done');
});

test('fetchNoteWithOrchestration stops at locate_target when navigation lands on another note', async () => {
  let extractCoreCalls = 0;

  await assert.rejects(
    () => fetchNoteWithOrchestration(
      {
        mode: 'url',
        noteId: 'abc123',
        sourceType: 'url',
        extractedUrl: 'https://www.xiaohongshu.com/explore/abc123',
        canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/abc123',
        navigationUrl: 'https://www.xiaohongshu.com/explore/abc123'
      },
      {
        orchestration: {
          checkpointStore: createMemoryCheckpointStore()
        },
        connectToChromeFn: async () => ({
          on: () => {},
          removeListener: () => {},
          close: () => {}
        }),
        navigateToUrlFn: async () => {},
        getCurrentPageUrlFn: async () => 'https://www.xiaohongshu.com/discovery/item/def456',
        extractNoteCoreDetailFn: async () => {
          extractCoreCalls += 1;
          return {
            url: 'https://www.xiaohongshu.com/discovery/item/def456',
            title: '错误笔记',
            content: '不应该继续提取',
            author: '作者',
            date: '2026-04-07',
            tags: [],
            images: []
          };
        }
      }
    ),
    (error) => {
      assert.match(error.message, /无法打开笔记详情页|目标笔记详情页|落到了其他笔记/);
      assert.equal(error?.orchestration?.state, 'locate_target');
      return true;
    }
  );

  assert.equal(extractCoreCalls, 0);
});

test('fetchNoteWithOrchestration reattaches migrated xiaohongshu target tab during locate_target and records observation', async () => {
  const targetUrl = 'https://www.xiaohongshu.com/explore/abc123';
  const checkpointStore = createMemoryCheckpointStore();
  let initialClosed = false;
  let migratedClosed = false;
  let extractedWs = null;
  let resolvedCount = 0;
  const initialWs = {
    on: () => {},
    removeListener: () => {},
    close: () => { initialClosed = true; }
  };
  const migratedWs = {
    on: () => {},
    removeListener: () => {},
    close: () => { migratedClosed = true; }
  };

  const note = await fetchNoteWithOrchestration(
    {
      mode: 'url',
      noteId: 'abc123',
      sourceType: 'url',
      extractedUrl: targetUrl,
      canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/abc123',
      navigationUrl: targetUrl,
      browser: {
        mode: 'current-browser',
        browserUrl: 'http://127.0.0.1:9333'
      }
    },
    {
      orchestration: {
        checkpointStore
      },
      connectToChromeFn: async (options = {}) => {
        if (options.wsEndpoint) {
          assert.equal(options.wsEndpoint, 'ws://127.0.0.1:9333/devtools/page/target');
          return migratedWs;
        }
        return initialWs;
      },
      navigateToUrlFn: async () => {},
      getCurrentPageUrlFn: async (ws) => (
        ws === migratedWs
          ? 'https://www.xiaohongshu.com/discovery/item/abc123'
          : 'https://www.xiaohongshu.com/discovery/item/def456'
      ),
      resolveWsEndpointForUrlFn: async ({ pageUrl, sourceType, noteId }) => {
        resolvedCount += 1;
        assert.equal(pageUrl, targetUrl);
        assert.equal(sourceType, 'xiaohongshu');
        assert.equal(noteId, 'abc123');
        return 'ws://127.0.0.1:9333/devtools/page/target';
      },
      extractNoteCoreDetailFn: async (ws) => {
        extractedWs = ws;
        return {
          url: 'https://www.xiaohongshu.com/discovery/item/abc123',
          title: '目标笔记',
          content: '正文',
          author: '作者',
          date: '2026-04-07',
          tags: [],
          images: []
        };
      },
      prepareNoteCommentCollectionFn: async () => ({
        readyState: {
          commentCount: 0,
          totalCount: 0,
          buttonCount: 0,
          requiresLogin: false,
          reachedEnd: true,
          lastCommentId: ''
        }
      }),
      expandPreparedNoteCommentsFn: async (_ws, context) => ({
        ...context,
        postExpandState: {
          commentCount: 0,
          totalCount: 0,
          buttonCount: 0,
          requiresLogin: false,
          reachedEnd: true,
          lastCommentId: ''
        }
      }),
      collectPreparedNoteCommentsFn: async (_ws, context) => ({
        comments: [],
        state: context.postExpandState || {
          commentCount: 0,
          totalCount: 0,
          buttonCount: 0,
          requiresLogin: false,
          reachedEnd: true,
          lastCommentId: ''
        },
        context
      }),
      collectNoteCommentDiagnosticsFn: async () => ({
        comments: [],
        commentTotal: 0,
        commentError: '',
        commentWarningCode: ''
      })
    }
  );

  assert.equal(note.noteId, 'abc123');
  assert.equal(extractedWs, migratedWs);
  assert.equal(initialClosed, true);
  assert.equal(migratedClosed, true);
  assert.equal(resolvedCount, 1);

  const checkpoint = checkpointStore.loadCheckpoint(note.browser_orchestration.run_id);
  const locateObservation = checkpoint.observations.find((entry) =>
    entry.state === 'locate_target' &&
    entry.type === 'observation'
  );

  assert.equal(locateObservation?.data?.target_migrated, true);
  assert.equal(locateObservation?.data?.previous_url, 'https://www.xiaohongshu.com/discovery/item/def456');
  assert.equal(locateObservation?.data?.target_migration_url, 'https://www.xiaohongshu.com/discovery/item/abc123');
});

test('fetchNoteWithOrchestration retries once when comments are incomplete without manual action gate', async () => {
  let fetchAttempts = 0;
  const note = await fetchNoteWithOrchestration(
    {
      mode: 'url',
      noteId: 'abc123',
      sourceType: 'url',
      extractedUrl: 'https://www.xiaohongshu.com/explore/abc123',
      canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/abc123',
      navigationUrl: 'https://www.xiaohongshu.com/explore/abc123'
    },
    {
      orchestration: {
        checkpointStore: createMemoryCheckpointStore(),
        maxAttemptsPerState: 2
      },
      connectToChromeFn: async () => ({
        close: () => {}
      }),
      fetchPageForModeFn: async () => {
        fetchAttempts += 1;
        if (fetchAttempts === 1) {
          return {
            noteId: 'abc123',
            title: '测试笔记',
            content: '正文',
            comments: [{ commentId: 'c1', content: '一条评论' }],
            commentTotal: 12,
            commentWarningCode: 'comment_incomplete',
            commentError: '评论可能未完整加载：页面显示共 12 条，当前抓取 1 条。'
          };
        }
        return {
          noteId: 'abc123',
          title: '测试笔记',
          content: '正文',
          comments: Array.from({ length: 12 }, (_, index) => ({
            commentId: `c${index + 1}`,
            content: `评论${index + 1}`
          })),
          commentTotal: 12,
          commentWarningCode: '',
          commentError: ''
        };
      }
    }
  );

  assert.equal(fetchAttempts, 2);
  assert.equal(note.comments.length, 12);
  assert.equal(note.commentWarningCode, '');
});

test('fetchNoteWithOrchestration promotes login-gated comment warnings to manual action metadata', async () => {
  const note = await fetchNoteWithOrchestration(
    {
      mode: 'url',
      noteId: 'abc123',
      sourceType: 'url',
      extractedUrl: 'https://www.xiaohongshu.com/explore/abc123',
      canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/abc123',
      navigationUrl: 'https://www.xiaohongshu.com/explore/abc123'
    },
    {
      orchestration: {
        checkpointStore: createMemoryCheckpointStore(),
        maxAttemptsPerState: 2
      },
      connectToChromeFn: async () => ({
        close: () => {}
      }),
      fetchPageForModeFn: async () => ({
        noteId: 'abc123',
        title: '测试笔记',
        content: '正文',
        comments: [{ commentId: 'c1', content: '一条评论' }],
        commentTotal: 86,
        commentWarningCode: 'comment_login_required',
        commentError: '当前网页端提示“登录查看全部评论内容”，请先在当前 Chrome 会话中登录后重试。'
      })
    }
  );

  assert.equal(note.manual_action_required, true);
  assert.equal(note.manual_action_reason, 'login_required');
  assert.ok(Array.isArray(note.browser_orchestration.warnings));
  assert.ok(note.browser_orchestration.warnings.some((item) => item.code === 'comment_login_required'));
});

test('fetchNoteWithOrchestration retries comment collection without reloading note core', async () => {
  let coreCalls = 0;
  let commentCalls = 0;
  const note = await fetchNoteWithOrchestration(
    {
      mode: 'url',
      noteId: 'abc123',
      sourceType: 'url',
      extractedUrl: 'https://www.xiaohongshu.com/explore/abc123',
      canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/abc123',
      navigationUrl: 'https://www.xiaohongshu.com/explore/abc123'
    },
    {
      orchestration: {
        checkpointStore: createMemoryCheckpointStore(),
        maxAttemptsPerState: 2
      },
      connectToChromeFn: async () => ({
        on: () => {},
        removeListener: () => {},
        close: () => {}
      }),
      navigateToUrlFn: async () => {},
      getCurrentPageUrlFn: async () => 'https://www.xiaohongshu.com/discovery/item/abc123',
      extractNoteCoreDetailFn: async () => {
        coreCalls += 1;
        return {
          url: 'https://www.xiaohongshu.com/discovery/item/abc123',
          title: '测试笔记',
          content: '正文',
          author: '作者',
          date: '2026-04-06',
          tags: [],
          images: []
        };
      },
      prepareNoteCommentCollectionFn: async () => ({
        readyState: {
          commentCount: 0
        }
      }),
      expandPreparedNoteCommentsFn: async (_ws, context) => ({
        ...context,
        postExpandState: {
          commentCount: 0
        }
      }),
      collectPreparedNoteCommentsFn: async (_ws, context) => ({
        comments: [],
        state: context?.postExpandState || context?.readyState || {},
        context
      }),
      collectNoteCommentDiagnosticsFn: async () => {
        commentCalls += 1;
        if (commentCalls === 1) {
          return {
            comments: [{ commentId: 'c1', content: '评论1' }],
            commentTotal: 12,
            commentError: '评论可能未完整加载：页面显示共 12 条，当前抓取 1 条。',
            commentWarningCode: 'comment_incomplete'
          };
        }
        return {
          comments: Array.from({ length: 12 }, (_, index) => ({
            commentId: `c${index + 1}`,
            content: `评论${index + 1}`
          })),
          commentTotal: 12,
          commentError: '',
          commentWarningCode: ''
        };
      }
    }
  );

  assert.equal(coreCalls, 1);
  assert.equal(commentCalls, 2);
  assert.equal(note.comments.length, 12);
});

test('fetchNoteWithOrchestration persists split comment states and only retries collect_comments', async () => {
  const checkpointStore = createMemoryCheckpointStore();
  let prepareCalls = 0;
  let expandCalls = 0;
  let collectCalls = 0;
  let diagnosticsCalls = 0;

  const note = await fetchNoteWithOrchestration(
    {
      mode: 'url',
      noteId: 'abc123',
      sourceType: 'url',
      extractedUrl: 'https://www.xiaohongshu.com/explore/abc123',
      canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/abc123',
      navigationUrl: 'https://www.xiaohongshu.com/explore/abc123'
    },
    {
      orchestration: {
        checkpointStore,
        maxAttemptsPerState: 2
      },
      connectToChromeFn: async () => ({
        close: () => {}
      }),
      navigateToUrlFn: async () => {},
      getCurrentPageUrlFn: async () => 'https://www.xiaohongshu.com/discovery/item/abc123',
      extractNoteCoreDetailFn: async () => ({
        url: 'https://www.xiaohongshu.com/discovery/item/abc123',
        title: '测试笔记',
        content: '正文',
        author: '作者',
        date: '2026-04-06',
        tags: [],
        images: []
      }),
      prepareNoteCommentCollectionFn: async () => {
        prepareCalls += 1;
        return {
          readyState: {
            commentCount: 1,
            totalCount: 12,
            buttonCount: 4,
            requiresLogin: false,
            reachedEnd: false,
            lastCommentId: 'c1'
          }
        };
      },
      expandPreparedNoteCommentsFn: async (_ws, context) => {
        expandCalls += 1;
        return {
          ...context,
          postExpandState: {
            commentCount: 1,
            totalCount: 12,
            buttonCount: 0,
            requiresLogin: false,
            reachedEnd: false,
            lastCommentId: 'c1'
          }
        };
      },
      collectPreparedNoteCommentsFn: async (_ws, context) => {
        collectCalls += 1;
        const comments = collectCalls === 1
          ? [{ commentId: 'c1', content: '评论1' }]
          : Array.from({ length: 12 }, (_, index) => ({
            commentId: `c${index + 1}`,
            content: `评论${index + 1}`
          }));
        return {
          comments,
          state: {
            commentCount: comments.length,
            totalCount: 12,
            buttonCount: 0,
            requiresLogin: false,
            reachedEnd: comments.length >= 12,
            lastCommentId: comments.at(-1)?.commentId || 'c1'
          },
          context
        };
      },
      collectNoteCommentDiagnosticsFn: async (_ws, { extractComments, readExpansionStateWithRetry } = {}) => {
        diagnosticsCalls += 1;
        const comments = await extractComments();
        const state = await readExpansionStateWithRetry();
        const total = Number(state?.totalCount || comments.length);
        return {
          comments,
          commentTotal: total,
          commentError: comments.length < total
            ? `评论可能未完整加载：页面显示共 ${total} 条，当前抓取 ${comments.length} 条。`
            : '',
          commentWarningCode: comments.length < total ? 'comment_incomplete' : ''
        };
      }
    }
  );

  const checkpoint = checkpointStore.loadCheckpoint(note.browser_orchestration.run_id);
  assert.equal(prepareCalls, 1);
  assert.equal(expandCalls, 1);
  assert.equal(collectCalls, 2);
  assert.equal(diagnosticsCalls, 2);
  assert.equal(checkpoint.attempts.prepare_comments, 1);
  assert.equal(checkpoint.attempts.expand_comments, 1);
  assert.equal(checkpoint.attempts.collect_comments, 2);
  assert.ok(checkpoint.transitions.some((item) => item.to === 'prepare_comments'));
  assert.ok(checkpoint.transitions.some((item) => item.to === 'expand_comments'));
  assert.ok(checkpoint.transitions.some((item) => item.to === 'collect_comments'));
});

test('saveMode uses orchestrated fetch by default', async () => {
  let exportedNote;
  const saved = await saveMode(
    {
      mode: 'url',
      noteId: 'abc123',
      sourceType: 'url',
      extractedUrl: 'https://www.xiaohongshu.com/explore/abc123',
      canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/abc123',
      navigationUrl: 'https://www.xiaohongshu.com/explore/abc123'
    },
    {
      orchestration: {
        checkpointStore: createMemoryCheckpointStore()
      },
      connectToChromeFn: async () => ({
        close: () => {}
      }),
      fetchPageForModeFn: async () => ({
        noteId: 'abc123',
        title: '测试笔记',
        content: '正文',
        comments: [],
        commentTotal: 0
      }),
      exportNote: async ({ note }) => {
        exportedNote = note;
        return { filepath: 'G:/output/abc123.md' };
      }
    }
  );

  assert.equal(saved.result.filepath, 'G:/output/abc123.md');
  assert.equal(exportedNote.noteId, 'abc123');
  assert.equal(exportedNote.browser_orchestration.status, 'done');
});

test('saveMode resolves a mode-specific task when batch input passes a shared task', async () => {
  const batchTask = {
    type: 'note-save',
    source: 'ui',
    input: 'https://www.xiaohongshu.com/explore/abc123\nhttps://www.xiaohongshu.com/explore/def456',
    options: {},
    requestedAt: '2026-04-06T12:00:00.000Z'
  };
  const saved = await saveMode(
    {
      mode: 'url',
      noteId: 'abc123',
      sourceType: 'url',
      extractedUrl: 'https://www.xiaohongshu.com/explore/abc123',
      canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/abc123',
      navigationUrl: 'https://www.xiaohongshu.com/explore/abc123'
    },
    {
      task: batchTask,
      orchestration: {
        checkpointStore: createMemoryCheckpointStore()
      },
      connectToChromeFn: async () => ({
        close: () => {}
      }),
      fetchPageForModeFn: async () => ({
        noteId: 'abc123',
        title: '测试笔记',
        content: '正文',
        comments: [],
        commentTotal: 0
      }),
      exportNote: async () => ({
        filepath: 'G:/output/abc123.md'
      })
    }
  );

  assert.notEqual(saved.task, batchTask);
  assert.equal(saved.task.input, 'https://www.xiaohongshu.com/explore/abc123');
  assert.equal(saved.task.source, 'ui');
  assert.notEqual(saved.note.browser_orchestration.run_id, buildTaskRunId(batchTask));
});

test('resumeNoteSaveFromCheckpoint reuses the original run id and continues from checkpoint', async () => {
  const checkpointStore = createMemoryCheckpointStore();
  const task = {
    type: 'note-save',
    source: 'ui',
    input: 'https://www.xiaohongshu.com/explore/abc123',
    options: {},
    requestedAt: '2026-04-06T12:00:00.000Z'
  };
  const runId = buildTaskRunId(task);
  checkpointStore.saveCheckpoint(runId, {
    runId,
    task,
    startedAt: '2026-04-06T12:00:00.000Z',
    updatedAt: '2026-04-06T12:01:00.000Z',
    states: ['attach_browser', 'locate_target', 'load_note', 'validate_result'],
    state: 'load_note',
    status: 'need_human',
    attempts: {
      attach_browser: 1,
      locate_target: 1,
      load_note: 1
    },
    observations: [],
    warnings: [{
      state: 'load_note',
      code: 'comment_login_required',
      message: '当前网页端提示“登录查看全部评论内容”，请先登录后重试。'
    }],
    transitions: [],
    lastError: {
      state: 'load_note',
      code: 'login_required',
      message: '无登录信息或登录已失效，请重新登录',
      retryable: false
    },
    result: {
      note: {
        noteId: 'abc123',
        noteUrl: 'https://www.xiaohongshu.com/discovery/item/abc123'
      }
    },
    metadata: {
      navigation_url: 'https://www.xiaohongshu.com/explore/abc123'
    }
  });

  const saved = await resumeNoteSaveFromCheckpoint(runId, {
    orchestration: {
      checkpointStore
    },
    connectToChromeFn: async () => ({
      close: () => {}
    }),
    fetchPageForModeFn: async () => ({
      noteId: 'abc123',
      title: '恢复执行后的笔记',
      content: '正文',
      comments: [],
      commentTotal: 0
    }),
    exportNote: async () => ({
      filepath: 'G:/output/abc123.md'
    })
  });

  assert.equal(saved.task.requestedAt, '2026-04-06T12:00:00.000Z');
  assert.equal(saved.task.input, 'https://www.xiaohongshu.com/discovery/item/abc123');
  assert.equal(saved.note.browser_orchestration.run_id, runId);
  assert.equal(saved.note.browser_orchestration.status, 'done');
});

test('saveModesSequentially keeps comment diagnostics on successful results', async () => {
  const summary = await saveModesSequentially(
    [{
      noteId: 'abc123',
      canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/abc123',
      navigationUrl: 'https://www.xiaohongshu.com/discovery/item/abc123'
    }],
    {
      saveMode: async () => ({
        note: {
          platform: 'xiaohongshu',
          sourceType: 'xiaohongshu'
        },
        result: {
          filepath: 'G:/output/单条笔记保存/abc123.md',
          warnings: [{
            step: 'comments',
            code: 'comment_login_required',
            message: '评论剩余内容需要登录后查看。'
          }],
          comment_total: 86,
          comment_collected: 19,
          comment_warning_code: 'comment_login_required',
          comment_error: '当前网页端提示“登录查看全部评论内容”，请先在当前 Chrome 会话中登录后重试。',
          manual_action_required: true,
          manual_action_reason: 'login_required'
        }
      }),
      noteDelayMs: 0,
      noteDelayJitterMs: 0,
      sleep: async () => {}
    }
  );

  const item = summary.results[0];
  assert.equal(item.comment_total, 86);
  assert.equal(item.comment_collected, 19);
  assert.equal(item.comment_warning_code, 'comment_login_required');
  assert.match(item.comment_error, /登录/);
  assert.equal(item.manual_action_required, true);
  assert.equal(item.manual_action_reason, 'login_required');
});

test('saveModesSequentially keeps browser orchestration metadata on need_human failures', async () => {
  const checkpointStore = createMemoryCheckpointStore();
  const summary = await saveModesSequentially(
    [{
      noteId: 'abc123',
      canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/abc123',
      navigationUrl: 'https://www.xiaohongshu.com/discovery/item/abc123'
    }],
    {
      orchestration: {
        checkpointStore
      },
      saveMode: async () => {
        const error = new CodexTaskError('login_required', '无登录信息或登录已失效，请重新登录');
        error.orchestration = {
          runId: 'note-save-ui-2026-04-06T120000000Z',
          status: 'need_human',
          state: 'expand_comments',
          warnings: [{
            state: 'collect_comments',
            code: 'comment_login_required',
            message: '当前网页端提示“登录查看全部评论内容”，请先登录后重试。'
          }],
          lastError: {
            state: 'collect_comments',
            code: 'login_required',
            message: '无登录信息或登录已失效，请重新登录',
            retryable: false
          }
        };
        throw error;
      },
      noteDelayMs: 0,
      noteDelayJitterMs: 0,
      sleep: async () => {}
    }
  );

  const item = summary.results[0];
  assert.equal(item.status, 'failed');
  assert.equal(item.manual_action_required, true);
  assert.equal(item.manual_action_reason, 'login_required');
  assert.equal(item.browser_orchestration.status, 'need_human');
  assert.equal(item.browser_orchestration.state, 'expand_comments');
  assert.match(item.browser_orchestration.checkpoint_path, /note-save-ui-2026-04-06T120000000Z/);
  assert.ok(item.warnings.some((warning) => warning.code === 'comment_login_required'));
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

test('fetchPageForMode treats XiaoHongshu note urls as notes even when sourceType stores input origin', async () => {
  let closed = false;
  let navigatedTo = '';
  const result = await fetchPageForMode(
    {
      mode: 'url',
      sourceType: 'url',
      noteId: 'abc123',
      extractedUrl: 'https://www.xiaohongshu.com/explore/abc123',
      canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/abc123',
      navigationUrl: 'http://xhslink.com/o/demo'
    },
    {
      connectToChromeFn: async () => ({
        close: () => { closed = true; }
      }),
      navigateToUrlFn: async (_ws, url) => {
        navigatedTo = url;
      },
      getCurrentPageUrlFn: async () => 'https://www.xiaohongshu.com/discovery/item/abc123',
      extractNoteDetailFn: async () => ({
        title: '测试笔记',
        author: '作者',
        date: '2026-03-22',
        tags: [],
        images: [],
        content: '正文',
        comments: []
      })
    }
  );

  assert.equal(navigatedTo, 'http://xhslink.com/o/demo');
  assert.equal(result.noteId, 'abc123');
  assert.equal(result.title, '测试笔记');
  assert.equal(closed, true);
});

test('fetchPageForMode does not require an existing XiaoHongshu tab in isolated mode', async () => {
  let capturedRequireXiaohongshu = null;
  const result = await fetchPageForMode(
    {
      mode: 'url',
      sourceType: 'url',
      noteId: 'abc123',
      extractedUrl: 'https://www.xiaohongshu.com/explore/abc123',
      canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/abc123',
      navigationUrl: 'http://xhslink.com/o/demo',
      browser: {
        mode: 'isolated',
        headless: true
      }
    },
    {
      connectToChromeFn: async (options = {}) => {
        capturedRequireXiaohongshu = options.requireXiaohongshu;
        return {
          close: () => {}
        };
      },
      navigateToUrlFn: async () => {},
      getCurrentPageUrlFn: async () => 'https://www.xiaohongshu.com/discovery/item/abc123',
      extractNoteDetailFn: async () => ({
        title: '隔离模式测试',
        author: '作者',
        date: '2026-03-22',
        tags: [],
        images: [],
        content: '正文',
        comments: []
      })
    }
  );

  assert.equal(capturedRequireXiaohongshu, false);
  assert.equal(result.title, '隔离模式测试');
});

test('resolveRunMode accepts direct WeChat article urls', async () => {
  const result = await resolveRunMode({
    mode: 'input',
    input: 'https://mp.weixin.qq.com/s/abc123'
  });

  assert.equal(result.mode, 'url');
  assert.equal(result.sourceType, 'wechat_article');
  assert.equal(result.navigationUrl, 'https://mp.weixin.qq.com/s/abc123');
  assert.equal(result.canonicalUrl, 'https://mp.weixin.qq.com/s/abc123');
});

test('resolveRunMode accepts direct Zhihu collection urls for favorites handoff', async () => {
  const result = await resolveRunMode({
    mode: 'input',
    input: 'https://www.zhihu.com/collection/123456789'
  });

  assert.equal(result.mode, 'url');
  assert.equal(result.sourceType, 'zhihu_collection');
  assert.equal(result.navigationUrl, 'https://www.zhihu.com/collection/123456789');
  assert.equal(result.canonicalUrl, 'https://www.zhihu.com/collection/123456789');
});

test('fetchPageForMode rejects Zhihu collection urls with dedicated export guidance', async () => {
  let connectCalled = false;

  await assert.rejects(
    () => fetchPageForMode(
      {
        mode: 'url',
        sourceType: 'zhihu_collection',
        navigationUrl: 'https://www.zhihu.com/collection/123456789',
        canonicalUrl: 'https://www.zhihu.com/collection/123456789'
      },
      {
        connectToChromeFn: async () => {
          connectCalled = true;
          return { close: () => {} };
        }
      }
    ),
    /知乎收藏夹.*专用导出流程|专用导出流程.*知乎收藏夹/
  );

  assert.equal(connectCalled, false);
});

test('fetchPageForMode routes current WeChat page through article extractor', async () => {
  let closed = false;
  const result = await fetchPageForMode(
    { mode: 'current' },
    {
      connectToChromeFn: async () => ({
        close: () => { closed = true; }
      }),
      getCurrentPageUrlFn: async () => 'https://mp.weixin.qq.com/s/abc123',
      readCurrentPageSnapshotFn: async () => ({
        html: `
          <h1 id="activity-name">微信标题</h1>
          <a id="js_name" href="https://example.com/author">公众号作者</a>
          <em id="publish_time">2026-03-21</em>
          <div id="js_content"><p>正文内容</p></div>
        `
      })
    }
  );

  assert.equal(result.platform, 'wechat');
  assert.equal(result.sourceType, 'wechat_article');
  assert.equal(result.title, '微信标题');
  assert.equal(closed, true);
});

test('fetchPageForMode keeps article page attached until extraction finishes', async () => {
  let closed = false;
  let closedDuringRead = false;
  const result = await fetchPageForMode(
    { mode: 'current' },
    {
      connectToChromeFn: async () => ({
        close: () => { closed = true; }
      }),
      getCurrentPageUrlFn: async () => 'https://mp.weixin.qq.com/s/async123',
      readCurrentPageSnapshotFn: async () => {
        await Promise.resolve();
        closedDuringRead = closed;
        return {
          html: `
            <h1 id="activity-name">Async WeChat Title</h1>
            <a id="js_name" href="https://example.com/author">Author</a>
            <em id="publish_time">2026-03-21</em>
            <div id="js_content"><p>Body</p></div>
          `
        };
      }
    }
  );

  assert.equal(closedDuringRead, false);
  assert.equal(result.title, 'Async WeChat Title');
  assert.equal(closed, true);
});

test('fetchPageForMode keeps current XiaoHongshu flow unchanged', async () => {
  let closed = false;
  const result = await fetchPageForMode(
    { mode: 'current' },
    {
      connectToChromeFn: async () => ({
        close: () => { closed = true; }
      }),
      getCurrentPageUrlFn: async () => 'https://www.xiaohongshu.com/discovery/item/abc123',
      extractNoteDetailFn: async () => ({
        title: '小红书标题',
        author: '作者',
        date: '2026-03-21',
        tags: [],
        images: [],
        content: '正文',
        comments: []
      })
    }
  );

  assert.equal(result.noteId, 'abc123');
  assert.equal(result.title, '小红书标题');
  assert.equal(closed, true);
});

test('fetchPageForMode navigates article urls without XiaoHongshu note wait logic', async () => {
  let navigatedTo = '';
  let closed = false;
  const result = await fetchPageForMode(
    {
      mode: 'url',
      sourceType: 'wechat_article',
      navigationUrl: 'https://mp.weixin.qq.com/s/abc123',
      canonicalUrl: 'https://mp.weixin.qq.com/s/abc123'
    },
    {
      connectToChromeFn: async () => ({
        close: () => { closed = true; }
      }),
      navigateGenericPageFn: async (_ws, url) => {
        navigatedTo = url;
      },
      resolveWsEndpointForUrlFn: async () => '',
      waitForArticlePageReadyFn: async () => ({ readyState: 'complete', hasRoot: true, title: '微信标题' }),
      getCurrentPageUrlFn: async () => 'https://mp.weixin.qq.com/s/abc123',
      readCurrentPageSnapshotFn: async () => ({
        html: `
          <h1 id="activity-name">微信标题</h1>
          <a id="js_name" href="https://example.com/author">公众号作者</a>
          <em id="publish_time">2026-03-21</em>
          <div id="js_content"><p>正文内容</p></div>
        `
      })
    }
  );

  assert.equal(navigatedTo, 'https://mp.weixin.qq.com/s/abc123');
  assert.equal(result.platform, 'wechat');
  assert.equal(closed, true);
});

test('fetchPageForMode closes temporary article tabs after extraction in isolated mode', async () => {
  const targetUrl = 'https://blog.csdn.net/example/article/details/123456789';
  let initialClosed = false;
  let articleClosed = false;
  let articlePrimed = false;
  let closedTarget = null;
  let resolveCount = 0;
  const initialWs = {
    close: () => { initialClosed = true; }
  };
  const articleWs = {
    close: () => { articleClosed = true; }
  };

  const result = await fetchPageForMode(
    {
      mode: 'url',
      sourceType: 'csdn_article',
      navigationUrl: targetUrl,
      canonicalUrl: targetUrl
    },
    {
      connectToChromeFn: async (options = {}) => (options.wsEndpoint ? articleWs : initialWs),
      navigateGenericPageFn: async () => targetUrl,
      resolveWsEndpointForUrlFn: async () => {
        resolveCount += 1;
        return resolveCount === 1 ? '' : 'ws://127.0.0.1:9222/devtools/page/article';
      },
      getCurrentPageUrlFn: async (ws) => {
        if (ws === articleWs) {
          articlePrimed = true;
        }
        return targetUrl;
      },
      waitForArticlePageReadyFn: async () => ({
        readyState: 'complete',
        hasRoot: true,
        title: 'CSDN标题'
      }),
      closePageTargetFn: async (payload) => {
        closedTarget = payload;
      },
      readCurrentPageSnapshotFn: async (ws) => {
        assert.equal(ws, articleWs);
        assert.equal(articlePrimed, true);
        return {
          html: `
            <h1 id="articleContentId">CSDN标题</h1>
            <div class="time">2026-03-21</div>
            <div id="content_views"><p>正文内容</p></div>
          `
        };
      }
    }
  );

  assert.equal(result.platform, 'csdn');
  assert.equal(result.title, 'CSDN标题');
  assert.equal(initialClosed, true);
  assert.equal(articleClosed, true);
  assert.deepEqual(closedTarget, {
    browserUrl: 'http://localhost:9222/json',
    wsEndpoint: 'ws://127.0.0.1:9222/devtools/page/article'
  });
});

test('fetchPageForMode closes temporary article tabs when extraction fails', async () => {
  const targetUrl = 'https://mp.weixin.qq.com/s/fail-cleanup';
  let initialClosed = false;
  let articleClosed = false;
  let closedTarget = null;
  let resolveCount = 0;
  const initialWs = {
    close: () => { initialClosed = true; }
  };
  const articleWs = {
    close: () => { articleClosed = true; }
  };

  await assert.rejects(
    () => fetchPageForMode(
      {
        mode: 'url',
        sourceType: 'wechat_article',
        navigationUrl: targetUrl,
        canonicalUrl: targetUrl
      },
      {
        connectToChromeFn: async (options = {}) => (options.wsEndpoint ? articleWs : initialWs),
        navigateGenericPageFn: async () => targetUrl,
        resolveWsEndpointForUrlFn: async () => {
          resolveCount += 1;
          return resolveCount === 1 ? '' : 'ws://127.0.0.1:9222/devtools/page/wechat-cleanup';
        },
        getCurrentPageUrlFn: async () => targetUrl,
        waitForArticlePageReadyFn: async () => ({
          readyState: 'complete',
          hasRoot: true,
          title: '微信标题'
        }),
        closePageTargetFn: async (payload) => {
          closedTarget = payload;
        },
        readCurrentPageSnapshotFn: async () => {
          throw new Error('snapshot failed');
        }
      }
    ),
    /snapshot failed/
  );

  assert.equal(initialClosed, true);
  assert.equal(articleClosed, true);
  assert.deepEqual(closedTarget, {
    browserUrl: 'http://localhost:9222/json',
    wsEndpoint: 'ws://127.0.0.1:9222/devtools/page/wechat-cleanup'
  });
});

test('fetchPageForMode keeps already-open article tabs untouched', async () => {
  const targetUrl = 'https://zhuanlan.zhihu.com/p/123456789';
  let closed = false;
  let closeTargetCalled = false;
  const articleWs = {
    close: () => { closed = true; }
  };

  const result = await fetchPageForMode(
    {
      mode: 'url',
      sourceType: 'zhihu_article',
      navigationUrl: targetUrl,
      canonicalUrl: targetUrl,
      browser: {
        mode: 'current-browser',
        browserUrl: 'http://127.0.0.1:9222'
      }
    },
    {
      connectToChromeFn: async (options = {}) => {
        assert.equal(options.wsEndpoint, 'ws://127.0.0.1:9222/devtools/page/article');
        return articleWs;
      },
      resolveWsEndpointForUrlFn: async ({ pageUrl }) => {
        assert.equal(pageUrl, targetUrl);
        return 'ws://127.0.0.1:9222/devtools/page/article';
      },
      navigateGenericPageFn: async () => {
        throw new Error('navigate should not run when article tab is already open');
      },
      getCurrentPageUrlFn: async () => targetUrl,
      waitForArticlePageReadyFn: async () => ({
        readyState: 'complete',
        hasRoot: true,
        title: 'Zhihu Title'
      }),
      closePageTargetFn: async () => {
        closeTargetCalled = true;
      },
      readCurrentPageSnapshotFn: async () => ({
        html: `
          <h1 class="Post-Title">Zhihu Title</h1>
          <a class="AuthorInfo-name" href="/people/test-author">Test Author</a>
          <div class="ContentItem-time">2026-03-21</div>
          <div class="Post-RichTextContainer"><p>Body</p></div>
        `
      })
    }
  );

  assert.equal(result.platform, 'zhihu');
  assert.equal(result.title, 'Zhihu Title');
  assert.equal(closed, true);
  assert.equal(closeTargetCalled, false);
});

test('fetchPageForMode reattaches to migrated xiaohongshu target tab when navigation stays on the old tab', async () => {
  const targetUrl = 'https://www.xiaohongshu.com/explore/abc123';
  let initialClosed = false;
  let migratedClosed = false;
  let extractedWs = null;
  let resolvedCount = 0;
  const initialWs = {
    close: () => { initialClosed = true; }
  };
  const migratedWs = {
    close: () => { migratedClosed = true; }
  };

  const result = await fetchPageForMode(
    {
      mode: 'url',
      noteId: 'abc123',
      sourceType: 'url',
      extractedUrl: targetUrl,
      canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/abc123',
      navigationUrl: targetUrl,
      browser: {
        mode: 'current-browser',
        browserUrl: 'http://127.0.0.1:9333'
      }
    },
    {
      connectToChromeFn: async (options = {}) => {
        if (options.wsEndpoint) {
          assert.equal(options.wsEndpoint, 'ws://127.0.0.1:9333/devtools/page/target');
          return migratedWs;
        }
        return initialWs;
      },
      navigateToUrlFn: async (ws, url) => {
        assert.equal(ws, initialWs);
        assert.equal(url, targetUrl);
      },
      getCurrentPageUrlFn: async (ws) => (
        ws === migratedWs
          ? 'https://www.xiaohongshu.com/discovery/item/abc123'
          : 'https://www.xiaohongshu.com/discovery/item/def456'
      ),
      resolveWsEndpointForUrlFn: async ({ pageUrl, sourceType, noteId }) => {
        resolvedCount += 1;
        assert.equal(pageUrl, targetUrl);
        assert.equal(sourceType, 'xiaohongshu');
        assert.equal(noteId, 'abc123');
        return 'ws://127.0.0.1:9333/devtools/page/target';
      },
      extractNoteDetailFn: async (ws) => {
        extractedWs = ws;
        return {
          url: 'https://www.xiaohongshu.com/discovery/item/abc123',
          title: '目标笔记',
          content: '正文',
          author: '作者',
          date: '2026-04-07',
          tags: [],
          images: [],
          comments: [],
          commentTotal: 0
        };
      }
    }
  );

  assert.equal(result.noteId, 'abc123');
  assert.equal(extractedWs, migratedWs);
  assert.equal(initialClosed, true);
  assert.equal(migratedClosed, true);
  assert.equal(resolvedCount, 1);
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
    ['browser_orchestration', 'canonicalUrl', 'comment_collected', 'comment_error', 'comment_total', 'comment_warning_code', 'filepath', 'index', 'input', 'manual_action_reason', 'manual_action_required', 'navigationUrl', 'noteId', 'platform', 'sourceType', 'status', 'warnings']
  );
  assert.deepEqual(
    Object.keys(summary.results[1]).sort(),
    ['browser_orchestration', 'canonicalUrl', 'error', 'index', 'input', 'manual_action_reason', 'manual_action_required', 'navigationUrl', 'noteId', 'status', 'warnings']
  );
});

test('saveModesSequentially preserves platform metadata for successful article saves', async () => {
  const summary = await saveModesSequentially(
    [
      {
        canonicalUrl: 'https://mp.weixin.qq.com/s/abc123',
        navigationUrl: 'https://mp.weixin.qq.com/s/abc123',
        sourceType: 'wechat_article'
      }
    ],
    {
      saveMode: async () => ({
        note: {
          platform: 'wechat',
          sourceType: 'wechat_article'
        },
        result: {
          filepath: 'G:/output/wechat.md'
        }
      })
    }
  );

  assert.equal(summary.results[0].platform, 'wechat');
  assert.equal(summary.results[0].sourceType, 'wechat_article');
});

test('saveModesSequentially waits between notes when throttling is enabled', async () => {
  const waits = [];
  await saveModesSequentially(
    [
      { noteId: 'a1', canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/a1' },
      { noteId: 'b2', canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/b2' }
    ],
    {
      saveMode: async (mode) => ({ result: { filepath: `G:/output/${mode.noteId}.md` } }),
      noteDelayMs: 120,
      noteDelayJitterMs: 0,
      sleep: async (ms) => { waits.push(ms); }
    }
  );

  assert.deepEqual(waits, [120]);
});

test('saveModesSequentially uses conservative default note throttling', async () => {
  const waits = [];
  const originalRandom = Math.random;
  const originalDelay = process.env.XHS_NOTE_THROTTLE_MS;
  const originalJitter = process.env.XHS_NOTE_THROTTLE_JITTER_MS;
  delete process.env.XHS_NOTE_THROTTLE_MS;
  delete process.env.XHS_NOTE_THROTTLE_JITTER_MS;
  Math.random = () => 0;

  try {
    await saveModesSequentially(
      [
        { noteId: 'a1', canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/a1' },
        { noteId: 'b2', canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/b2' }
      ],
      {
        saveMode: async (mode) => ({ result: { filepath: `G:/output/${mode.noteId}.md` } }),
        sleep: async (ms) => { waits.push(ms); }
      }
    );
  } finally {
    Math.random = originalRandom;
    if (typeof originalDelay === 'string') {
      process.env.XHS_NOTE_THROTTLE_MS = originalDelay;
    } else {
      delete process.env.XHS_NOTE_THROTTLE_MS;
    }
    if (typeof originalJitter === 'string') {
      process.env.XHS_NOTE_THROTTLE_JITTER_MS = originalJitter;
    } else {
      delete process.env.XHS_NOTE_THROTTLE_JITTER_MS;
    }
  }

  assert.deepEqual(waits, [2500]);
});

test('saveLinksText passes ui overrides to exportNote', async () => {
  let captured;
  await saveLinksText('https://www.xiaohongshu.com/explore/abc123', {
    fetchNote: async () => ({
      title: 'Title',
      noteId: 'abc123',
      author: 'Author',
      collection: 'Single',
      date: '2026-03-08',
      tags: [],
      images: [],
      content: 'Body',
      comments: []
    }),
    exportNote: async (payload) => {
      captured = payload;
      return { filepath: 'G:/output/abc123.md' };
    },
    outputRoot: 'G:/output',
    imagesRoot: 'G:/images',
    configPath: 'G:/config/openrouter.json',
    visionConfigPath: 'G:/config/vision-ocr.json',
    conflictStrategy: 'content-aware',
    maxTitleLength: 40
  });

  assert.equal(captured.outputRoot, 'G:/output');
  assert.equal(captured.imagesRoot, 'G:/images');
  assert.equal(captured.configPath, 'G:/config/openrouter.json');
  assert.equal(captured.visionConfigPath, 'G:/config/vision-ocr.json');
  assert.equal(captured.conflictStrategy, 'content-aware');
  assert.equal(captured.maxTitleLength, 40);
});

test('saveLinksText passes original navigation url into exported note', async () => {
  let capturedNote;
  await saveLinksText('短链 http://xhslink.com/o/short1', {
    resolveRedirectFn: async (url) => {
      if (url === 'http://xhslink.com/o/short1') {
        return 'https://www.xiaohongshu.com/discovery/item/abc123?xsec_token=foo';
      }
      return url;
    },
    fetchNote: async () => ({
      title: 'Title',
      noteId: 'abc123',
      author: 'Author',
      collection: 'Single',
      date: '2026-03-08',
      tags: [],
      images: [],
      content: 'Body',
      comments: []
    }),
    exportNote: async (payload) => {
      capturedNote = payload.note;
      return { filepath: 'G:/output/abc123.md' };
    }
  });

  assert.equal(capturedNote.sourceUrl, 'http://xhslink.com/o/short1');
});

test('saveLinksText applies collectionResolver to note collection', async () => {
  let capturedCollection;
  await saveLinksText('http://xhslink.com/o/short1', {
    resolveRedirectFn: async () => 'https://www.xiaohongshu.com/discovery/item/abc123',
    fetchNote: async () => ({
      title: 'Title',
      noteId: 'abc123',
      author: 'Author',
      collection: '单条笔记保存',
      date: '2026-03-08',
      tags: [],
      images: [],
      content: 'Body',
      comments: []
    }),
    collectionResolver: () => '理财',
    exportNote: async (payload) => {
      capturedCollection = payload.note.collection;
      return { filepath: 'G:/output/abc123.md' };
    }
  });

  assert.equal(capturedCollection, '理财');
});

test('saveLinksText routes xiaohongshu video notes to video note exporter', async () => {
  let capturedVideoPayload = null;
  let defaultExporterCalled = false;

  const summary = await saveLinksText('https://www.xiaohongshu.com/explore/video123', {
    fetchNote: async () => ({
      title: '视频标题',
      noteId: 'video123',
      author: '作者',
      collection: '单条笔记保存',
      platform: 'xiaohongshu',
      sourceType: 'xiaohongshu',
      noteType: 'video',
      hasVideoMedia: true,
      date: '2026-04-25',
      tags: ['视频'],
      images: [],
      content: '视频简介',
      comments: []
    }),
    exportNote: async () => {
      defaultExporterCalled = true;
      throw new Error('default note exporter should not be called for video notes');
    },
    exportVideoNote: async (payload) => {
      capturedVideoPayload = payload;
      return {
        filepath: 'G:/output/视频图文笔记/video123/视频标题.md',
        outputFolder: 'G:/output/视频图文笔记/video123',
        platform: 'xiaohongshu',
        sourceType: 'xiaohongshu_video'
      };
    }
  });

  assert.equal(defaultExporterCalled, false);
  assert.ok(capturedVideoPayload);
  assert.equal(capturedVideoPayload.note.noteId, 'video123');
  assert.equal(capturedVideoPayload.note.noteType, 'video');
  assert.equal(capturedVideoPayload.note.sourceUrl, 'https://www.xiaohongshu.com/explore/video123');
  assert.equal(summary.successCount, 1);
  assert.equal(summary.results[0].filepath, 'G:/output/视频图文笔记/video123/视频标题.md');
  assert.equal(summary.results[0].sourceType, 'xiaohongshu_video');
});

test('saveLinksText default video exporter runs video note cli and returns generated markdown path', async () => {
  const tempRoot = path.resolve('tmp', `xhs-video-note-cli-${Date.now()}`);
  const videoProjectDir = path.join(tempRoot, 'Notes_Video_Collection');
  const videoCliDir = path.join(videoProjectDir, 'prj');
  const pythonExe = path.join(videoCliDir, '.venv', 'Scripts', 'python.exe');
  const outputRoot = path.join(tempRoot, 'output');
  const generatedDir = path.join(outputRoot, '视频图文笔记', 'video-title-video123');
  const generatedMarkdown = path.join(generatedDir, '视频标题.md');
  fs.mkdirSync(path.dirname(pythonExe), { recursive: true });
  fs.writeFileSync(pythonExe, '', 'utf-8');

  let capturedCommand = '';
  let capturedArgs = [];
  let capturedCwd = '';
  let capturedPythonPath = '';

  const summary = await saveLinksText('https://www.xiaohongshu.com/explore/video123', {
    fetchNote: async () => ({
      title: '视频标题',
      noteId: 'video123',
      author: '作者',
      collection: '单条笔记保存',
      noteType: 'video',
      hasVideoMedia: true,
      date: '2026-04-25',
      tags: ['视频'],
      images: [],
      content: '视频简介',
      comments: []
    }),
    exportNote: async () => {
      throw new Error('default note exporter should not be called for video notes');
    },
    outputRoot,
    videoProjectDir,
    videoCliDir,
    videoPythonExe: pythonExe,
    videoSpawnFn: (command, args, options) => {
      capturedCommand = command;
      capturedArgs = Array.from(args || []);
      capturedCwd = options.cwd;
      capturedPythonPath = String(options.env?.PYTHONPATH || '');
      const child = new EventEmitter();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      process.nextTick(() => {
        fs.mkdirSync(generatedDir, { recursive: true });
        fs.writeFileSync(generatedMarkdown, '# 视频标题\n', 'utf-8');
        child.stdout.write(`已生成输出目录：${generatedDir}\n`);
        child.stdout.end();
        child.stderr.end();
        child.emit('close', 0);
      });
      return child;
    }
  });

  assert.equal(capturedCommand, pythonExe);
  assert.equal(capturedCwd, videoCliDir);
  assert.match(capturedPythonPath, /Notes_Video_Collection[\\/]prj[\\/]src/);
  assert.deepEqual(capturedArgs, [
    '-m',
    'video_summary_cli.cli',
    'summarize',
    '--url',
    'https://www.xiaohongshu.com/discovery/item/video123',
    '--output-dir',
    path.join(outputRoot, '视频图文笔记')
  ]);
  assert.equal(summary.successCount, 1);
  assert.equal(summary.results[0].filepath, generatedMarkdown);
  assert.equal(summary.results[0].sourceType, 'xiaohongshu_video');
});

test('saveLinksText keeps normal xiaohongshu notes on default exporter', async () => {
  let defaultExporterPayload = null;
  let videoExporterCalled = false;

  const summary = await saveLinksText('https://www.xiaohongshu.com/explore/note123', {
    fetchNote: async () => ({
      title: '图文标题',
      noteId: 'note123',
      author: '作者',
      collection: '单条笔记保存',
      platform: 'xiaohongshu',
      sourceType: 'xiaohongshu',
      noteType: 'normal',
      hasVideoMedia: false,
      date: '2026-04-25',
      tags: ['图文'],
      images: ['https://example.com/a.jpg'],
      content: '图文正文',
      comments: []
    }),
    exportNote: async (payload) => {
      defaultExporterPayload = payload;
      return { filepath: 'G:/output/单条笔记保存/note123.md' };
    },
    exportVideoNote: async () => {
      videoExporterCalled = true;
      throw new Error('video exporter should not be called for normal notes');
    }
  });

  assert.equal(videoExporterCalled, false);
  assert.ok(defaultExporterPayload);
  assert.equal(defaultExporterPayload.note.noteId, 'note123');
  assert.equal(summary.successCount, 1);
  assert.equal(summary.results[0].filepath, 'G:/output/单条笔记保存/note123.md');
});

test('saveLinksText can auto-classify direct article saves by export-time tags', async () => {
  const tempRoot = path.resolve('tmp', `xhs-save-links-classify-${Date.now()}-ai`);
  const outputRoot = path.join(tempRoot, 'output');
  const imagesRoot = path.join(tempRoot, '_images');
  const configPath = path.join(tempRoot, 'openrouter.json');
  const visionConfigPath = path.join(tempRoot, 'vision-ocr.json');
  fs.mkdirSync(tempRoot, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify({ enabled: false }), 'utf-8');
  fs.writeFileSync(visionConfigPath, JSON.stringify({ enabled: false }), 'utf-8');

  const summary = await saveLinksText('https://mp.weixin.qq.com/s/abc123', {
    fetchNote: async () => ({
      title: 'Chrome DevTools MCP 让 AI 接管当前浏览器',
      noteId: 'wechat-auto-classify',
      author: '圆圆大侠',
      collection: '微信公众号文章',
      platform: 'wechat',
      sourceType: 'wechat_article',
      date: '2026-03-21',
      tags: ['AI', '浏览器自动化'],
      images: [],
      content: '正文内容',
      comments: []
    }),
    outputRoot,
    imagesRoot,
    configPath,
    visionConfigPath,
    classificationCategories: {
      AI: ['AI', 'Agent', '浏览器自动化']
    },
    uiRuntime: {
      autoClassifyLinksEnabled: true,
      aiSummaryEnabled: false,
      visionOcrEnabled: false,
      ocrFallbackEnabled: false,
      maxImagesPerNote: 0
    },
    noteDelayMs: 0,
    noteDelayJitterMs: 0
  });

  assert.equal(summary.successCount, 1);
  assert.match(summary.results[0].filepath, /[\\/]AI[\\/]/);
});

test('saveLinksText keeps source collection when auto classification is disabled', async () => {
  const tempRoot = path.resolve('tmp', `xhs-save-links-classify-${Date.now()}-source`);
  const outputRoot = path.join(tempRoot, 'output');
  const imagesRoot = path.join(tempRoot, '_images');
  const configPath = path.join(tempRoot, 'openrouter.json');
  const visionConfigPath = path.join(tempRoot, 'vision-ocr.json');
  fs.mkdirSync(tempRoot, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify({ enabled: false }), 'utf-8');
  fs.writeFileSync(visionConfigPath, JSON.stringify({ enabled: false }), 'utf-8');

  const summary = await saveLinksText('https://zhuanlan.zhihu.com/p/123456789', {
    fetchNote: async () => ({
      title: '一篇普通文章',
      noteId: 'zhihu-no-classify',
      author: '作者',
      collection: '知乎文章',
      platform: 'zhihu',
      sourceType: 'zhihu_article',
      date: '2026-03-21',
      tags: ['学习'],
      images: [],
      content: '正文内容',
      comments: []
    }),
    outputRoot,
    imagesRoot,
    configPath,
    visionConfigPath,
    classificationCategories: {
      AI: ['AI', 'Agent']
    },
    uiRuntime: {
      autoClassifyLinksEnabled: false,
      aiSummaryEnabled: false,
      visionOcrEnabled: false,
      ocrFallbackEnabled: false,
      maxImagesPerNote: 0
    },
    noteDelayMs: 0,
    noteDelayJitterMs: 0
  });

  assert.equal(summary.successCount, 1);
  assert.match(summary.results[0].filepath, /[\\/]知乎文章[\\/]/);
});

test('getNavigationUrl prefers original navigation url over canonical url', () => {
  const result = getNavigationUrl({
    mode: 'url',
    navigationUrl: 'http://xhslink.com/o/7AXKPbGMN6Q',
    canonicalUrl: 'https://www.xiaohongshu.com/discovery/item/abc123'
  });

  assert.equal(result, 'http://xhslink.com/o/7AXKPbGMN6Q');
});

test('buildChromeRecoveryMode falls back to isolated browser when current browser is unavailable', () => {
  const result = buildChromeRecoveryMode({
    mode: 'url',
    noteId: 'abc123',
    navigationUrl: 'http://xhslink.com/o/demo',
    browser: {
      mode: 'current-browser',
      channel: 'stable',
      headless: true
    }
  });

  assert.equal(result.browser.mode, 'isolated');
  assert.equal(result.browser.channel, 'stable');
  assert.equal(result.browser.headless, true);
  assert.equal(result.browser.browserUrl, '');
  assert.equal(result.browser.wsEndpoint, '');
});

test('buildChromeRecoveryMode keeps explicit current-browser endpoints unchanged', () => {
  const result = buildChromeRecoveryMode({
    mode: 'url',
    noteId: 'abc123',
    navigationUrl: 'http://xhslink.com/o/demo',
    browser: {
      mode: 'current-browser',
      browserUrl: 'http://127.0.0.1:9333',
      wsEndpoint: 'ws://127.0.0.1:9333/devtools/page/demo'
    }
  });

  assert.equal(result, null);
});

test('shouldAutoLaunchChrome only applies to direct url mode', () => {
  assert.equal(shouldAutoLaunchChrome({ mode: 'url' }), true);
  assert.equal(shouldAutoLaunchChrome({ mode: 'current' }), false);
  assert.equal(shouldAutoLaunchChrome({ mode: 'url', browser: { mode: 'current-browser' } }), false);
  assert.equal(shouldAutoLaunchChrome({ mode: 'url', browser: { browserUrl: 'http://127.0.0.1:9333' } }), false);
});

test('buildChromeLaunchArgs includes debug port, isolated profile, and navigation url', () => {
  const args = buildChromeLaunchArgs({
    userDataDir: 'G:/tmp/chrome-debug',
    url: 'http://xhslink.com/o/7AXKPbGMN6Q'
  });

  assert.deepEqual(args.slice(0, 3), [
    '--remote-debugging-port=9222',
    '--no-first-run',
    '--no-default-browser-check'
  ]);
  assert.equal(args.includes('--new-window'), false);
  assert.equal(args.includes('--user-data-dir=G:/tmp/chrome-debug'), true);
  assert.equal(args.at(-1), 'http://xhslink.com/o/7AXKPbGMN6Q');
});

test('buildChromeLaunchArgs adds headless flag when background mode is enabled', () => {
  const args = buildChromeLaunchArgs({
    userDataDir: 'G:/tmp/chrome-debug',
    url: 'https://mp.weixin.qq.com/s/demo',
    headless: true
  });

  assert.equal(args.includes('--headless=new'), true);
  assert.equal(args.includes('--user-data-dir=G:/tmp/chrome-debug'), true);
  assert.equal(args.at(-1), 'https://mp.weixin.qq.com/s/demo');
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

test('formatSaveNoteError adds targeted guidance when current tab is not a note detail page', () => {
  const message = formatSaveNoteError(new Error('Current tab is not a Xiaohongshu note detail page'));
  assert.match(message, /detail|璇︽儏/i);
  assert.match(message, /--current|current-browser|接管/i);
});

test('formatSaveNoteError adds targeted guidance for note unavailable errors', () => {
  const message = formatSaveNoteError(
    new Error('无法打开笔记详情页：当前笔记暂时无法浏览（error_code=300031）。当前页面：https://www.xiaohongshu.com/404')
  );

  assert.match(message, /暂时无法浏览|300031/);
  assert.match(message, /网页端|App|稍后/);
});

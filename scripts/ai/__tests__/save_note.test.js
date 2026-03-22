const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  buildChromeLaunchArgs,
  buildChromeDebugHelp,
  fetchPageForMode,
  formatSaveNoteError,
  getNavigationUrl,
  parseArgs,
  runParsedInput,
  resolveRunModes,
  resolveRunMode,
  saveLinksText,
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

test('fetchPageForMode primes reattached article pages before extraction', async () => {
  const targetUrl = 'https://blog.csdn.net/example/article/details/123456789';
  let initialClosed = false;
  let articleClosed = false;
  let articlePrimed = false;
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
});

test('fetchPageForMode attaches directly to an already-open article tab', async () => {
  const targetUrl = 'https://zhuanlan.zhihu.com/p/123456789';
  let closed = false;
  const articleWs = {
    close: () => { closed = true; }
  };

  const result = await fetchPageForMode(
    {
      mode: 'url',
      sourceType: 'zhihu_article',
      navigationUrl: targetUrl,
      canonicalUrl: targetUrl,
      browser: { browserUrl: 'http://127.0.0.1:9222' }
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
    ['canonicalUrl', 'filepath', 'index', 'input', 'navigationUrl', 'noteId', 'platform', 'sourceType', 'status', 'warnings']
  );
  assert.deepEqual(
    Object.keys(summary.results[1]).sort(),
    ['canonicalUrl', 'error', 'index', 'input', 'navigationUrl', 'noteId', 'status']
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

  assert.deepEqual(args.slice(0, 4), [
    '--remote-debugging-port=9222',
    '--no-first-run',
    '--no-default-browser-check',
    '--new-window'
  ]);
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

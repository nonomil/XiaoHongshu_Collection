const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildCommentArchivePath,
  buildNotePaths,
  generateMarkdown,
  getUsefulComments,
  getPrimaryProjectDir,
  getVisionOcrEndpoint,
  renderUsefulComments,
  resolveVisionOcrConfigPath,
  selectUsefulComments,
  stripVisionOcrWrapper,
  shouldUseVisionOcr,
  writeCommentArchive,
  writeSingleNoteMarkdown
} = require('../../lib/note_export');

test('buildNotePaths writes single note into 单条笔记保存', () => {
  const paths = buildNotePaths({
    outputRoot: 'G:/out',
    collection: '单条笔记保存',
    title: '测试标题',
    noteId: 'abc123'
  });

  assert.match(paths.boardDir, /单条笔记保存/);
  assert.match(paths.filepath, /测试标题\.md$/);
});

test('buildCommentArchivePath writes comment archive under _comments', () => {
  const archivePath = buildCommentArchivePath({
    outputRoot: 'G:/out/单条笔记保存',
    noteId: 'abc123'
  });

  assert.match(archivePath, /_comments/);
  assert.match(archivePath, /abc123\.json$/);
});

test('generateMarkdown includes content, OCR, image, and useful comment sections', () => {
  const markdown = generateMarkdown({
    note: {
      title: '标题',
      noteId: 'abc123',
      author: '作者关注',
      collection: '单条笔记保存',
      date: '2026-03-08',
      tags: ['标签1'],
      images: ['https://example.com/a.jpg']
    },
    content: '正文内容',
    ocrTexts: [{ index: 0, text: '图片文字' }],
    summary: '一句话摘要',
    tags: ['标签1', '标签2', '标签3'],
    commentSummary: '评论区主要补充了工具名、资源站和作者答疑。',
    usefulComments: [
      {
        author: '评论者',
        date: '02-28',
        likeCount: 12,
        content: '给网址让模型自己分析再复刻会更稳。'
      }
    ]
  });

  assert.match(markdown, /正文内容/);
  assert.match(markdown, /## 图片内容（OCR 识别）/);
  assert.match(markdown, /## 原始图片/);
  assert.match(markdown, /## 评论区总结/);
  assert.match(markdown, /评论区主要补充了工具名、资源站和作者答疑。/);
  assert.match(markdown, /## 有用评论全文/);
  assert.match(markdown, /评论者/);
  assert.match(markdown, /\*来源：小红书 \[@作者\]\(https:\/\/www\.xiaohongshu\.com\/discovery\/item\/abc123\)\*/);
});

test('generateMarkdown renders comment collection failure without blocking note body', () => {
  const markdown = generateMarkdown({
    note: {
      title: '标题',
      noteId: 'abc123',
      author: '作者',
      collection: '单条笔记保存',
      date: '2026-03-08',
      tags: [],
      images: []
    },
    content: '正文内容',
    ocrTexts: [],
    summary: '摘要',
    tags: ['标签1', '标签2', '标签3'],
    commentError: '评论区采集失败，本次仅导出正文与图片内容'
  });

  assert.match(markdown, /正文内容/);
  assert.match(markdown, /## 评论区总结/);
  assert.match(markdown, /评论区采集失败，本次仅导出正文与图片内容/);
});

test('renderUsefulComments returns fallback when no useful comments are kept', () => {
  const section = renderUsefulComments([]);
  assert.match(section, /未筛出高价值评论/);
});

test('selectUsefulComments filters obvious noise comments with heuristic fallback', () => {
  const comments = [
    { commentId: '1', author: 'A', content: '确实好看', likeCount: 0, isAuthor: false },
    { commentId: '2', author: 'B', content: '给网址让 gemini 自己分析再复刻会更稳。', likeCount: 3, isAuthor: false },
    { commentId: '3', author: '作者', content: '我用的是截图 + 参考站点 + 提示词约束。', likeCount: 2, isAuthor: true },
    { commentId: '4', author: 'D', content: '蹲', likeCount: 0, isAuthor: false }
  ];

  const useful = selectUsefulComments({ comments, config: { _missing: true } });
  assert.equal(useful.some((item) => item.commentId === '2'), true);
  assert.equal(useful.some((item) => item.commentId === '3'), true);
  assert.equal(useful.some((item) => item.commentId === '4'), false);
});

test('getUsefulComments applies AI second-pass filtering when available', async () => {
  const comments = [
    { commentId: '2', author: 'B', content: '给网址让 gemini 自己分析再复刻会更稳。', likeCount: 3, isAuthor: false },
    { commentId: '3', author: '作者', content: '我用的是截图 + 参考站点 + 提示词约束。', likeCount: 2, isAuthor: true }
  ];

  const useful = await getUsefulComments({
    comments,
    config: {
      enabled: true,
      apiKey: 'sk-test',
      baseUrl: 'https://example.com/v1',
      model: 'test-model'
    },
    reviewFn: async () => ({ keepIndexes: [2] })
  });

  assert.deepEqual(useful.map((item) => item.commentId), ['3']);
});

test('writeSingleNoteMarkdown overwrites the same path for the same note', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'xhs-note-export-'));
  const note = {
    title: '同一条笔记',
    noteId: 'same123',
    author: '作者关注',
    collection: '单条笔记保存',
    date: '2026-03-08',
    tags: [],
    images: []
  };

  const firstPath = writeSingleNoteMarkdown({
    outputRoot: tempRoot,
    note,
    content: '第一次',
    ocrTexts: [],
    summary: '摘要',
    tags: ['标签1', '标签2', '标签3']
  });
  const secondPath = writeSingleNoteMarkdown({
    outputRoot: tempRoot,
    note,
    content: '第二次',
    ocrTexts: [],
    summary: '摘要',
    tags: ['标签1', '标签2', '标签3']
  });

  assert.equal(firstPath, secondPath);
  assert.equal(fs.readFileSync(secondPath, 'utf-8').includes('第二次'), true);
});

test('writeCommentArchive writes raw comments json', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'xhs-comment-archive-'));
  const archivePath = writeCommentArchive({
    outputRoot: tempRoot,
    noteId: 'note123',
    noteTitle: '标题',
    comments: [{ commentId: 'c1', content: '评论内容' }]
  });

  const payload = JSON.parse(fs.readFileSync(archivePath, 'utf-8'));
  assert.equal(payload.noteId, 'note123');
  assert.equal(payload.totalComments, 1);
  assert.equal(payload.comments[0].commentId, 'c1');
});

test('resolveVisionOcrConfigPath prefers the real config file', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'xhs-vision-config-'));
  const configDir = path.join(tempRoot, 'config');
  fs.mkdirSync(configDir, { recursive: true });
  const realPath = path.join(configDir, 'vision-ocr.json');
  const examplePath = path.join(configDir, 'vision-ocr.example.json');
  fs.writeFileSync(realPath, '{}', 'utf-8');
  fs.writeFileSync(examplePath, '{}', 'utf-8');

  assert.equal(resolveVisionOcrConfigPath(tempRoot), realPath);
});

test('resolveVisionOcrConfigPath falls back to example config', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'xhs-vision-config-'));
  const configDir = path.join(tempRoot, 'config');
  fs.mkdirSync(configDir, { recursive: true });
  const examplePath = path.join(configDir, 'vision-ocr.example.json');
  fs.writeFileSync(examplePath, '{}', 'utf-8');

  assert.equal(resolveVisionOcrConfigPath(tempRoot), examplePath);
});

test('getPrimaryProjectDir maps worktree path back to main project dir', () => {
  assert.equal(
    getPrimaryProjectDir('G:\\UserCode\\XiaoHongshu_Collection\\.worktrees\\codex-single-note-save'),
    'G:\\UserCode\\XiaoHongshu_Collection'
  );
  assert.equal(
    getPrimaryProjectDir('G:\\UserCode\\XiaoHongshu_Collection'),
    'G:\\UserCode\\XiaoHongshu_Collection'
  );
});

test('getVisionOcrEndpoint uses responses api for openai-compatible provider', () => {
  assert.equal(
    getVisionOcrEndpoint({ baseUrl: 'https://example.com/v1', provider: 'openai-compatible' }),
    'https://example.com/v1/responses'
  );
});

test('stripVisionOcrWrapper removes assistant framing text', () => {
  const raw = [
    '可以，我先帮你做这张图的 OCR 文字提取。',
    '',
    '---',
    '',
    '## OCR 识别结果',
    '',
    '阿东玩AI',
    '@阿东的大模型实验室',
    '',
    '图片沟通比文字更有用',
    '',
    '---',
    '',
    '如果你愿意，我还可以继续帮你整理。'
  ].join('\n');

  const cleaned = stripVisionOcrWrapper(raw);
  assert.equal(cleaned.startsWith('阿东玩AI'), true);
  assert.equal(cleaned.includes('如果你愿意，我还可以继续帮你整理。'), false);
});

test('shouldUseVisionOcr requires enabled config with credentials', () => {
  assert.equal(shouldUseVisionOcr({ enabled: true, baseUrl: 'https://example.com/v1', apiKey: 'sk-test', model: 'gpt-test' }), true);
  assert.equal(shouldUseVisionOcr({ enabled: false, baseUrl: 'https://example.com/v1', apiKey: 'sk-test', model: 'gpt-test' }), false);
  assert.equal(shouldUseVisionOcr({ enabled: true, baseUrl: '', apiKey: 'sk-test', model: 'gpt-test' }), false);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  buildCommentArchivePath,
  buildNotePaths,
  generateMarkdown,
  getUsefulComments,
  getVisionOcrEndpoint,
  normalizeSummaryTags,
  processSingleNoteExport,
  renderUsefulComments,
  selectUsefulComments,
  stripVisionOcrWrapper,
  shouldUseVisionOcr,
  writeCommentArchive,
  writeSingleNoteMarkdown
} = require('../../lib/note_export');
const { createTempDir } = require('./test_tmp');

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
  assert.match(markdown, /\| 评论 \| 内容 \|/);
  assert.match(markdown, /给网址让模型自己分析再复刻会更稳。/);
  assert.match(markdown, /\*来源：小红书 \[@作者\]\(https:\/\/www\.xiaohongshu\.com\/discovery\/item\/abc123\)\*/);
});

test('generateMarkdown prefers sourceUrl when provided', () => {
  const markdown = generateMarkdown({
    note: {
      title: '标题',
      noteId: 'abc123',
      author: '作者',
      collection: '单条笔记保存',
      date: '2026-03-08',
      tags: [],
      images: [],
      sourceUrl: 'http://xhslink.com/o/short1'
    },
    content: '正文内容',
    ocrTexts: [],
    summary: '摘要',
    tags: ['标签1', '标签2', '标签3']
  });

  assert.match(markdown, /source: "http:\/\/xhslink\.com\/o\/short1"/);
  assert.match(markdown, /\*来源：小红书 \[@作者\]\(http:\/\/xhslink\.com\/o\/short1\)\*/);
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

test('renderUsefulComments groups threaded replies into one markdown table row', () => {
  const section = renderUsefulComments([
    { commentId: 'c1', rootId: 'c1', parentId: '', level: 0, content: '主评论' },
    { commentId: 'c2', rootId: 'c1', parentId: 'c1', level: 1, content: '第一条回复' },
    { commentId: 'c3', rootId: 'c1', parentId: 'c1', level: 1, content: '第二条回复' },
    { commentId: 'c4', rootId: 'c4', parentId: '', level: 0, content: '另一条主评论' }
  ]);

  assert.match(section, /\| 评论 \| 内容 \|/);
  assert.match(section, /\| 评论 1 \| 主评论<br>↳ 第一条回复<br>↳ 第二条回复 \|/);
  assert.match(section, /\| 评论 2 \| 另一条主评论 \|/);
  assert.doesNotMatch(section, /作者|时间|点赞/);
});

test('generateMarkdown places comments after OCR and before original images', () => {
  const markdown = generateMarkdown({
    note: {
      title: '标题',
      noteId: 'abc123',
      author: '作者',
      collection: '单条笔记保存',
      date: '2026-03-08',
      tags: ['标签1'],
      images: ['https://example.com/a.jpg']
    },
    content: '正文内容',
    ocrTexts: [{ index: 0, text: '图片文字' }],
    summary: '一句话摘要',
    tags: ['标签1', '标签2', '标签3'],
    commentSummary: '评论总结',
    usefulComments: [
      { commentId: 'c1', rootId: 'c1', parentId: '', level: 0, content: '主评论' }
    ]
  });

  assert.equal(markdown.indexOf('## 评论区总结') > markdown.indexOf('## 图片内容（OCR 识别）'), true);
  assert.equal(markdown.indexOf('## 评论区总结') < markdown.indexOf('## 原始图片'), true);
});

test('normalizeSummaryTags removes garbled tags before frontmatter output', () => {
  const result = normalizeSummaryTags(
    { summary: '一句话摘要', tags: ['С����', '家庭教育'] },
    { summary: '后备摘要', tags: ['学习工具', '儿童自驱力'] }
  );

  assert.deepEqual(result.tags, ['家庭教育', '学习工具', '儿童自驱力']);
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

test('selectUsefulComments keeps short author replies', () => {
  const comments = [
    { commentId: '1', author: '作者', content: '收到', likeCount: 0, isAuthor: true },
    { commentId: '2', author: '路人', content: '好看', likeCount: 0, isAuthor: false }
  ];

  const useful = selectUsefulComments({ comments, config: { _missing: true } });
  assert.equal(useful.some((item) => item.commentId === '1'), true);
});

test('selectUsefulComments keeps some low-value but non-noise comments', () => {
  const comments = [
    { commentId: '1', author: 'A', content: '内容一般般，但路过看看。', likeCount: 0, isAuthor: false },
    { commentId: '2', author: 'B', content: '感觉还行，先收藏。', likeCount: 0, isAuthor: false }
  ];

  const useful = selectUsefulComments({ comments, config: { _missing: true } });
  assert.equal(useful.length > 0, true);
});

test('renderUsefulComments orders replies after root comments', () => {
  const section = renderUsefulComments([
    { commentId: 'c2', rootId: 'c1', parentId: 'c1', level: 1, content: '回复在前' },
    { commentId: 'c1', rootId: 'c1', parentId: '', level: 0, content: '主评论' }
  ]);

  assert.match(section, /\| 评论 1 \| 主评论<br>↳ 回复在前 \|/);
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
  const tempRoot = createTempDir('xhs-note-export-');
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


test('writeSingleNoteMarkdown adds suffix when content differs with content-aware strategy', () => {
  const tempRoot = createTempDir('xhs-note-export-');
  const note = {
    title: 'Conflict Strategy',
    noteId: 'conflict123',
    author: 'Author',
    collection: 'Single',
    date: '2026-03-08',
    tags: [],
    images: []
  };

  const firstPath = writeSingleNoteMarkdown({
    outputRoot: tempRoot,
    note,
    content: 'Body A',
    ocrTexts: [],
    summary: 'Summary',
    tags: ['Tag1', 'Tag2', 'Tag3'],
    conflictStrategy: 'content-aware'
  });
  const secondPath = writeSingleNoteMarkdown({
    outputRoot: tempRoot,
    note,
    content: 'Body B',
    ocrTexts: [],
    summary: 'Summary',
    tags: ['Tag1', 'Tag2', 'Tag3'],
    conflictStrategy: 'content-aware'
  });

  assert.notEqual(firstPath, secondPath);
  assert.match(secondPath, /-1\.md$/);
});
test('writeSingleNoteMarkdown writes UTF-8 BOM for Windows-compatible markdown display', () => {
  const tempRoot = createTempDir('xhs-note-export-');
  const note = {
    title: '编码测试',
    noteId: 'bom123',
    author: '作者',
    collection: '单条笔记保存',
    date: '2026-03-12',
    tags: [],
    images: []
  };

  const filepath = writeSingleNoteMarkdown({
    outputRoot: tempRoot,
    note,
    content: '中文正文',
    ocrTexts: [],
    summary: '摘要',
    tags: ['标签1', '标签2', '标签3']
  });

  const bytes = fs.readFileSync(filepath);
  assert.equal(bytes[0], 0xEF);
  assert.equal(bytes[1], 0xBB);
  assert.equal(bytes[2], 0xBF);
  assert.equal(bytes.toString('utf8').includes('中文正文'), true);
});

test('writeCommentArchive writes raw comments json', () => {
  const tempRoot = createTempDir('xhs-comment-archive-');
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

test('processSingleNoteExport returns a stable result shape when comments exist', async () => {
  const tempRoot = createTempDir('xhs-process-export-');
  const imagesRoot = path.join(tempRoot, '_images');
  const configPath = path.join(tempRoot, 'openrouter.json');
  const visionConfigPath = path.join(tempRoot, 'vision-ocr.json');
  fs.writeFileSync(configPath, JSON.stringify({ enabled: false }), 'utf-8');
  fs.writeFileSync(visionConfigPath, JSON.stringify({ enabled: false }), 'utf-8');

  const result = await processSingleNoteExport({
    outputRoot: tempRoot,
    imagesRoot,
    configPath,
    visionConfigPath,
    note: {
      title: '稳定结构测试',
      noteId: 'shape123',
      author: '作者',
      collection: '单条笔记保存',
      date: '2026-03-12',
      tags: ['标签1'],
      images: [],
      content: '正文内容',
      comments: [
        { commentId: 'c1', author: '评论者', content: '有价值评论', isAuthor: false }
      ]
    }
  });

  assert.deepEqual(
    Object.keys(result).sort(),
    ['commentArchivePath', 'commentSummary', 'content', 'filepath', 'ocrTexts', 'summary', 'tags', 'usefulComments']
  );
  assert.equal(typeof result.filepath, 'string');
  assert.equal(result.filepath.endsWith('.md'), true);
  assert.equal(typeof result.commentArchivePath, 'string');
  assert.equal(result.commentArchivePath.endsWith('.json'), true);
  assert.equal(result.content, '正文内容');
  assert.deepEqual(result.ocrTexts, []);
  assert.equal(typeof result.summary, 'string');
  assert.equal(Array.isArray(result.tags), true);
  assert.equal(Array.isArray(result.usefulComments), true);
  assert.equal(typeof result.commentSummary, 'string');
});

test('processSingleNoteExport returns a stable result shape when comments are absent', async () => {
  const tempRoot = createTempDir('xhs-process-export-');
  const imagesRoot = path.join(tempRoot, '_images');
  const configPath = path.join(tempRoot, 'openrouter.json');
  const visionConfigPath = path.join(tempRoot, 'vision-ocr.json');
  fs.writeFileSync(configPath, JSON.stringify({ enabled: false }), 'utf-8');
  fs.writeFileSync(visionConfigPath, JSON.stringify({ enabled: false }), 'utf-8');

  const result = await processSingleNoteExport({
    outputRoot: tempRoot,
    imagesRoot,
    configPath,
    visionConfigPath,
    note: {
      title: '无评论结构测试',
      noteId: 'shape124',
      author: '作者',
      collection: '单条笔记保存',
      date: '2026-03-12',
      tags: [],
      images: [],
      content: '正文内容',
      comments: []
    }
  });

  assert.deepEqual(
    Object.keys(result).sort(),
    ['commentArchivePath', 'commentSummary', 'content', 'filepath', 'ocrTexts', 'summary', 'tags', 'usefulComments']
  );
  assert.equal(typeof result.filepath, 'string');
  assert.equal(result.commentArchivePath, '');
  assert.equal(result.content, '正文内容');
  assert.deepEqual(result.ocrTexts, []);
  assert.equal(typeof result.summary, 'string');
  assert.equal(Array.isArray(result.tags), true);
  assert.equal(Array.isArray(result.usefulComments), true);
  assert.equal(typeof result.commentSummary, 'string');
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


const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const { createWorker } = require('tesseract.js');
const { buildAiInput, parseAiResponse, fallbackSummaryTags } = require('../ai/summary');
const { cleanTags } = require('../ai/tag_clean');
const { loadOpenRouterConfig, loadVisionOcrConfig } = require('./config');
const { runOcrWithProvider, shouldUseVisionOcr } = require('./ocr_provider');
const { resolveMarkdownConflict } = require('./output_naming');
const { getSummaryTagsWithProvider, normalizeSummaryTags, shouldUseAiSummary } = require('./summary_provider');

function sanitizeFilename(name, maxLength = 80) {
  return String(name || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, maxLength);
}

function cleanAuthor(author) {
  return String(author || '').replace(/关注$/, '').trim();
}

function cleanContent(content, title) {
  let text = String(content || '');
  const heading = String(title || '');

  if (heading && text.startsWith(heading)) {
    text = text.substring(heading.length).trim();
  }

  text = text.replace(/\n(#[^\n]+)$/m, '').trim();
  text = text.replace(/\n(编辑于[^\n]+)$/m, '').trim();
  text = text.replace(/\n(\d{4}-\d{2}-\d{2})$/m, '').trim();
  text = text.replace(/\n{3,}/g, '\n\n');
  return text;
}

function cleanDate(dateStr) {
  const value = String(dateStr || '').trim();
  if (!value) return '';

  const fullDate = value.match(/(\d{4}-\d{2}-\d{2})/);
  if (fullDate) return fullDate[1];

  const shortDate = value.match(/(\d{2})-(\d{2})/);
  if (shortDate) return `2025-${shortDate[1]}-${shortDate[2]}`;

  return value;
}

function buildNotePaths({ outputRoot, collection, title, noteId, maxTitleLength }) {
  const boardDir = path.join(outputRoot, collection);
  const safeName = sanitizeFilename(title || `note_${noteId}`, maxTitleLength) || `note_${noteId}`;
  const filepath = path.join(boardDir, `${safeName}.md`);
  return { boardDir, filepath };
}

function buildCommentArchivePath({ outputRoot, noteId }) {
  return path.join(outputRoot, '_comments', `${noteId}.json`);
}

function writeCommentArchive({ outputRoot, noteId, noteTitle, comments }) {
  const archivePath = buildCommentArchivePath({ outputRoot, noteId });
  fs.mkdirSync(path.dirname(archivePath), { recursive: true });
  fs.writeFileSync(archivePath, JSON.stringify({
    noteId,
    noteTitle,
    collectedAt: new Date().toISOString(),
    totalComments: Array.isArray(comments) ? comments.length : 0,
    comments: Array.isArray(comments) ? comments : []
  }, null, 2), 'utf-8');
  return archivePath;
}

function renderUsefulComments(usefulComments) {
  if (!Array.isArray(usefulComments) || usefulComments.length === 0) {
    return '评论区已采集，但未筛出高价值评论\n';
  }

  const threads = [];
  const threadMap = new Map();
  let itemIndex = 0;

  for (const comment of usefulComments) {
    const content = normalizeCommentText(comment.content);
    if (!content) continue;

    const threadKey = String(
      comment.rootId ||
      (Number(comment.level || 0) > 0 ? comment.parentId : '') ||
      comment.commentId ||
      content
    );

    if (!threadMap.has(threadKey)) {
      const thread = { items: [] };
      threadMap.set(threadKey, thread);
      threads.push(thread);
    }

    const level = Number(comment.level || 0);
    const prefix = level > 0 ? '↳ ' : '';
    const safeContent = content.replace(/\|/g, '\\|');
    threadMap.get(threadKey).items.push({
      line: `${prefix}${safeContent}`,
      level,
      index: itemIndex++
    });
  }

  if (threads.length === 0) {
    return '评论区已采集，但未筛出高价值评论\n';
  }

  return [
    '| 评论 | 内容 |',
    '| --- | --- |',
    ...threads.map((thread, index) => {
      const lines = thread.items
        .slice()
        .sort((a, b) => (a.level - b.level) || (a.index - b.index))
        .map((item) => item.line)
        .join('<br>');
      return `| 评论 ${index + 1} | ${lines} |`;
    })
  ].join('\n');
}

function normalizeCommentText(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isLikelyNoiseComment(comment) {
  if (comment?.isAuthor) return false;
  const text = normalizeCommentText(comment.content);
  if (!text) return true;
  if (/^(蹲|dd|mark|来了|确实|好看|不错|厉害|学习了|收藏了|收到)$/i.test(text)) return true;
  if (/^[赞好棒强牛]+$/.test(text)) return true;
  if (text.length <= 2) return true;
  return false;
}

function hasUsefulCommentSignal(comment) {
  const text = normalizeCommentText(comment.content);
  if (!text) return false;
  if (comment.isAuthor) return true;
  if (/https?:\/\/|www\.|\.com\b|工具|网站|链接|网址|提示词|模型|Gemini|gpt|Claude|Vibe|Dribbble|Excalidraw|复刻|截图|配色|字体|图标|资源站|经验|踩坑|纠错|不是|打错|应该|可以用/i.test(text)) {
    return true;
  }
  return text.length >= 18;
}

function selectUsefulComments({ comments, config }) {
  const list = Array.isArray(comments) ? comments : [];
  const unique = [];
  const seen = new Set();

  for (const item of list) {
    const normalized = {
      ...item,
      content: normalizeCommentText(item.content)
    };
    const key = normalized.commentId || `${normalized.author}|${normalized.content}`;
    if (!normalized.content || seen.has(key)) continue;
    seen.add(key);
    unique.push(normalized);
  }

  const filtered = unique.filter((item) => !isLikelyNoiseComment(item) && hasUsefulCommentSignal(item));
  if (filtered.length > 0) {
    const limit = 40;
    if (filtered.length <= limit) return filtered;

    const result = [];
    const authors = filtered.filter((item) => item.isAuthor);
    const nonAuthors = filtered.filter((item) => !item.isAuthor);

    for (const item of authors) {
      if (result.length >= limit) break;
      result.push(item);
    }
    for (const item of nonAuthors) {
      if (result.length >= limit) break;
      result.push(item);
    }
    return result;
  }
  return unique.filter((item) => !isLikelyNoiseComment(item)).slice(0, 20);
}

function parseCommentFilterResponse(text) {
  const raw = String(text || '').trim();
  if (!raw) return { keepIndexes: [] };

  function tryParseJson(value) {
    try {
      return JSON.parse(value);
    } catch (_) {
      return null;
    }
  }

  const direct = tryParseJson(raw);
  const wrapped = direct ? null : raw.match(/\{[\s\S]*\}/);
  const payload = direct || (wrapped ? tryParseJson(wrapped[0]) : null) || {};
  const keepIndexes = Array.isArray(payload.keepIndexes)
    ? payload.keepIndexes
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value > 0)
    : [];

  return { keepIndexes: Array.from(new Set(keepIndexes)) };
}

async function callCommentFilterAi({ usefulComments, config }) {
  const input = usefulComments.slice(0, 20).map((item, index) =>
    `评论${index + 1} 作者：${item.author || '未知'} 内容：${item.content || ''}`
  ).join('\n');

  const prompt = [
    '你是评论筛选助手。请只输出 JSON，不要包含其他文字。',
    'JSON 格式：',
    '{"keepIndexes":[1,2]}',
    '要求：',
    '- keepIndexes 只保留真正补充正文信息、工具名、纠错、经验或作者有效回复的评论编号',
    '- 保守筛选，宁可多留，不要因为措辞口语化就删掉有用评论',
    '- 如果拿不准，优先保留',
    '以下是评论：',
    input
  ].join('\n');

  const payload = {
    model: config.model || 'openrouter/free',
    messages: [
      { role: 'system', content: '你是一个严格的 JSON 生成器，只输出 JSON。' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.1
  };

  const endpoint = `${(config.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/$/, '')}/chat/completions`;
  const headers = {
    Authorization: `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://github.com/nonomil/XiaoHongshu_Collection',
    'X-Title': 'XiaoHongshu Collection Comment Filter'
  };

  const rawText = await postJson(endpoint, headers, payload, Number(config.timeoutMs || 30000));
  const parsed = JSON.parse(rawText);
  const content = parsed?.choices?.[0]?.message?.content || '';
  if (!content) throw new Error('Comment filter AI returned empty response');
  return parseCommentFilterResponse(content);
}

async function getUsefulComments({ comments, config, reviewFn = callCommentFilterAi }) {
  const heuristicComments = selectUsefulComments({ comments, config });
  if (heuristicComments.length <= 1 || !shouldUseAiSummary(config)) {
    return heuristicComments;
  }

  try {
    const reviewed = await reviewFn({ usefulComments: heuristicComments, config });
    const keepIndexes = Array.isArray(reviewed?.keepIndexes) ? reviewed.keepIndexes : [];
    const filtered = keepIndexes
      .map((index) => heuristicComments[index - 1])
      .filter(Boolean);

    return filtered.length > 0 ? filtered : heuristicComments;
  } catch (_) {
    return heuristicComments;
  }
}

async function summarizeUsefulComments({ usefulComments, config }) {
  const list = Array.isArray(usefulComments) ? usefulComments : [];
  if (list.length === 0) {
    return '评论区已采集，但未筛出高价值评论';
  }

  const aiEnabled = shouldUseAiSummary(config);
  if (!aiEnabled) {
    return `评论区共保留 ${list.length} 条高价值评论，主要涉及工具、经验补充和作者回复。`;
  }

  const input = list.slice(0, 20).map((item, index) =>
    `评论${index + 1} 作者：${item.author || '未知'} 内容：${item.content}`
  ).join('\n');

  const prompt = [
    '你是评论归档助理。请只输出 JSON，不要包含其他文字。',
    'JSON 格式：',
    '{"summary":"一句中文总结(<=80字)"}',
    '要求：总结评论中真正新增的信息、纠错、工具、经验，不要复述废话。',
    '以下是评论：',
    input
  ].join('\n');

  try {
    const ai = await callOpenRouter({ input: prompt, config });
    return String(ai.summary || '').trim() || `评论区共保留 ${list.length} 条高价值评论，主要涉及工具、经验补充和作者回复。`;
  } catch (_) {
    return `评论区共保留 ${list.length} 条高价值评论，主要涉及工具、经验补充和作者回复。`;
  }
}

function generateMarkdown({ note, content, ocrTexts, summary, tags, commentSummary, usefulComments, commentError }) {
  const cleanedContent = cleanContent(content ?? note.content, note.title);
  const author = cleanAuthor(note.author);
  const date = cleanDate(note.date);
  const shortNote = cleanedContent.length < 50;
  const sourceUrl = `https://www.xiaohongshu.com/discovery/item/${note.noteId}`;
  const safeSummary = summary || note.title || '';
  let safeTags = cleanTags((tags && tags.length > 0) ? tags : ['小红书', ...(note.tags || [])]);
  while (safeTags.length < 3) safeTags.push('笔记');
  safeTags = safeTags.slice(0, 5);

  let md = '---\n';
  md += `title: "${note.title}"\n`;
  md += `source: "${sourceUrl}"\n`;
  md += `author: "${author}"\n`;
  md += `collection: "${note.collection}"\n`;
  md += `saved_date: "${date}"\n`;
  md += `summary: "${safeSummary}"\n`;
  md += `tags: [${safeTags.join(', ')}]\n`;
  md += `short_note: ${shortNote}\n`;
  md += '---\n\n';

  if (cleanedContent) {
    md += `${cleanedContent}\n`;
  }

  if (ocrTexts && ocrTexts.length > 0) {
    md += '\n---\n\n## 图片内容（OCR 识别）\n\n';
    ocrTexts.forEach((ocr) => {
      md += `### 图 ${ocr.index + 1}\n\n`;
      md += `${ocr.text}\n\n`;
    });
  }

  if (commentSummary || commentError || (usefulComments && usefulComments.length > 0)) {
    md += '\n---\n\n## 评论区总结\n\n';
    md += `${commentError || commentSummary || '评论区已采集，但未筛出高价值评论'}\n\n`;
    md += '## 有用评论全文\n\n';
    md += `${renderUsefulComments(usefulComments)}\n`;
  }

  if (note.images && note.images.length > 0) {
    md += '\n---\n\n## 原始图片\n\n';
    note.images.forEach((img, index) => {
      md += `![图 ${index + 1}](${img})\n\n`;
    });
  }

  md += '\n---\n';
  md += `*来源：小红书 [@${author}](${sourceUrl})*\n`;
  return md;
}

function writeSingleNoteMarkdown({
  outputRoot,
  note,
  content,
  ocrTexts,
  summary,
  tags,
  commentSummary,
  usefulComments,
  commentError,
  conflictStrategy,
  maxTitleLength
}) {
  const { boardDir, filepath } = buildNotePaths({
    outputRoot,
    collection: note.collection,
    title: note.title,
    noteId: note.noteId,
    maxTitleLength
  });

  fs.mkdirSync(boardDir, { recursive: true });
  const markdown = generateMarkdown({
    note,
    content,
    ocrTexts,
    summary,
    tags,
    commentSummary,
    usefulComments,
    commentError
  });
  const targetPath = conflictStrategy === 'content-aware'
    ? resolveMarkdownConflict({ filepath, nextMarkdown: markdown })
    : filepath;
  fs.writeFileSync(targetPath, `\uFEFF${markdown}`, 'utf-8');
  return targetPath;
}

function getVisionOcrEndpoint(config) {
  return `${String(config.baseUrl || '').replace(/\/$/, '')}/responses`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncateText(text, maxChars) {
  const value = String(text || '');
  return value.length <= maxChars ? value : value.substring(0, maxChars);
}

function cleanOcrText(text) {
  if (!text) return '';

  let value = String(text);
  value = value.replace(/([\u4e00-\u9fff\u3000-\u303f\uff00-\uffef])\s+([\u4e00-\u9fff\u3000-\u303f\uff00-\uffef])/g, '$1$2');
  value = value.replace(/([\u4e00-\u9fff\u3000-\u303f\uff00-\uffef])\s+([\u4e00-\u9fff\u3000-\u303f\uff00-\uffef])/g, '$1$2');
  value = value.replace(/([\u4e00-\u9fff])\s+([，。；：！？”'（）「」『』【】《》])/g, '$1$2');
  value = value.replace(/([，。；：！？”'（）「」『』【】《》])\s+([\u4e00-\u9fff])/g, '$1$2');
  value = value.replace(/([\u4e00-\u9fff])\s+(["“”])/g, '$1$2');
  value = value.replace(/(["“”])\s+([\u4e00-\u9fff])/g, '$1$2');
  value = value.replace(/([\u4e00-\u9fff])\s+([a-zA-Z]{2,})/g, '$1 $2');
  value = value.replace(/([a-zA-Z]{2,})\s+([\u4e00-\u9fff])/g, '$1 $2');
  value = value.replace(/^•\s*/gm, '- ');
  value = value.replace(/\n•\s*/g, '\n- ');
  value = value.replace(/^\.+/gm, '');
  value = value.replace(/ {2,}/g, ' ');
  value = value.replace(/\n{3,}/g, '\n\n');
  value = value.split('\n').map((line) => line.trim()).join('\n');
  return value.trim();
}

function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, { headers: { Referer: 'https://www.xiaohongshu.com/' } }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadImage(res.headers.location, filepath).then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      const stream = fs.createWriteStream(filepath);
      res.pipe(stream);
      stream.on('finish', () => {
        stream.close();
        resolve(filepath);
      });
      stream.on('error', reject);
    }).on('error', reject);
  });
}

async function ocrImages({ images, imagesRoot, noteId, tesseractLang = 'chi_sim+eng' }) {
  if (!Array.isArray(images) || images.length === 0) return [];

  const contentImages = images.filter((url) =>
    typeof url === 'string' && (
      url.includes('spectrum/') ||
      url.includes('notes_pre_post/') ||
      url.includes('sns-webpic')
    )
  );
  if (contentImages.length === 0) return [];

  const worker = await createWorker(tesseractLang);
  const noteImageDir = path.join(imagesRoot, noteId);
  fs.mkdirSync(noteImageDir, { recursive: true });
  const results = [];

  try {
    for (let index = 0; index < contentImages.length; index += 1) {
      const url = contentImages[index];
      const ext = url.includes('.png') ? '.png' : '.jpg';
      const filepath = path.join(noteImageDir, `img_${index}${ext}`);

      await downloadImage(url, filepath);
      const recognized = await worker.recognize(filepath);
      const cleanText = cleanOcrText(recognized?.data?.text || '');
      if (cleanText) {
        results.push({ index, text: cleanText, url });
      }
    }
  } finally {
    await worker.terminate();
  }

  return results;
}

function normalizeAssistantText(content) {
  if (typeof content === 'string') return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item.text === 'string') return item.text;
        return '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  return '';
}

function postJson(url, headers, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const target = new URL(url);
    const request = https.request({
      method: 'POST',
      protocol: target.protocol,
      hostname: target.hostname,
      path: `${target.pathname}${target.search}`,
      headers: {
        ...headers,
        'Content-Length': Buffer.byteLength(data)
      }
    }, (res) => {
      let rawData = '';
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          return reject(new Error(`HTTP ${res.statusCode}: ${rawData.substring(0, 200)}`));
        }
        resolve(rawData);
      });
    });

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error('OpenRouter request timeout'));
    });
    request.on('error', reject);
    request.write(data);
    request.end();
  });
}

function extractResponseText(payload) {
  if (!payload || typeof payload !== 'object') return '';

  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const output = Array.isArray(payload.output) ? payload.output : [];
  const parts = [];

  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const piece of content) {
      if (typeof piece?.text === 'string') {
        parts.push(piece.text);
      }
    }
  }

  return parts.join('\n').trim();
}

function parseResponsesApiPayload(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return {};

  if (!text.startsWith('event:')) {
    return JSON.parse(text);
  }

  const chunks = text.split(/\n\n+/);
  for (let index = chunks.length - 1; index >= 0; index -= 1) {
    const chunk = chunks[index];
    const match = chunk.match(/data:\s*(\{[\s\S]*\})/);
    if (!match) continue;
    const parsed = JSON.parse(match[1]);
    if (parsed?.response && typeof parsed.response === 'object') {
      return parsed.response;
    }
    return parsed;
  }

  return {};
}

function stripVisionOcrWrapper(text) {
  const lines = String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trimEnd());

  let startIndex = 0;
  while (startIndex < lines.length) {
    const value = lines[startIndex].trim();
    if (!value) {
      startIndex += 1;
      continue;
    }
    if (/^(\u53EF\u4EE5|\u597D\u7684|\u4EE5\u4E0B|\u6211\u5148|\u5F53\u7136|\u4ECE\u56FE\u7247\u4E2D\u8BC6\u522B\u5230\u7684\u6587\u5B57|OCR \u8BC6\u522B\u7ED3\u679C)/.test(value)) {
      startIndex += 1;
      continue;
    }
    if (/^[-\u2014]{3,}$/.test(value) || /^##\s*OCR/.test(value)) {
      startIndex += 1;
      continue;
    }
    break;
  }

  let endIndex = lines.length;
  while (endIndex > startIndex) {
    const value = lines[endIndex - 1].trim();
    if (!value) {
      endIndex -= 1;
      continue;
    }
    if (/^(\u5982\u679C\u4F60\u613F\u610F|\u5982\u679C\u9700\u8981|\u6211\u8FD8\u53EF\u4EE5|\u4EE5\u4E0A\u5C31\u662F|\u4EE5\u4E0A\u4E3A)/.test(value)) {
      endIndex -= 1;
      continue;
    }
    if (/^[-\u2014]{3,}$/.test(value)) {
      endIndex -= 1;
      continue;
    }
    break;
  }

  return lines.slice(startIndex, endIndex).join('\n').trim();
}

async function callOpenRouter({ input, config }) {
  const prompt = [
    '\u4F60\u662F\u5185\u5BB9\u52A9\u7406\u3002\u8BF7\u53EA\u8F93\u51FA JSON\uFF0C\u4E0D\u8981\u5305\u542B\u5176\u4ED6\u6587\u5B57\u3002',
    'JSON \u683C\u5F0F\uFF1A',
    '{"summary":"\u4E00\u53E5\u8BDD(<=50\u5B57)","tags":["\u6807\u7B7E1","\u6807\u7B7E2","\u6807\u7B7E3"]}',
    '\u8981\u6C42\uFF1Asummary \u4E3A\u4E2D\u6587\u4E00\u53E5\u8BDD\uFF0Ctags \u4E3A 3-5 \u4E2A\u4E2D\u6587\u540D\u8BCD\u77ED\u8BED\u3002',
    '\u4EE5\u4E0B\u662F\u5185\u5BB9\uFF1A',
    input
  ].join('\n');

  const payload = {
    model: config.model || 'openrouter/free',
    messages: [
      { role: 'system', content: '\u4F60\u662F\u4E00\u4E2A\u4E25\u683C\u7684 JSON \u751F\u6210\u5668\uFF0C\u53EA\u8F93\u51FA JSON\u3002' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.2
  };

  const endpoint = `${(config.baseUrl || 'https://openrouter.ai/api/v1').replace(/\/$/, '')}/chat/completions`;
  const headers = {
    Authorization: `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://github.com/nonomil/XiaoHongshu_Collection',
    'X-Title': 'XiaoHongshu Collection OCR Summarizer'
  };

  const rawText = await postJson(endpoint, headers, payload, Number(config.timeoutMs || 30000));
  const parsed = JSON.parse(rawText);
  const content = parsed?.choices?.[0]?.message?.content || '';
  if (!content) throw new Error('OpenRouter empty response');
  return parseAiResponse(content);
}

async function callVisionOcr({ imageUrl, config }) {
  const prompt = String(config.prompt || '').trim() || [
    'You are an OCR extraction assistant.',
    'Read all visible text from the image faithfully.',
    'Keep headings, lists, line breaks, and ordering whenever possible.',
    'Do not summarize. Do not add information not present in the image.',
    'Return only the recognized text.'
  ].join(' ');

  const endpoint = getVisionOcrEndpoint(config);
  const payload = {
    model: config.model,
    stream: false,
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text: prompt },
          { type: 'input_image', image_url: imageUrl }
        ]
      }
    ],
    temperature: 0,
    text: {
      format: { type: 'text' },
      verbosity: 'low'
    }
  };

  const headers = {
    Authorization: `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json'
  };

  const rawText = await postJson(endpoint, headers, payload, Number(config.timeoutMs || 60000));
  const parsed = parseResponsesApiPayload(rawText);
  const text = stripVisionOcrWrapper(
    extractResponseText(parsed) || normalizeAssistantText(parsed?.choices?.[0]?.message?.content)
  );
  if (!text) {
    throw new Error('Vision OCR returned empty content');
  }
  return text;
}

async function ocrImagesWithVision({ images, config }) {
  if (!Array.isArray(images) || images.length === 0) return [];

  const contentImages = images.filter((url) =>
    typeof url === 'string' && (
      url.includes('spectrum/') ||
      url.includes('notes_pre_post/') ||
      url.includes('sns-webpic')
    )
  );
  if (contentImages.length === 0) return [];

  const limit = Number(config.maxImagesPerNote || contentImages.length);
  const results = [];

  for (let index = 0; index < Math.min(limit, contentImages.length); index += 1) {
    const url = contentImages[index];
    const text = cleanOcrText(await callVisionOcr({ imageUrl: url, config }));
    if (text) {
      results.push({ index, text, url });
    }
  }

  return results;
}

function buildSingleNoteExportResult({
  filepath,
  commentArchivePath = '',
  content = '',
  ocrTexts = [],
  summary = '',
  tags = [],
  commentSummary = '',
  usefulComments = []
}) {
  return {
    filepath,
    commentArchivePath,
    content,
    ocrTexts,
    summary,
    tags,
    commentSummary,
    usefulComments
  };
}

async function processSingleNoteExport({
  outputRoot,
  imagesRoot,
  note,
  configPath,
  visionConfigPath,
  conflictStrategy,
  maxTitleLength
}) {
  const projectDir = path.dirname(outputRoot);
  const config = loadOpenRouterConfig({ projectDir, configPath });
  const visionConfig = loadVisionOcrConfig({ projectDir, configPath: visionConfigPath });
  const content = cleanContent(note.content, note.title);
  const ocrTexts = await runOcrWithProvider({
    images: note.images,
    noteId: note.noteId,
    imagesRoot,
    visionConfig,
    runVisionOcr: ocrImagesWithVision,
    runTesseractOcr: ocrImages
  });

  const { summary, tags } = await getSummaryTagsWithProvider({
    note,
    content,
    ocrTexts,
    config
  });
  const usefulComments = await getUsefulComments({ comments: note.comments, config });
  const commentSummary = await summarizeUsefulComments({ usefulComments, config });
  const commentError = note.commentError || '';
  let commentArchivePath = '';
  if (Array.isArray(note.comments) && note.comments.length > 0) {
    commentArchivePath = writeCommentArchive({
      outputRoot: path.join(outputRoot, note.collection),
      noteId: note.noteId,
      noteTitle: note.title,
      comments: note.comments
    });
  }
  const filepath = writeSingleNoteMarkdown({
    outputRoot,
    note,
    content,
    ocrTexts,
    summary,
    tags,
    commentSummary,
    usefulComments,
    commentError,
    conflictStrategy,
    maxTitleLength
  });

  return buildSingleNoteExportResult({
    filepath,
    commentArchivePath,
    content,
    ocrTexts,
    summary,
    tags,
    commentSummary,
    usefulComments
  });
}

module.exports = {
  buildCommentArchivePath,
  buildNotePaths,
  cleanAuthor,
  cleanContent,
  cleanDate,
  cleanOcrText,
  downloadImage,
  generateMarkdown,
  getUsefulComments,
  getVisionOcrEndpoint,
  normalizeCommentText,
  normalizeSummaryTags,
  ocrImages,
  ocrImagesWithVision,
  processSingleNoteExport,
  renderUsefulComments,
  sanitizeFilename,
  selectUsefulComments,
  sleep,
  stripVisionOcrWrapper,
  summarizeUsefulComments,
  shouldUseVisionOcr,
  truncateText,
  writeCommentArchive,
  writeSingleNoteMarkdown
};

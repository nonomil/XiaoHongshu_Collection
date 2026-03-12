const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { createWorker } = require('tesseract.js');
const { buildAiInput, parseAiResponse, fallbackSummaryTags } = require('./ai/summary');
const { buildAccountKey, buildOutputDirs } = require('./ai/account');
const { applyOcrRules, computeOcrAnomalyScore, shouldAiCorrect } = require('./ai/ocr_postcorrect');
const { cleanTags } = require('./ai/tag_clean');
const { resolveTessdataPrefix } = require('./ai/tesseract_path');

const PROJECT_DIR = path.resolve(__dirname, '..');
const OUTPUT_ROOT = path.join(PROJECT_DIR, 'output');
const RAW_PATH = path.join(PROJECT_DIR, 'data', 'raw_notes.json');
const TESSDATA_PATH = path.join(PROJECT_DIR, 'assets', 'tesseract');
if (!process.env.TESSDATA_PREFIX || !String(process.env.TESSDATA_PREFIX).trim()) {
  process.env.TESSDATA_PREFIX = resolveTessdataPrefix('');
}

const CONFIG_PATH = path.join(PROJECT_DIR, 'config', 'openrouter.json');

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    return { _missing: true };
  }
  try {
    const rawText = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(rawText);
  } catch (e) {
    console.error(`Config parse error: ${e.message}`);
    return { _invalid: true };
  }
}

const CONFIG = loadConfig();
const OPENROUTER_API_KEY = CONFIG.apiKey || '';
const OPENROUTER_MODEL = CONFIG.model || 'openrouter/free';
const OPENROUTER_BASE_URL = CONFIG.baseUrl || 'https://openrouter.ai/api/v1';
const OPENROUTER_TIMEOUT_MS = Number(CONFIG.timeoutMs || 30000);
const AI_ENABLED = CONFIG.enabled !== false && !!OPENROUTER_API_KEY;
const OCR_POST_CORRECT = CONFIG.ocrPostCorrect !== false;
const OCR_POST_CORRECT_THRESHOLD = Number(CONFIG.ocrPostCorrectThreshold || 0.55);
const OCR_POST_CORRECT_MAX_CHARS = Number(CONFIG.ocrPostCorrectMaxChars || 1200);

const raw = JSON.parse(fs.readFileSync(RAW_PATH, 'utf-8'));

function sanitizeFilename(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().substring(0, 80);
}

function cleanAuthor(author) {
  return (author || '').replace(/关注$/, '').trim();
}

function cleanContent(content, title) {
  let text = content || '';
  if (text.startsWith(title)) text = text.substring(title.length).trim();
  text = text.replace(/\n(#[^\n]+)$/m, '').trim();
  text = text.replace(/\n(编辑于[^\n]+)$/m, '').trim();
  text = text.replace(/\n(\d{4}-\d{2}-\d{2})$/m, '').trim();
  text = text.replace(/\n{3,}/g, '\n\n');
  return text;
}

function cleanOcrText(text) {
  if (!text) return '';
  let t = text;
  // Remove spaces between CJK characters (Tesseract artifact)
  t = t.replace(/([\u4e00-\u9fff\u3000-\u303f\uff00-\uffef])\s+([\u4e00-\u9fff\u3000-\u303f\uff00-\uffef])/g, '$1$2');
  // Run twice to catch overlapping matches
  t = t.replace(/([\u4e00-\u9fff\u3000-\u303f\uff00-\uffef])\s+([\u4e00-\u9fff\u3000-\u303f\uff00-\uffef])/g, '$1$2');
  // Remove space between CJK and punctuation
  t = t.replace(/([\u4e00-\u9fff])\s+([，。；：！？”''（）「」『』【】《》])/g, '$1$2');
  t = t.replace(/([，。；：！？”''（）「」『』【】《》])\s+([\u4e00-\u9fff])/g, '$1$2');
  // Remove space between CJK and quotes/brackets
  t = t.replace(/([\u4e00-\u9fff])\s+(["“”])/g, '$1$2');
  t = t.replace(/(["“”])\s+([\u4e00-\u9fff])/g, '$1$2');
  // Keep spaces around English words (2+ chars)
  t = t.replace(/([\u4e00-\u9fff])\s+([a-zA-Z]{2,})/g, '$1 $2');
  t = t.replace(/([a-zA-Z]{2,})\s+([\u4e00-\u9fff])/g, '$1 $2');
  // Fix common OCR artifacts: standalone dots to bullet points
  t = t.replace(/^•\s*/gm, '- ');
  t = t.replace(/\n•\s*/g, '\n- ');
  // Remove stray dots at line start that aren't bullet points
  t = t.replace(/^\.+/gm, '');
  // Clean multiple spaces
  t = t.replace(/ {2,}/g, ' ');
  // Clean empty lines
  t = t.replace(/\n{3,}/g, '\n\n');
  // Trim each line
  t = t.split('\n').map(line => line.trim()).join('\n');
  return t.trim();
}

async function postCorrectOcrText(text) {
  const ruleText = applyOcrRules(text);
  if (!OCR_POST_CORRECT || !AI_ENABLED) return ruleText;

  const score = computeOcrAnomalyScore(ruleText);
  if (!shouldAiCorrect(score, OCR_POST_CORRECT_THRESHOLD)) return ruleText;

  const head = ruleText.slice(0, OCR_POST_CORRECT_MAX_CHARS);
  const tail = ruleText.slice(OCR_POST_CORRECT_MAX_CHARS);
  try {
    console.log(`    OCR post-correcting via AI (score=${score.toFixed(2)})...`);
    const correctedHead = await callOpenRouterOcrCorrection(head);
    if (!correctedHead) return ruleText;
    return correctedHead + tail;
  } catch (e) {
    console.error(`    OCR AI correction failed: ${e.message}`);
    return ruleText;
  }
}

function cleanDate(dateStr) {
  if (!dateStr) return '';
  const match = dateStr.match(/(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const match2 = dateStr.match(/(\d{2})-(\d{2})/);
  if (match2) return `2025-${match2[1]}-${match2[2]}`;
  return dateStr;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function truncateText(text, maxChars) {
  const t = text || '';
  if (t.length <= maxChars) return t;
  return t.substring(0, maxChars);
}

function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, { headers: { 'Referer': 'https://www.xiaohongshu.com/' } }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadImage(res.headers.location, filepath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const ws = fs.createWriteStream(filepath);
      res.pipe(ws);
      ws.on('finish', () => { ws.close(); resolve(filepath); });
      ws.on('error', reject);
    }).on('error', reject);
  });
}

async function ocrImages(images, imagesDir, noteId) {
  if (!images || images.length === 0) return [];

  const contentImages = images.filter(url =>
    url.includes('spectrum/') || url.includes('notes_pre_post/') || url.includes('sns-webpic')
  );
  if (contentImages.length === 0) return [];

  const worker = await createWorker('chi_sim+eng', 1, {
    langPath: TESSDATA_PATH
  });
  const results = [];

  const noteImgDir = path.join(imagesDir, noteId);
  fs.mkdirSync(noteImgDir, { recursive: true });

  for (let i = 0; i < contentImages.length; i++) {
    const url = contentImages[i];
    const ext = url.includes('.png') ? '.png' : '.jpg';
    const imgPath = path.join(noteImgDir, `img_${i}${ext}`);

    try {
      console.log(`    Downloading image ${i + 1}/${contentImages.length}...`);
      await downloadImage(url, imgPath);

      console.log(`    OCR image ${i + 1}...`);
      const { data: { text } } = await worker.recognize(imgPath);
      const cleanText = cleanOcrText(text);
      if (cleanText) {
        const correctedText = await postCorrectOcrText(cleanText);
        results.push({ index: i, text: correctedText, url });
        console.log(`    OCR result (${correctedText.length} chars): ${correctedText.substring(0, 60)}...`);
      }
    } catch (e) {
      console.error(`    Image ${i + 1} failed: ${e.message}`);
    }
  }

  await worker.terminate();
  return results;
}

function postJson(url, headers, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const target = new URL(url);
    const req = https.request({
      method: 'POST',
      protocol: target.protocol,
      hostname: target.hostname,
      path: `${target.pathname}${target.search}`,
      headers: {
        ...headers,
        'Content-Length': Buffer.byteLength(data)
      }
    }, res => {
      let rawData = '';
      res.on('data', chunk => { rawData += chunk; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 400) {
          return reject(new Error(`HTTP ${res.statusCode}: ${rawData.substring(0, 200)}`));
        }
        resolve(rawData);
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('OpenRouter request timeout'));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function callOpenRouter(input) {
  if (!AI_ENABLED) {
    throw new Error('AI disabled (config missing apiKey or enabled=false)');
  }

  const prompt = [
    '你是内容助理。请只输出 JSON，不要包含其他文字。',
    'JSON 格式：',
    '{"summary":"一句话(<=50字)","tags":["标签1","标签2","标签3"]}',
    '要求：summary 为中文一句话，tags 为 3-5 个中文名词短语。',
    '以下是内容：',
    input
  ].join('\n');

  const payload = {
    model: OPENROUTER_MODEL,
    messages: [
      { role: 'system', content: '你是一个严格的 JSON 生成器，只输出 JSON。' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.2
  };

  const endpoint = `${OPENROUTER_BASE_URL.replace(/\/$/, '')}/chat/completions`;
  const headers = {
    'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://github.com/nonomil/XiaoHongshu_Collection',
    'X-Title': 'XiaoHongshu Collection OCR Summarizer'
  };

  const rawText = await postJson(endpoint, headers, payload, OPENROUTER_TIMEOUT_MS);
  const parsed = JSON.parse(rawText);
  const content = parsed?.choices?.[0]?.message?.content || '';
  if (!content) throw new Error('OpenRouter empty response');
  return parseAiResponse(content);
}

async function callOpenRouterOcrCorrection(text) {
  if (!AI_ENABLED) {
    throw new Error('AI disabled (config missing apiKey or enabled=false)');
  }

  const prompt = [
    '你是 OCR 纠错助手。',
    '只修正明显错别字、断句、错误分词；不要扩写、不要添加新事实。',
    '尽量保留原有换行和列表结构。',
    '只输出修正后的文本本身，不要解释。',
    '',
    text
  ].join('\n');

  const payload = {
    model: OPENROUTER_MODEL,
    messages: [
      { role: 'system', content: '你是一个严格的文本纠错器，只输出修正后的文本。' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.2
  };

  const endpoint = `${OPENROUTER_BASE_URL.replace(/\/$/, '')}/chat/completions`;
  const headers = {
    'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://github.com/nonomil/XiaoHongshu_Collection',
    'X-Title': 'XiaoHongshu Collection OCR PostCorrect'
  };

  const rawText = await postJson(endpoint, headers, payload, OPENROUTER_TIMEOUT_MS);
  const parsed = JSON.parse(rawText);
  const content = parsed?.choices?.[0]?.message?.content || '';
  if (!content) throw new Error('OpenRouter empty response');
  return String(content).trim();
}

function normalizeSummaryTags(ai, fallback) {
  let summary = (ai.summary || '').replace(/\s+/g, ' ').trim();
  if (!summary) summary = fallback.summary;
  if (summary.length > 50) summary = summary.substring(0, 50);

  const combined = [...(ai.tags || []), ...(fallback.tags || [])].map(t => String(t).trim()).filter(Boolean);
  const cleaned = cleanTags(combined);
  const tags = Array.from(new Set(cleaned));
  while (tags.length < 3) tags.push('笔记');
  return { summary, tags: tags.slice(0, 5) };
}

async function getSummaryTags(note, content, ocrTexts) {
  const fallback = fallbackSummaryTags({ title: note.title, content, noteTags: note.tags });
  if (!AI_ENABLED) return fallback;

  const input = buildAiInput({
    title: note.title,
    content: truncateText(content, 1500),
    ocrTexts: (ocrTexts || []).map(o => ({ text: truncateText(o.text, 800) }))
  });

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const ai = await callOpenRouter(input);
      return normalizeSummaryTags(ai, fallback);
    } catch (e) {
      console.error(`  AI summary failed (attempt ${attempt}/${maxAttempts}): ${e.message}`);
      if (attempt === maxAttempts) return fallback;
      await sleep(500 * attempt);
    }
  }
  return fallback;
}

function generateMarkdown(note, content, ocrTexts, summary, tags) {
  const author = cleanAuthor(note.author);
  const date = cleanDate(note.date);
  const shortNote = content.length < 50;
  const sourceUrl = `https://www.xiaohongshu.com/discovery/item/${note.noteId}`;
  const safeSummary = summary || note.title || '';
  const safeTags = (tags && tags.length > 0) ? tags : ['小红书', ...(note.tags || [])];

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

  if (content) md += content + '\n';

  if (ocrTexts && ocrTexts.length > 0) {
    md += '\n---\n\n## 图片内容（OCR 识别）\n\n';
    ocrTexts.forEach((ocr) => {
      md += `### 图 ${ocr.index + 1}\n\n`;
      md += ocr.text + '\n\n';
    });
  }

  if (note.images && note.images.length > 0) {
    md += '\n---\n\n## 原始图片\n\n';
    note.images.forEach((img, i) => {
      md += `![图 ${i + 1}](${img})\n\n`;
    });
  }

  md += '\n---\n';
  md += `*来源：小红书 [@${author}](${sourceUrl})*\n`;
  return md;
}

function getAccountKeyFromNote(note) {
  if (note.accountKey) return note.accountKey;
  if (note.accountNickname || note.accountUid) {
    return buildAccountKey({ nickname: note.accountNickname, uid: note.accountUid });
  }
  return '';
}

function detectDefaultAccountKey(rawData) {
  for (const notes of Object.values(rawData.boards || {})) {
    for (const note of notes || []) {
      const key = getAccountKeyFromNote(note);
      if (key) return key;
    }
  }
  return 'unknown_000000';
}

function migrateLegacyOutputs(accountKey) {
  const { notesDir } = buildOutputDirs(OUTPUT_ROOT, accountKey);
  const legacyDirs = ['AI', '笔记'];
  if (!fs.existsSync(OUTPUT_ROOT)) return;

  for (const legacy of legacyDirs) {
    const src = path.join(OUTPUT_ROOT, legacy);
    if (!fs.existsSync(src)) continue;

    const dest = path.join(notesDir, legacy);
    if (fs.existsSync(dest)) continue;

    fs.mkdirSync(notesDir, { recursive: true });
    try {
      fs.renameSync(src, dest);
      console.log(`Migrated ${src} -> ${dest}`);
    } catch (e) {
      console.error(`Legacy migrate failed for ${src}: ${e.message}`);
    }
  }
}

async function main() {
  if (CONFIG._missing) {
    console.log('Config not found. Create config/openrouter.json to enable AI summary/tags.');
  } else if (CONFIG._invalid) {
    console.log('Config invalid. Please fix config/openrouter.json to enable AI summary/tags.');
  } else if (!AI_ENABLED) {
    console.log('AI disabled (enabled=false or apiKey missing). Using fallback summary/tags.');
  }

  const defaultAccountKey = detectDefaultAccountKey(raw);
  migrateLegacyOutputs(defaultAccountKey);

  let totalWritten = 0;
  const failedWrites = [];

  for (const [boardName, notes] of Object.entries(raw.boards)) {
    console.log(`\n=== Board: ${boardName} (${notes.length} notes) ===`);

    for (const note of notes) {
      const accountKey = getAccountKeyFromNote(note) || defaultAccountKey;
      const { notesDir, imagesDir } = buildOutputDirs(OUTPUT_ROOT, accountKey);
      const boardDir = path.join(notesDir, boardName);
      fs.mkdirSync(boardDir, { recursive: true });
      fs.mkdirSync(imagesDir, { recursive: true });

      console.log(`\n  Processing: ${note.title}`);

      let ocrTexts = [];
      try {
        ocrTexts = await ocrImages(note.images, imagesDir, note.noteId);
        console.log(`  OCR done: ${ocrTexts.length} images with text`);
      } catch (e) {
        console.error(`  OCR error: ${e.message}`);
      }

      const content = cleanContent(note.content, note.title);
      const { summary, tags } = await getSummaryTags(note, content, ocrTexts);

      const filename = sanitizeFilename(note.title || `note_${note.noteId}`) + '.md';
      const filepath = path.join(boardDir, filename);
      try {
        const md = generateMarkdown(note, content, ocrTexts, summary, tags);
        fs.writeFileSync(filepath, md, 'utf-8');
        console.log(`  Written: ${filepath}`);
        totalWritten++;
      } catch (e) {
        console.error(`  Write failed: ${e.message}`);
        failedWrites.push({ filepath, error: e.message });
      }
    }
  }

  console.log(`\nDone: ${totalWritten} files written to ${OUTPUT_ROOT}`);
  if (failedWrites.length > 0) {
    console.log(`Failed: ${failedWrites.length}`);
    const failPath = path.join(OUTPUT_ROOT, '_失败列表.md');
    const failContent = failedWrites.map(f => `- ${f.filepath}: ${f.error}`).join('\n');
    fs.writeFileSync(failPath, failContent, 'utf-8');
  }
}

main().catch(e => console.error('Fatal error:', e.message));

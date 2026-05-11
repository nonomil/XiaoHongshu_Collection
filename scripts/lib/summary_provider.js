const http = require('http');
const https = require('https');
const { buildAiInput, normalizeAiResponse, parseAiResponse, fallbackSummaryTags } = require('../ai/summary');
const { cleanTags } = require('../ai/tag_clean');
const { normalizeOpenRouterApiKey } = require('./config');

function shouldUseAiSummary(config) {
  return Boolean(
    config &&
    !config._missing &&
    !config._invalid &&
    config.enabled !== false &&
    normalizeOpenRouterApiKey(config.apiKey)
  );
}

function truncateText(text, maxChars) {
  const value = String(text || '');
  return value.length <= maxChars ? value : value.substring(0, maxChars);
}

function normalizeSummaryTags(ai, fallback) {
  let summary = String(ai?.summary || '').replace(/\s+/g, ' ').trim();
  if (!summary) summary = fallback.summary;
  if (summary.length > 50) summary = summary.substring(0, 50);

  const combined = [...(ai?.tags || []), ...(fallback.tags || [])]
    .map((tag) => String(tag).trim())
    .filter(Boolean);
  const unique = Array.from(new Set(cleanTags(combined)));
  while (unique.length < 3) unique.push('笔记');
  return { summary, tags: unique.slice(0, 5) };
}

function postJson(url, headers, body, timeoutMs) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const target = new URL(url);
    const client = target.protocol === 'http:' ? http : https;
    const request = client.request({
      method: 'POST',
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || undefined,
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

function extractOpenRouterContent(rawText) {
  const parsed = JSON.parse(rawText);
  return parsed?.choices?.[0]?.message?.content || '';
}

async function callOpenRouter({ input, config }) {
  const prompt = [
    '你是内容助理。请只输出 JSON，不要包含其他文字。',
    'JSON 格式：',
    '{"summary":"一句话(<=50字)","tags":["标签1","标签2","标签3"]}',
    '要求：summary 为中文一句话，tags 为 3-5 个中文名词短语。',
    '以下是内容：',
    input
  ].join('\n');

  const payload = {
    model: config.model || 'openrouter/free',
    messages: [
      { role: 'system', content: '你是一个严格的 JSON 生成器，只输出 JSON。' },
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
  const content = extractOpenRouterContent(rawText);
  if (!content) {
    throw new Error('OpenRouter empty response');
  }
  return parseAiResponse(content);
}

function normalizeAiPayload(payload) {
  if (typeof payload === 'string') {
    try {
      const parsed = JSON.parse(payload);
      if (parsed?.choices) {
        const content = parsed?.choices?.[0]?.message?.content || '';
        return parseAiResponse(content);
      }
    } catch (_) {
      // fall through
    }
    return parseAiResponse(payload);
  }
  if (payload && typeof payload === 'object') {
    if (payload.choices) {
      const content = payload?.choices?.[0]?.message?.content || '';
      return parseAiResponse(content);
    }
    return normalizeAiResponse(payload);
  }
  return { summary: '', tags: [] };
}

async function getSummaryTagsWithProvider({
  note,
  content,
  ocrTexts,
  config,
  callAiFn
}) {
  const fallback = fallbackSummaryTags({
    title: note.title,
    content,
    noteTags: note.tags
  });

  if (!shouldUseAiSummary(config)) return fallback;

  const input = buildAiInput({
    title: note.title,
    content: truncateText(content, 1500),
    ocrTexts: (ocrTexts || []).map((item) => ({ text: truncateText(item.text, 800) }))
  });

  try {
    const aiRaw = await (callAiFn || callOpenRouter)({ input, config });
    const parsed = normalizeAiPayload(aiRaw);
    return normalizeSummaryTags(parsed, fallback);
  } catch (_) {
    return fallback;
  }
}

module.exports = {
  getSummaryTagsWithProvider,
  normalizeSummaryTags,
  shouldUseAiSummary
};

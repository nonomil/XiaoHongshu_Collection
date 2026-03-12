function buildAiInput({ title, content, ocrTexts }) {
  const ocr = (ocrTexts || []).map(o => o.text).filter(Boolean).join('\n');
  return [
    `\u6807\u9898\uff1a${title || ''}`,
    `\u6b63\u6587\uff1a${content || ''}`,
    `OCR\uff1a${ocr || ''}`
  ].join('\n');
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

function parseAiResponse(text) {
  const direct = tryParseJson(text);
  if (direct) {
    return {
      summary: (direct.summary || '').trim(),
      tags: Array.isArray(direct.tags) ? direct.tags.map(t => String(t).trim()).filter(Boolean) : []
    };
  }

  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    const obj = tryParseJson(match[0]);
    if (obj) {
      return {
        summary: (obj.summary || '').trim(),
        tags: Array.isArray(obj.tags) ? obj.tags.map(t => String(t).trim()).filter(Boolean) : []
      };
    }
  }

  return { summary: '', tags: [] };
}

function normalizeAiResponse(payload) {
  if (typeof payload === 'string') {
    return parseAiResponse(payload);
  }
  if (payload && typeof payload === 'object') {
    return {
      summary: String(payload.summary || '').trim(),
      tags: Array.isArray(payload.tags) ? payload.tags.map(t => String(t).trim()).filter(Boolean) : []
    };
  }
  return { summary: '', tags: [] };
}

function fallbackSummaryTags({ title, content, noteTags }) {
  const base = (content || '').split('\n')[0] || title || '';
  const summary = base.substring(0, 50);
  const tags = Array.from(new Set(['\u5c0f\u7ea2\u4e66', ...(noteTags || [])]))
    .filter(Boolean)
    .slice(0, 5);
  while (tags.length < 3) tags.push('\u7b14\u8bb0');
  return { summary, tags };
}

module.exports = { buildAiInput, parseAiResponse, normalizeAiResponse, fallbackSummaryTags };

const NOTE_URL_PATTERN_SOURCE = 'https?:\\/\\/(?:www\\.)?(?:xiaohongshu\\.com\\/(?:explore|discovery\\/item)\\/[A-Za-z0-9]+(?:\\?[^\\s]*)?|xhslink\\.com\\/(?:[A-Za-z0-9]+\\/)?[A-Za-z0-9]+(?:\\?[^\\s]*)?)';

function createNoteUrlPattern(flags = 'i') {
  return new RegExp(NOTE_URL_PATTERN_SOURCE, flags);
}

function stripTrailingPunctuation(url) {
  return String(url || '').replace(/[)）】】>,，。！？；]+$/g, '');
}

function extractUrlFromText(input) {
  const text = String(input || '').trim();
  if (!text) return '';
  const match = text.match(createNoteUrlPattern('i'));
  return match ? stripTrailingPunctuation(match[0]) : '';
}

function extractUrlsFromText(input) {
  const text = String(input || '').trim();
  if (!text) return [];

  const matches = text.match(createNoteUrlPattern('ig')) || [];
  return matches
    .map((url) => stripTrailingPunctuation(url))
    .filter(Boolean);
}

function extractNoteId(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  const match = value.match(/xiaohongshu\.com\/(?:explore|discovery\/item)\/([A-Za-z0-9]+)/i);
  return match ? match[1] : '';
}

function buildNormalizedNoteInput({ input, extractedUrl, sourceType }) {
  const rawInput = String(input || '').trim();
  const url = stripTrailingPunctuation(extractedUrl || rawInput);
  const noteId = extractNoteId(url);

  if (!noteId) {
    throw new Error('Unsupported note input: expected a Xiaohongshu note URL or share text');
  }

  return {
    input: rawInput,
    sourceType,
    extractedUrl: url,
    noteId,
    canonicalUrl: `https://www.xiaohongshu.com/discovery/item/${noteId}`
  };
}

function normalizeNoteInput(input) {
  const rawInput = String(input || '').trim();
  const extractedUrl = extractUrlFromText(rawInput);
  const url = extractedUrl || rawInput;
  return buildNormalizedNoteInput({
    input: rawInput,
    extractedUrl: url,
    sourceType: extractedUrl && extractedUrl !== rawInput ? 'share_text' : 'url'
  });
}

function normalizeNoteInputs(input) {
  const rawInput = String(input || '').trim();
  const extractedUrls = extractUrlsFromText(rawInput);
  if (extractedUrls.length === 0) {
    return [normalizeNoteInput(rawInput)];
  }

  const sourceType = extractedUrls.length === 1 && extractedUrls[0] === rawInput ? 'url' : 'share_text';
  const seen = new Set();
  const results = [];

  for (const url of extractedUrls) {
    const noteId = extractNoteId(url);
    const normalized = noteId
      ? buildNormalizedNoteInput({
        input: url,
        extractedUrl: url,
        sourceType
      })
      : {
        input: url,
        sourceType,
        extractedUrl: url,
        noteId: '',
        canonicalUrl: url
      };

    const dedupeKey = normalized.noteId
      ? `note:${normalized.noteId}`
      : `url:${normalized.extractedUrl.toLowerCase()}`;

    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    results.push(normalized);
  }

  return results;
}

module.exports = {
  extractUrlFromText,
  extractUrlsFromText,
  extractNoteId,
  normalizeNoteInput,
  normalizeNoteInputs
};

function normalizeString(value) {
  return String(value || '').trim();
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeString(item))
    .filter(Boolean);
}

function normalizeArticlePayload(input = {}) {
  const sourceUrl = normalizeString(input.sourceUrl);
  const canonicalUrl = normalizeString(input.canonicalUrl) || sourceUrl;

  return {
    platform: normalizeString(input.platform),
    sourceType: normalizeString(input.sourceType),
    sourceUrl,
    canonicalUrl,
    title: normalizeString(input.title),
    author: normalizeString(input.author),
    authorLink: normalizeString(input.authorLink),
    date: normalizeString(input.date),
    tags: normalizeStringArray(input.tags),
    content: normalizeString(input.content),
    images: normalizeStringArray(input.images),
    comments: [],
    commentTotal: 0,
    commentError: '',
    commentWarningCode: '',
    collection: normalizeString(input.collection)
  };
}

module.exports = {
  normalizeArticlePayload
};

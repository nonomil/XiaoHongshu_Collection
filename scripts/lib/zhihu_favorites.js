const fs = require('fs');
const path = require('path');
const { detectSourceFromUrl } = require('./source_detector');

function safeUrl(input) {
  try {
    return new URL(String(input || '').trim());
  } catch (_) {
    return null;
  }
}

function parseZhihuCollectionId(input) {
  const url = safeUrl(input);
  const match = url?.pathname?.match(/^\/collection\/(\d+)/);
  if (!match) {
    throw new Error('Unsupported Zhihu favorites URL');
  }
  return match[1];
}

function buildZhihuCollectionApiUrl({
  collectionId,
  offset = 0,
  limit = 20
}) {
  const normalized_collection_id = String(collectionId || '').trim();
  const normalized_offset = Math.max(0, Number(offset || 0) || 0);
  const normalized_limit = Math.max(1, Number(limit || 20) || 20);
  return `https://www.zhihu.com/api/v4/collections/${normalized_collection_id}/items?offset=${normalized_offset}&limit=${normalized_limit}`;
}

function sanitizeCollectionTitle(value) {
  const normalized = String(value || '')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || '未命名收藏夹';
}

function buildZhihuFavoritesPaths({
  outputRoot,
  collectionId,
  collectionTitle
}) {
  const title = sanitizeCollectionTitle(collectionTitle);
  const favoritesRoot = path.join(String(outputRoot || '').trim(), '知乎收藏夹');
  const rootDir = path.join(favoritesRoot, title);
  const stateDir = path.join(rootDir, '_state');
  const progressPath = path.join(stateDir, `export-progress-${String(collectionId || '').trim()}.json`);

  return {
    favoritesRoot,
    rootDir,
    stateDir,
    progressPath,
    collectionId: String(collectionId || '').trim(),
    collectionTitle: title
  };
}

function normalizeProgress(progress = {}) {
  const exportedIds = Array.from(
    new Set(
      (Array.isArray(progress.exportedIds) ? progress.exportedIds : [])
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  );

  return {
    collectionId: String(progress.collectionId || '').trim(),
    nextOffset: Math.max(0, Number(progress.nextOffset || 0) || 0),
    exportedIds,
    completed: progress.completed === true,
    warnings: (Array.isArray(progress.warnings) ? progress.warnings : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  };
}

function readZhihuFavoritesProgress(progressPath) {
  if (!fs.existsSync(progressPath)) {
    return normalizeProgress();
  }

  try {
    const raw = fs.readFileSync(progressPath, 'utf-8');
    return normalizeProgress(JSON.parse(raw));
  } catch (_) {
    return normalizeProgress();
  }
}

function writeZhihuFavoritesProgress(progressPath, progress = {}) {
  const normalized = normalizeProgress(progress);
  fs.mkdirSync(path.dirname(progressPath), { recursive: true });
  fs.writeFileSync(progressPath, JSON.stringify(normalized, null, 2), 'utf-8');
  return normalized;
}

function normalizeFavoriteEntry(item = {}) {
  const id = String(item.id || item.itemId || '').trim();
  const url = String(item.url || item.targetUrl || '').trim();

  if (!id) {
    return {
      error: 'missing favorite item id'
    };
  }

  if (!url) {
    return {
      error: `favorite item ${id} is missing url`
    };
  }

  const source_type = detectSourceFromUrl(url);
  if (source_type !== 'zhihu_article' && source_type !== 'zhihu_answer') {
    return {
      error: `favorite item ${id} has unsupported url: ${url}`
    };
  }

  return {
    entry: {
      id,
      url,
      sourceType: source_type
    }
  };
}

function normalizeZhihuCollectionPage(payload = {}) {
  const paging = payload?.paging || {};
  const next_url = String(paging.next || '').trim().replace(/^http:\/\//, 'https://');
  const next_match = next_url.match(/[?&]offset=(\d+)/);
  const next_offset = next_match ? Number(next_match[1]) : 0;
  const items = (Array.isArray(payload?.data) ? payload.data : []).map((item) => {
    const content = item?.content || {};
    return {
      id: String(content.id || '').trim(),
      type: String(content.type || '').trim(),
      url: String(content.url || '').trim(),
      title: String(
        content.title ||
        content.question?.title ||
        ''
      ).trim(),
      createdTime: Number(item?.created_time || content?.created_time || 0) || 0
    };
  });

  return {
    items,
    hasMore: paging.is_end !== true,
    nextOffset: next_offset,
    totals: Number(paging.totals || 0) || 0
  };
}

async function collectZhihuFavoriteEntries({
  collectionId,
  progress,
  progressPath,
  fetchPageFn,
  paceFn,
  limit = 20,
  continueOnPageError = false
} = {}) {
  if (typeof fetchPageFn !== 'function') {
    throw new Error('collectZhihuFavoriteEntries requires fetchPageFn');
  }

  const base_progress = progress || (progressPath ? readZhihuFavoritesProgress(progressPath) : {});
  const normalized_progress = normalizeProgress({
    collectionId,
    ...(base_progress || {})
  });
  const seen_ids = new Set(normalized_progress.exportedIds);
  const warnings = [...normalized_progress.warnings];
  const entries = [];
  let offset = normalized_progress.nextOffset;
  let has_more = true;

  const persistProgress = (overrides = {}) => {
    const next_progress = normalizeProgress({
      ...normalized_progress,
      nextOffset: offset,
      exportedIds: Array.from(seen_ids),
      completed: has_more === false,
      warnings,
      ...overrides
    });

    if (progressPath) {
      writeZhihuFavoritesProgress(progressPath, next_progress);
    }

    return next_progress;
  };

  while (has_more) {
    let page;
    try {
      page = await fetchPageFn({
        collectionId: normalized_progress.collectionId,
        offset,
        limit
      });
    } catch (error) {
      warnings.push(`failed to fetch favorites page at offset ${offset}: ${error.message}`);
      if (!continueOnPageError) {
        break;
      }
      offset += limit;
      continue;
    }

    const normalized_page = Array.isArray(page?.items)
      ? {
          items: page.items,
          hasMore: page?.hasMore === true,
          nextOffset: Number(page?.nextOffset || 0) || 0,
          totals: Number(page?.totals || 0) || 0
        }
      : normalizeZhihuCollectionPage(page);
    const items = Array.isArray(normalized_page.items) ? normalized_page.items : [];
    for (const item of items) {
      const normalized_entry = normalizeFavoriteEntry(item);
      if (normalized_entry.error) {
        warnings.push(normalized_entry.error);
        continue;
      }
      if (seen_ids.has(normalized_entry.entry.id)) {
        continue;
      }
      seen_ids.add(normalized_entry.entry.id);
      entries.push(normalized_entry.entry);
    }

    const next_offset = Math.max(offset + limit, Number(normalized_page.nextOffset || 0) || 0);
    has_more = normalized_page.hasMore === true;
    offset = next_offset;

    if (has_more && typeof paceFn === 'function') {
      await paceFn({
        collectionId: normalized_progress.collectionId,
        offset: offset - limit,
        nextOffset: next_offset,
        limit
      });
    }

    persistProgress();
  }

  return {
    entries,
    warnings,
    progress: persistProgress()
  };
}

module.exports = {
  buildZhihuCollectionApiUrl,
  buildZhihuFavoritesPaths,
  collectZhihuFavoriteEntries,
  normalizeZhihuCollectionPage,
  parseZhihuCollectionId,
  readZhihuFavoritesProgress,
  sanitizeCollectionTitle,
  writeZhihuFavoritesProgress
};

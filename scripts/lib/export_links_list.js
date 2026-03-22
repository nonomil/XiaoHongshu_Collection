const fs = require('fs');
const path = require('path');

function normalizeAbsolutePath(candidate, projectDir) {
  const value = String(candidate || '').trim();
  if (!value) return '';
  return path.normalize(path.isAbsolute(value) ? value : path.resolve(projectDir, value));
}

function deriveResultGroupKey(item = {}) {
  if (!item || item.status === 'failed') return 'failure';

  const explicit = String(item.collection || item.finalCollection || '').trim();
  if (explicit) return explicit;

  const filepath = String(item.filepath || '').trim();
  if (!filepath) return '未分类';

  const parts = filepath.split(/[/\\]+/).filter(Boolean);
  if (parts.length < 2) return '未分类';
  return parts[parts.length - 2] || '未分类';
}

function resolveResultLink(item = {}) {
  return [item.input, item.navigationUrl, item.canonicalUrl, item.sourceUrl, item.url]
    .map((value) => String(value || '').trim())
    .find(Boolean) || '';
}

function collectUniqueResultLinks(items = []) {
  const links = [];
  const seen = new Set();

  items.forEach((item) => {
    const candidate = resolveResultLink(item);
    if (!candidate || seen.has(candidate)) return;
    seen.add(candidate);
    links.push(candidate);
  });

  return links;
}

function sanitizeFileSegment(value, fallback = 'group') {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  const cleaned = raw.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').replace(/\s+/g, '-');
  return cleaned || fallback;
}

function buildTimestamp(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

function resolveLinksListRoot({ uiConfig, projectDir, defaultOutputDir } = {}) {
  const configRoot = normalizeAbsolutePath(uiConfig?.paths?.saveLinksOutputRoot, projectDir || process.cwd());
  if (configRoot) {
    return path.join(configRoot, '_lists');
  }
  return path.join(normalizeAbsolutePath(defaultOutputDir, projectDir || process.cwd()), '_lists');
}

function exportLinksList({
  report,
  groupKey,
  uiConfig,
  projectDir,
  defaultOutputDir,
  now = new Date()
} = {}) {
  const results = Array.isArray(report?.results) ? report.results : [];
  const matchedItems = results.filter((item) => deriveResultGroupKey(item) === groupKey);
  const links = collectUniqueResultLinks(matchedItems);

  if (links.length === 0) {
    throw new Error('当前分组没有可导出的链接');
  }

  const listRoot = resolveLinksListRoot({
    uiConfig,
    projectDir,
    defaultOutputDir
  });
  fs.mkdirSync(listRoot, { recursive: true });

  const filename = `${buildTimestamp(now)}-${sanitizeFileSegment(groupKey, 'group')}-links.txt`;
  const filePath = path.join(listRoot, filename);
  fs.writeFileSync(filePath, `${links.join('\n')}\n`, 'utf-8');

  return {
    filePath: path.normalize(filePath),
    count: links.length,
    groupKey: String(groupKey || '')
  };
}

module.exports = {
  collectUniqueResultLinks,
  deriveResultGroupKey,
  exportLinksList,
  resolveResultLink
};

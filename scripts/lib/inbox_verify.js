const fs = require('fs');
const path = require('path');

function readInboxItems(inboxPath) {
  if (!inboxPath || !fs.existsSync(inboxPath)) {
    return [];
  }

  return String(fs.readFileSync(inboxPath, 'utf-8') || '')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean);
}

function isVerificationCandidateUrl(url) {
  const value = String(url || '').trim();
  return value.includes('mp.weixin.qq.com') || value.includes('zhihu.com');
}

function selectRecentCandidateUrls(items = [], limit = 50) {
  const normalizedLimit = Math.max(1, Number(limit || 50) || 50);
  const seen = new Set();
  const selected = [];
  const recentItems = Array.isArray(items) ? items.slice(-normalizedLimit) : [];

  for (const item of recentItems) {
    const url = String(item?.url || '').trim();
    if (!url || seen.has(url) || !isVerificationCandidateUrl(url)) continue;
    seen.add(url);
    selected.push(url);
  }

  return selected;
}

function walkMarkdownFiles(rootDir) {
  const results = [];
  if (!rootDir || !fs.existsSync(rootDir)) {
    return results;
  }

  const stack = [path.resolve(rootDir)];
  while (stack.length > 0) {
    const current = stack.pop();
    const stat = fs.statSync(current);
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(current);
      for (const entry of entries) {
        stack.push(path.join(current, entry));
      }
      continue;
    }

    if (path.extname(current).toLowerCase() === '.md') {
      results.push(current);
    }
  }

  return results;
}

function readMarkdownEntries(outputRoot) {
  return walkMarkdownFiles(outputRoot).map((filepath) => ({
    filepath,
    text: fs.readFileSync(filepath, 'utf-8')
  }));
}

function isTotalLibraryPath(filepath) {
  return String(filepath || '')
    .split(/[\\/]/)
    .includes('全部');
}

function buildInboxVerificationReport({
  urls = [],
  markdownEntries = []
} = {}) {
  const report = [];

  for (const url of Array.isArray(urls) ? urls : []) {
    const normalizedUrl = String(url || '').trim();
    if (!normalizedUrl) continue;

    const matches = [];
    for (const entry of Array.isArray(markdownEntries) ? markdownEntries : []) {
      const text = String(entry?.text || '');
      if (!text.includes(normalizedUrl)) continue;
      matches.push(String(entry?.filepath || '').trim());
    }

    const hasTotal = matches.some((filepath) => isTotalLibraryPath(filepath));
    const hasClassified = matches.some((filepath) => !isTotalLibraryPath(filepath));
    report.push({
      url: normalizedUrl,
      matchCount: matches.length,
      hasTotal,
      hasClassified,
      paths: matches
    });
  }

  return {
    summary: {
      candidateCount: report.length,
      okBoth: report.filter((item) => item.hasTotal && item.hasClassified).length,
      missingTotal: report.filter((item) => !item.hasTotal).map((item) => item.url),
      missingClassified: report.filter((item) => !item.hasClassified).map((item) => item.url)
    },
    report
  };
}

async function verifyRecentInboxCopies({
  inboxPath,
  outputRoot,
  limit = 50
} = {}) {
  const urls = selectRecentCandidateUrls(readInboxItems(inboxPath), limit);
  return buildInboxVerificationReport({
    urls,
    markdownEntries: readMarkdownEntries(outputRoot)
  });
}

module.exports = {
  buildInboxVerificationReport,
  isVerificationCandidateUrl,
  readInboxItems,
  readMarkdownEntries,
  selectRecentCandidateUrls,
  verifyRecentInboxCopies
};

const fs = require('fs');
const path = require('path');

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function resolveInboxTimestampDate(timestamp, now = new Date()) {
  const normalizedNow = now instanceof Date ? now : new Date();
  const raw = Number(timestamp);
  if (!Number.isFinite(raw) || raw <= 0) {
    return new Date(normalizedNow.getTime());
  }
  const millis = raw > 1e12 ? raw : raw * 1000;
  return new Date(millis);
}

function formatInboxBucketParts(timestamp, now = new Date()) {
  const date = resolveInboxTimestampDate(timestamp, now);
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return {
    year,
    yearMonth: `${year}-${month}`
  };
}

function resolveInboxArchivePath(archiveRoot, item, now = new Date()) {
  if (!archiveRoot) return '';
  const { year, yearMonth } = formatInboxBucketParts(item?.timestamp, now);
  return path.join(archiveRoot, year, `${yearMonth}.jsonl`);
}

function readJsonLines(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf-8');
  if (!raw.trim()) return [];
  return raw
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        return null;
      }
    })
    .filter(Boolean);
}

function createInboxStore({ filePath, archiveRoot, now } = {}) {
  if (!filePath) {
    throw new Error('filePath is required');
  }

  return {
    async readAll() {
      return readJsonLines(filePath);
    },
    async append(items = []) {
      const existing = readJsonLines(filePath);
      const seen = new Set(existing.map((item) => item.url).filter(Boolean));
      const toAppend = [];
      let added = 0;
      let skipped = 0;

      for (const item of items) {
        if (!item || !item.url) {
          skipped += 1;
          continue;
        }
        const url = String(item.url).trim();
        if (!url || seen.has(url)) {
          skipped += 1;
          continue;
        }
        seen.add(url);
        added += 1;
        toAppend.push({ ...item, url });
      }

      if (toAppend.length > 0) {
        ensureDir(filePath);
        const lines = toAppend.map((item) => JSON.stringify(item)).join('\n') + '\n';
        fs.appendFileSync(filePath, lines, 'utf-8');

        if (archiveRoot) {
          const bucketMap = new Map();
          for (const item of toAppend) {
            const archivePath = resolveInboxArchivePath(archiveRoot, item, now);
            if (!archivePath) continue;
            if (!bucketMap.has(archivePath)) {
              bucketMap.set(archivePath, []);
            }
            bucketMap.get(archivePath).push(item);
          }

          for (const [archivePath, bucketItems] of bucketMap.entries()) {
            ensureDir(archivePath);
            const archiveLines = bucketItems.map((item) => JSON.stringify(item)).join('\n') + '\n';
            fs.appendFileSync(archivePath, archiveLines, 'utf-8');
          }
        }
      }

      return { added, skipped };
    }
  };
}

module.exports = {
  createInboxStore,
  formatInboxBucketParts,
  resolveInboxArchivePath,
  resolveInboxTimestampDate
};

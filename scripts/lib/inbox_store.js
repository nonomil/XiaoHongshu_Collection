const fs = require('fs');
const path = require('path');

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
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

function createInboxStore({ filePath }) {
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
      }

      return { added, skipped };
    }
  };
}

module.exports = {
  createInboxStore
};

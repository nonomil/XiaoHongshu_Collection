const fs = require('fs');
const path = require('path');

function stripBom(text) {
  return String(text || '').replace(/^\uFEFF/, '');
}

function stripFrontmatter(text) {
  const value = stripBom(text).trimStart();
  if (!value.startsWith('---')) return stripBom(text);
  const endIndex = value.indexOf('\n---', 3);
  if (endIndex === -1) return stripBom(text);
  const rest = value.slice(endIndex + '\n---'.length);
  return rest.replace(/^\s+/, '');
}

function isSameBody(existing, nextMarkdown) {
  return stripFrontmatter(existing).trim() === stripFrontmatter(nextMarkdown).trim();
}

function resolveMarkdownConflict({ filepath, nextMarkdown }) {
  if (!fs.existsSync(filepath)) return filepath;
  const current = fs.readFileSync(filepath, 'utf-8');
  if (isSameBody(current, nextMarkdown)) return filepath;

  const ext = path.extname(filepath);
  const base = filepath.slice(0, -ext.length);
  let index = 1;
  while (true) {
    const candidate = `${base}-${index}${ext}`;
    if (!fs.existsSync(candidate)) return candidate;
    const existing = fs.readFileSync(candidate, 'utf-8');
    if (isSameBody(existing, nextMarkdown)) return candidate;
    index += 1;
  }
}

module.exports = {
  stripFrontmatter,
  isSameBody,
  resolveMarkdownConflict
};

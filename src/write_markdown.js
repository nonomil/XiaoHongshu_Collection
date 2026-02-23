const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = 'D:/Obsidian/小红书收藏';
const RAW_PATH = 'G:/UserCode/XiaoHongshu_Collection/output/raw_notes.json';

const raw = JSON.parse(fs.readFileSync(RAW_PATH, 'utf-8'));

function sanitizeFilename(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().substring(0, 80);
}

function cleanAuthor(author) {
  return (author || '').replace(/关注$/, '').trim();
}

function cleanContent(content, title) {
  let text = content || '';
  // Remove title from beginning of content if duplicated
  if (text.startsWith(title)) {
    text = text.substring(title.length).trim();
  }
  // Remove tag lines like #xxx #yyy from the end
  text = text.replace(/\n(#[^\n]+)$/m, '').trim();
  // Remove date lines at the end like "编辑于 02-15 上海" or "2025-12-07"
  text = text.replace(/\n(编辑于[^\n]+)$/m, '').trim();
  text = text.replace(/\n(\d{4}-\d{2}-\d{2})$/m, '').trim();
  // Clean excessive blank lines
  text = text.replace(/\n{3,}/g, '\n\n');
  return text;
}

function cleanDate(dateStr) {
  if (!dateStr) return '';
  const match = dateStr.match(/(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const match2 = dateStr.match(/(\d{2})-(\d{2})/);
  if (match2) return `2025-${match2[1]}-${match2[2]}`;
  return dateStr;
}

function generateSummary(title, content) {
  const text = (content || '').substring(0, 100);
  if (text.length < 30) return title;
  return text.split('\n')[0].substring(0, 80);
}

function generateMarkdown(note) {
  const author = cleanAuthor(note.author);
  const content = cleanContent(note.content, note.title);
  const date = cleanDate(note.date);
  const summary = generateSummary(note.title, content);
  const shortNote = content.length < 50;
  const tags = ['小红书', ...note.tags];
  const noteUrl = note.noteUrl.split('?')[0];
  const sourceUrl = `https://www.xiaohongshu.com/discovery/item/${note.noteId}`;

  let md = '---\n';
  md += `title: "${note.title}"\n`;
  md += `source: "${sourceUrl}"\n`;
  md += `author: "${author}"\n`;
  md += `collection: "${note.collection}"\n`;
  md += `saved_date: "${date}"\n`;
  md += `summary: "${summary}"\n`;
  md += `tags: [${tags.map(t => t).join(', ')}]\n`;
  md += `short_note: ${shortNote}\n`;
  md += '---\n\n';
  md += content + '\n';

  if (note.images && note.images.length > 0) {
    md += '\n---\n\n';
    md += '## 图片\n\n';
    note.images.forEach((img, i) => {
      md += `![图${i + 1}](${img})\n\n`;
    });
  }

  md += '\n---\n';
  md += `*来源：小红书 [@${author}](${note.authorLink || noteUrl})*\n`;

  return md;
}

// Create directories and write files
let totalWritten = 0;
const failedWrites = [];

for (const [boardName, notes] of Object.entries(raw.boards)) {
  const boardDir = path.join(OUTPUT_DIR, boardName);
  fs.mkdirSync(boardDir, { recursive: true });

  for (const note of notes) {
    const filename = sanitizeFilename(note.title || `note_${note.noteId}`) + '.md';
    const filepath = path.join(boardDir, filename);
    try {
      const md = generateMarkdown(note);
      fs.writeFileSync(filepath, md, 'utf-8');
      console.log(`OK: ${filepath}`);
      totalWritten++;
    } catch (e) {
      console.error(`FAIL: ${filepath} - ${e.message}`);
      failedWrites.push({ filepath, error: e.message });
    }
  }
}

console.log(`\nDone: ${totalWritten} files written to ${OUTPUT_DIR}`);
if (failedWrites.length > 0) {
  console.log(`Failed: ${failedWrites.length}`);
  const failPath = path.join(OUTPUT_DIR, '_失败列表.md');
  const failContent = failedWrites.map(f => `- ${f.filepath}: ${f.error}`).join('\n');
  fs.writeFileSync(failPath, failContent, 'utf-8');
}

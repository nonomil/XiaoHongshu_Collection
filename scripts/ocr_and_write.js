const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { createWorker } = require('tesseract.js');

const PROJECT_DIR = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(PROJECT_DIR, 'output');
const IMG_DIR = path.join(OUTPUT_DIR, '_images');
const RAW_PATH = path.join(PROJECT_DIR, 'data', 'raw_notes.json');

const raw = JSON.parse(fs.readFileSync(RAW_PATH, 'utf-8'));

function sanitizeFilename(name) {
  return name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim().substring(0, 80);
}

function cleanAuthor(author) {
  return (author || '').replace(/关注$/, '').trim();
}

function cleanContent(content, title) {
  let text = content || '';
  if (text.startsWith(title)) text = text.substring(title.length).trim();
  text = text.replace(/\n(#[^\n]+)$/m, '').trim();
  text = text.replace(/\n(编辑于[^\n]+)$/m, '').trim();
  text = text.replace(/\n(\d{4}-\d{2}-\d{2})$/m, '').trim();
  text = text.replace(/\n{3,}/g, '\n\n');
  return text;
}

function cleanOcrText(text) {
  if (!text) return '';
  let t = text;
  // Remove spaces between CJK characters (Tesseract artifact)
  t = t.replace(/([\u4e00-\u9fff\u3000-\u303f\uff00-\uffef])\s+([\u4e00-\u9fff\u3000-\u303f\uff00-\uffef])/g, '$1$2');
  // Run twice to catch overlapping matches
  t = t.replace(/([\u4e00-\u9fff\u3000-\u303f\uff00-\uffef])\s+([\u4e00-\u9fff\u3000-\u303f\uff00-\uffef])/g, '$1$2');
  // Remove space between CJK and punctuation
  t = t.replace(/([\u4e00-\u9fff])\s+([，。、；：！？""''（）《》【】])/g, '$1$2');
  t = t.replace(/([，。、；：！？""''（）《》【】])\s+([\u4e00-\u9fff])/g, '$1$2');
  // Remove space between CJK and quotes/brackets
  t = t.replace(/([\u4e00-\u9fff])\s+([""「」])/g, '$1$2');
  t = t.replace(/([""「」])\s+([\u4e00-\u9fff])/g, '$1$2');
  // Clean up: CJK followed by single latin char then CJK (likely OCR noise)
  // Keep spaces around English words (2+ chars)
  t = t.replace(/([\u4e00-\u9fff])\s+([a-zA-Z]{2,})/g, '$1 $2');
  t = t.replace(/([a-zA-Z]{2,})\s+([\u4e00-\u9fff])/g, '$1 $2');
  // Remove single-char latin surrounded by CJK (likely OCR error)
  // Fix common OCR artifacts: standalone dots to bullet points
  t = t.replace(/^。\s*/gm, '- ');
  t = t.replace(/\n。\s*/g, '\n- ');
  // Don't blindly replace all dots - only isolated ones between CJK
  // Remove stray dots at line start that aren't bullet points
  t = t.replace(/^。/gm, '');
  // Fix double periods
  t = t.replace(/。。+/g, '。');
  // Clean multiple spaces
  t = t.replace(/ {2,}/g, ' ');
  // Clean empty lines
  t = t.replace(/\n{3,}/g, '\n\n');
  // Trim each line
  t = t.split('\n').map(line => line.trim()).join('\n');
  return t.trim();
}

function cleanDate(dateStr) {
  if (!dateStr) return '';
  const match = dateStr.match(/(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const match2 = dateStr.match(/(\d{2})-(\d{2})/);
  if (match2) return `2025-${match2[1]}-${match2[2]}`;
  return dateStr;
}

function downloadImage(url, filepath) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    client.get(url, { headers: { 'Referer': 'https://www.xiaohongshu.com/' } }, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadImage(res.headers.location, filepath).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const ws = fs.createWriteStream(filepath);
      res.pipe(ws);
      ws.on('finish', () => { ws.close(); resolve(filepath); });
      ws.on('error', reject);
    }).on('error', reject);
  });
}

async function ocrImages(images, noteId) {
  if (!images || images.length === 0) return [];

  // Filter out non-content images (icons, avatars, etc.)
  const contentImages = images.filter(url =>
    url.includes('spectrum/') || url.includes('notes_pre_post/') || url.includes('sns-webpic')
  );
  if (contentImages.length === 0) return [];

  const worker = await createWorker('chi_sim+eng');
  const results = [];

  const noteImgDir = path.join(IMG_DIR, noteId);
  fs.mkdirSync(noteImgDir, { recursive: true });

  for (let i = 0; i < contentImages.length; i++) {
    const url = contentImages[i];
    const ext = url.includes('.png') ? '.png' : '.jpg';
    const imgPath = path.join(noteImgDir, `img_${i}${ext}`);

    try {
      console.log(`    Downloading image ${i + 1}/${contentImages.length}...`);
      await downloadImage(url, imgPath);

      console.log(`    OCR image ${i + 1}...`);
      const { data: { text } } = await worker.recognize(imgPath);
      const cleanText = cleanOcrText(text);
      if (cleanText) {
        results.push({ index: i, text: cleanText, url });
        console.log(`    OCR result (${cleanText.length} chars): ${cleanText.substring(0, 60)}...`);
      }
    } catch (e) {
      console.error(`    Image ${i + 1} failed: ${e.message}`);
    }
  }

  await worker.terminate();
  return results;
}

function generateMarkdown(note, ocrTexts) {
  const author = cleanAuthor(note.author);
  const content = cleanContent(note.content, note.title);
  const date = cleanDate(note.date);
  const shortNote = content.length < 50;
  const tags = ['小红书', ...note.tags];
  const sourceUrl = `https://www.xiaohongshu.com/discovery/item/${note.noteId}`;
  const summary = (content || '').split('\n')[0].substring(0, 80) || note.title;

  let md = '---\n';
  md += `title: "${note.title}"\n`;
  md += `source: "${sourceUrl}"\n`;
  md += `author: "${author}"\n`;
  md += `collection: "${note.collection}"\n`;
  md += `saved_date: "${date}"\n`;
  md += `summary: "${summary}"\n`;
  md += `tags: [${tags.join(', ')}]\n`;
  md += `short_note: ${shortNote}\n`;
  md += '---\n\n';

  if (content) md += content + '\n';

  // Add OCR text from images
  if (ocrTexts && ocrTexts.length > 0) {
    md += '\n---\n\n## 图片内容（OCR 识别）\n\n';
    ocrTexts.forEach((ocr, i) => {
      md += `### 图 ${ocr.index + 1}\n\n`;
      md += ocr.text + '\n\n';
    });
  }

  // Image links
  if (note.images && note.images.length > 0) {
    md += '\n---\n\n## 原始图片\n\n';
    note.images.forEach((img, i) => {
      md += `![图${i + 1}](${img})\n\n`;
    });
  }

  md += '\n---\n';
  md += `*来源：小红书 [@${author}](${sourceUrl})*\n`;
  return md;
}

async function main() {
  fs.mkdirSync(IMG_DIR, { recursive: true });

  let totalWritten = 0;
  const failedWrites = [];

  for (const [boardName, notes] of Object.entries(raw.boards)) {
    const boardDir = path.join(OUTPUT_DIR, boardName);
    fs.mkdirSync(boardDir, { recursive: true });

    console.log(`\n=== Board: ${boardName} (${notes.length} notes) ===`);

    for (const note of notes) {
      console.log(`\n  Processing: ${note.title}`);

      // Run OCR on images
      let ocrTexts = [];
      try {
        ocrTexts = await ocrImages(note.images, note.noteId);
        console.log(`  OCR done: ${ocrTexts.length} images with text`);
      } catch (e) {
        console.error(`  OCR error: ${e.message}`);
      }

      // Write markdown
      const filename = sanitizeFilename(note.title || `note_${note.noteId}`) + '.md';
      const filepath = path.join(boardDir, filename);
      try {
        const md = generateMarkdown(note, ocrTexts);
        fs.writeFileSync(filepath, md, 'utf-8');
        console.log(`  Written: ${filepath}`);
        totalWritten++;
      } catch (e) {
        console.error(`  Write failed: ${e.message}`);
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
}

main().catch(e => console.error('Fatal error:', e.message));

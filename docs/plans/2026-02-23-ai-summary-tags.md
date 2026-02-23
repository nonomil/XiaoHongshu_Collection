# AI Summary/Tags (OpenRouter) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 `ocr_and_write.js` 的现有导出流程中，基于“正文 + OCR 文本”自动生成摘要与标签并写回 frontmatter。

**Architecture:** 在 OCR 完成后调用 OpenRouter，返回结构化 JSON（summary/tags）。失败时降级为本地规则摘要与标签。只改写入阶段，不触碰抓取与 OCR 逻辑。

**Tech Stack:** Node.js, https 模块, tesseract.js（已存在）

---

### Task 1: 添加可测试的 AI 辅助模块

**Files:**
- Create: `src/ai/summary.js`
- Create: `src/ai/__tests__/summary.test.js`

**Step 1: Write the failing test**

```js
// src/ai/__tests__/summary.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { buildAiInput, parseAiResponse, fallbackSummaryTags } = require('../summary');

test('buildAiInput includes title, content, and OCR text', () => {
  const input = buildAiInput({
    title: '标题',
    content: '正文内容',
    ocrTexts: [{ text: '图片文字' }]
  });
  assert.ok(input.includes('标题'));
  assert.ok(input.includes('正文内容'));
  assert.ok(input.includes('图片文字'));
});

test('parseAiResponse accepts valid JSON', () => {
  const out = parseAiResponse('{"summary":"一句话","tags":["标签1","标签2","标签3"]}');
  assert.equal(out.summary, '一句话');
  assert.equal(out.tags.length, 3);
});

test('fallbackSummaryTags enforces summary length and tag count', () => {
  const out = fallbackSummaryTags({ title: '标题', content: '正文内容'.repeat(30), noteTags: ['已有标签'] });
  assert.ok(out.summary.length <= 50);
  assert.ok(out.tags.length >= 3 && out.tags.length <= 5);
});
```

**Step 2: Run test to verify it fails**

Run: `node --test src/ai/__tests__/summary.test.js`
Expected: FAIL with "Cannot find module '../summary'"

**Step 3: Write minimal implementation**

```js
// src/ai/summary.js
function buildAiInput({ title, content, ocrTexts }) {
  const ocr = (ocrTexts || []).map(o => o.text).filter(Boolean).join('\n');
  return [
    `标题：${title || ''}`,
    `正文：${content || ''}`,
    `OCR：${ocr || ''}`
  ].join('\n');
}

function parseAiResponse(text) {
  const obj = JSON.parse(text);
  return {
    summary: (obj.summary || '').trim(),
    tags: Array.isArray(obj.tags) ? obj.tags.map(t => String(t).trim()).filter(Boolean) : []
  };
}

function fallbackSummaryTags({ title, content, noteTags }) {
  const base = (content || '').split('\n')[0] || title || '';
  const summary = base.substring(0, 50);
  const tags = Array.from(new Set(['小红书', ...(noteTags || [])])).filter(Boolean).slice(0, 5);
  while (tags.length < 3) tags.push('笔记');
  return { summary, tags };
}

module.exports = { buildAiInput, parseAiResponse, fallbackSummaryTags };
```

**Step 4: Run test to verify it passes**

Run: `node --test src/ai/__tests__/summary.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/ai/summary.js src/ai/__tests__/summary.test.js
git commit -m "feat: add AI summary helper module"
```

---

### Task 2: 将 OpenRouter 调用接入导出流程

**Files:**
- Modify: `src/ocr_and_write.js`

**Step 1: Write the failing test**

Add a minimal integration test to verify the AI output is used when API key is missing (fallback path):

```js
// src/ai/__tests__/summary.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fallbackSummaryTags } = require('../summary');

test('fallback is used when no API key', () => {
  const out = fallbackSummaryTags({ title: '标题', content: '正文', noteTags: [] });
  assert.ok(out.summary);
  assert.ok(out.tags.length >= 3);
});
```

**Step 2: Run test to verify it fails**

Run: `node --test src/ai/__tests__/summary.test.js`
Expected: FAIL if duplicate test or missing export

**Step 3: Implement minimal integration**

- 在 `ocr_and_write.js`：
  - `require('./ai/summary')`
  - 添加 `callOpenRouter`（使用 `https`，超时、重试、指数退避）
  - 在 OCR 完成后调用 `summarize`，得到 `summary/tags`
  - 修改 `generateMarkdown` 接受 `summary/tags` 并写入 frontmatter
- 当 `OPENROUTER_API_KEY` 缺失或失败时，使用 `fallbackSummaryTags`
- 默认模型 `openrouter/free`（可通过 `OPENROUTER_MODEL` 覆盖）

**Step 4: Run test to verify it passes**

Run: `node --test src/ai/__tests__/summary.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/ocr_and_write.js
git commit -m "feat: integrate OpenRouter summary/tags"
```

---

### Task 3: 手工验收与回归检查

**Files:**
- Inspect: `output/AI/*.md`, `output/笔记/*.md`

**Step 1: Run export**

Run: `node src/extract_v4.js` then `node src/ocr_and_write.js`
Expected: `summary`/`tags` 自动写入 frontmatter

**Step 2: Manual verification**

- 抽查 2-3 篇：`summary` <= 50 字、`tags` 3-5 个
- 断开网络或移除 `OPENROUTER_API_KEY` 再跑一次：仍有降级摘要/标签

**Step 3: Commit**

```bash
git add output/AI output/笔记
git commit -m "chore: regenerate notes with AI summary"
```

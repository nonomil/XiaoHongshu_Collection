# Tag Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Clean AI-generated tags to remove garbled entries and ensure at least 3 valid tags via fallback.

**Architecture:** Add a small tag-cleaning utility used by `normalizeSummaryTags` in `scripts/ocr_and_write.js`. Clean tags first, then dedupe and backfill from fallback.

**Tech Stack:** Node.js

---

### Task 1: Add tag cleaning utility and tests

**Files:**
- Create: `scripts/ai/tag_clean.js`
- Create: `scripts/ai/__tests__/tag_clean.test.js`

**Step 1: Write the failing test**

```js
// scripts/ai/__tests__/tag_clean.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cleanTags } = require('../tag_clean');

test('cleanTags removes garbled tags and short tags', () => {
  const input = ['知识库', '笔记', 'С����', 'a', '小红书搜索'];
  const output = cleanTags(input);
  assert.deepEqual(output, ['知识库', '笔记', '小红书搜索']);
});
```

**Step 2: Run test to verify it fails**

Run: `node --test scripts/ai/__tests__/tag_clean.test.js`
Expected: FAIL with "Cannot find module '../tag_clean'"

**Step 3: Write minimal implementation**

```js
// scripts/ai/tag_clean.js
function isPrintable(str) {
  return !/[\uFFFD\u0000-\u001F]/.test(str);
}

function hasCjkOrAsciiWord(str) {
  return /[\u4e00-\u9fff]/.test(str) || /[A-Za-z0-9]/.test(str);
}

function cleanTags(tags) {
  const out = [];
  for (const raw of tags || []) {
    const t = String(raw || '').trim();
    if (!t) continue;
    if (t.length <= 1) continue;
    if (!isPrintable(t)) continue;
    if (!hasCjkOrAsciiWord(t)) continue;
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

module.exports = { cleanTags };
```

**Step 4: Run test to verify it passes**

Run: `node --test scripts/ai/__tests__/tag_clean.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add scripts/ai/tag_clean.js scripts/ai/__tests__/tag_clean.test.js
git commit -m "feat: add tag cleaning utility"
```

---

### Task 2: Wire tag cleaning into summary normalization

**Files:**
- Modify: `scripts/ocr_and_write.js`

**Step 1: Write the failing test**

```js
// scripts/ai/__tests__/tag_clean.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cleanTags } = require('../tag_clean');

test('cleanTags keeps mixed Chinese/English tags', () => {
  const input = ['AI工具', 'knowledge'];
  const output = cleanTags(input);
  assert.deepEqual(output, ['AI工具', 'knowledge']);
});
```

**Step 2: Run test to verify it fails**

Run: `node --test scripts/ai/__tests__/tag_clean.test.js`
Expected: FAIL if new test or export missing

**Step 3: Implement wiring**

- Import `cleanTags` in `scripts/ocr_and_write.js`
- In `normalizeSummaryTags`, clean the combined tags before dedupe and backfill
- Ensure minimum tag count (3) using fallback tags

**Step 4: Run test to verify it passes**

Run: `node --test scripts/ai/__tests__/tag_clean.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add scripts/ocr_and_write.js scripts/ai/tag_clean.js

git commit -m "feat: clean AI tags"
```

---

### Task 3: Update README (optional)

**Files:**
- Modify: `README.md`

**Step 1: Update README**

- Mention tag cleaning for OCR/AI outputs

**Step 2: Commit**

```bash
git add README.md

git commit -m "docs: document tag cleaning"
```

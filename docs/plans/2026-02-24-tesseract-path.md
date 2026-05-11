# Tesseract Path Handling Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Auto-set `TESSDATA_PREFIX` to the project `assets/tesseract` directory when not provided, without extra logging.

**Architecture:** In `scripts/ocr_and_write.js`, check `process.env.TESSDATA_PREFIX` early. If unset, set it to `path.join(PROJECT_DIR, 'assets', 'tesseract')`. Respect any pre-set value.

**Tech Stack:** Node.js

---

### Task 1: Add default TESSDATA_PREFIX behavior

**Files:**
- Modify: `scripts/ocr_and_write.js`

**Step 1: Write the failing test**

```js
// scripts/ai/__tests__/tesseract_path.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');

// Require script module and inspect exported helper (to be added)
const { resolveTessdataPrefix } = require('../tesseract_path');

test('resolveTessdataPrefix uses env when set', () => {
  const out = resolveTessdataPrefix('C:/custom');
  assert.equal(out, 'C:/custom');
});

test('resolveTessdataPrefix defaults to assets/tesseract', () => {
  const out = resolveTessdataPrefix('');
  assert.ok(out.endsWith('assets\\tesseract'));
});
```

**Step 2: Run test to verify it fails**

Run: `node --test scripts/ai/__tests__/tesseract_path.test.js`
Expected: FAIL with "Cannot find module '../tesseract_path'"

**Step 3: Write minimal implementation**

```js
// scripts/ai/tesseract_path.js
const path = require('path');
const PROJECT_DIR = path.resolve(__dirname, '..', '..');

function resolveTessdataPrefix(envValue) {
  if (envValue && String(envValue).trim()) return String(envValue).trim();
  return path.join(PROJECT_DIR, 'assets', 'tesseract');
}

module.exports = { resolveTessdataPrefix };
```

**Step 4: Wire into ocr_and_write.js**

- Import `resolveTessdataPrefix`
- Set `process.env.TESSDATA_PREFIX` only when missing
- Do not log the value

**Step 5: Run test to verify it passes**

Run: `node --test scripts/ai/__tests__/tesseract_path.test.js`
Expected: PASS

**Step 6: Commit**

```bash
git add scripts/ai/tesseract_path.js scripts/ai/__tests__/tesseract_path.test.js scripts/ocr_and_write.js

git commit -m "feat: default tesseract path when env missing"
```

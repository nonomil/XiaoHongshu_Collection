# OCR Post-Correction Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add OCR post-correction that fixes common OCR mistakes and uses AI only when text is clearly not fluent, without touching main note content.

**Architecture:** Extend `scripts/ocr_and_write.js` with a two-stage OCR correction pipeline: rule-based fixes first, then a fluency heuristic. Only when a segment exceeds the threshold do we call OpenRouter to perform constrained corrections. Configuration lives in `config/openrouter.json` with optional fields.

**Tech Stack:** Node.js, OpenRouter API, Tesseract.js

---

### Task 1: Add OCR correction utilities and tests

**Files:**
- Create: `scripts/ai/ocr_postcorrect.js`
- Create: `scripts/ai/__tests__/ocr_postcorrect.test.js`

**Step 1: Write the failing test**

```js
// scripts/ai/__tests__/ocr_postcorrect.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { applyOcrRules, computeOcrAnomalyScore, shouldAiCorrect } = require('../ocr_postcorrect');

test('applyOcrRules fixes common mistakes', () => {
  const input = '可以自动抓取小红书收藏天里的所有笔记数据';
  const output = applyOcrRules(input);
  assert.equal(output, '可以自动抓取小红书收藏夹里的所有笔记数据');
});

test('computeOcrAnomalyScore flags noisy text', () => {
  const input = 'a1$% …… @@ ### ？？';
  const score = computeOcrAnomalyScore(input);
  assert.ok(score > 0.6);
});

test('shouldAiCorrect respects threshold', () => {
  const input = '普通中文句子，没有异常。';
  const score = computeOcrAnomalyScore(input);
  assert.equal(shouldAiCorrect(score, 0.5), false);
});
```

**Step 2: Run test to verify it fails**

Run: `node --test scripts/ai/__tests__/ocr_postcorrect.test.js`
Expected: FAIL with "Cannot find module '../ocr_postcorrect'"

**Step 3: Write minimal implementation**

```js
// scripts/ai/ocr_postcorrect.js
function applyOcrRules(text) {
  let t = text || '';
  const rules = [
    [/收藏天/g, '收藏夹'],
    [/收蔵/g, '收藏'],
    [/小红书收矛夹/g, '小红书收藏夹'],
    [/Al/g, 'AI'],
    [/A1/g, 'AI'],
    [/阿/g, 'AI'],
    [/寡问一问/g, '问一问'],
    [/寡/g, '的']
  ];
  for (const [re, rep] of rules) {
    t = t.replace(re, rep);
  }
  return t;
}

function computeOcrAnomalyScore(text) {
  const t = text || '';
  if (!t) return 0;
  const len = t.length;
  const cjk = (t.match(/[\u4e00-\u9fff]/g) || []).length / len;
  const symbols = (t.match(/[~`!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?]/g) || []).length / len;
  const garbled = (t.match(/[�□■]/g) || []).length / len;
  const score = Math.min(1, 0.6 * (1 - cjk) + 0.3 * symbols + 0.1 * garbled);
  return score;
}

function shouldAiCorrect(score, threshold) {
  return score >= threshold;
}

module.exports = { applyOcrRules, computeOcrAnomalyScore, shouldAiCorrect };
```

**Step 4: Run test to verify it passes**

Run: `node --test scripts/ai/__tests__/ocr_postcorrect.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add scripts/ai/ocr_postcorrect.js scripts/ai/__tests__/ocr_postcorrect.test.js
git commit -m "feat: add OCR post-correction utilities"
```

---

### Task 2: Wire OCR post-correction into the pipeline

**Files:**
- Modify: `scripts/ocr_and_write.js`

**Step 1: Write the failing test**

```js
// scripts/ai/__tests__/ocr_postcorrect.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { applyOcrRules } = require('../ocr_postcorrect');

test('applyOcrRules keeps normal text unchanged', () => {
  const input = '这是正常中文内容';
  const output = applyOcrRules(input);
  assert.equal(output, input);
});
```

**Step 2: Run test to verify it fails**

Run: `node --test scripts/ai/__tests__/ocr_postcorrect.test.js`
Expected: FAIL if missing new test or missing export

**Step 3: Implement wiring**

- Add config defaults: `ocrPostCorrect`, `ocrPostCorrectThreshold`, `ocrPostCorrectMaxChars`
- After `cleanOcrText`, call `applyOcrRules`
- Compute anomaly score; only call AI post-correct when threshold is exceeded
- Add a dedicated OpenRouter prompt for OCR correction
- If AI fails, fall back to rule-based corrected text

**Step 4: Run test to verify it passes**

Run: `node --test scripts/ai/__tests__/ocr_postcorrect.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add scripts/ocr_and_write.js scripts/ai/ocr_postcorrect.js

git commit -m "feat: add OCR post-correction pipeline"
```

---

### Task 3: Update README with OCR correction behavior

**Files:**
- Modify: `README.md`

**Step 1: Update README**

- Document OCR post-correction behavior
- Document new OpenRouter config fields

**Step 2: Commit**

```bash
git add README.md

git commit -m "docs: document OCR post-correction"
```

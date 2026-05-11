# Multi-Account Output Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add per-account output folders using `{nickname}_{uid}` with auto-detected account info and migrate existing outputs into the account folder.

**Architecture:** Auto-detect uid/nickname from the current XHS page via CDP. Attach account metadata to notes and route output paths through an account key used for notes and images. On first run, migrate `output/AI` and `output/笔记` into the account folder.

**Tech Stack:** Node.js, CDP (WebSocket), filesystem

---

### Task 1: Add account helpers (key + name normalization)

**Files:**
- Create: `scripts/ai/account.js`
- Create: `scripts/ai/__tests__/account.test.js`

**Step 1: Write the failing test**

```js
// scripts/ai/__tests__/account.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildAccountKey, normalizeNickname } = require('../account');

test('buildAccountKey combines nickname and uid', () => {
  const key = buildAccountKey({ nickname: 'foo', uid: '123' });
  assert.equal(key, 'foo_123');
});

test('normalizeNickname trims and removes suffix', () => {
  const out = normalizeNickname('Alice 关注');
  assert.equal(out, 'Alice');
});
```

**Step 2: Run test to verify it fails**

Run: `node --test scripts/ai/__tests__/account.test.js`
Expected: FAIL with "Cannot find module '../account'"

**Step 3: Write minimal implementation**

```js
// scripts/ai/account.js
function sanitizeName(value) {
  return String(value || 'unknown').replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, ' ').trim();
}

function normalizeNickname(nickname) {
  return sanitizeName(String(nickname || '').replace(/关注$/, '').trim());
}

function buildAccountKey({ nickname, uid }) {
  const safeName = normalizeNickname(nickname) || 'unknown';
  const safeUid = String(uid || '000000').trim() || '000000';
  return `${safeName}_${safeUid}`;
}

function buildOutputDirs(outputRoot, accountKey) {
  const notesDir = path.join(outputRoot, accountKey);
  const imagesDir = path.join(notesDir, '_images');
  return { notesDir, imagesDir };
}

module.exports = { buildAccountKey, normalizeNickname, buildOutputDirs };
```

**Step 4: Run test to verify it passes**

Run: `node --test scripts/ai/__tests__/account.test.js`
Expected: PASS

**Step 5: Commit (only if requested)**

```bash
git add scripts/ai/account.js scripts/ai/__tests__/account.test.js
git commit -m "feat: add account helpers"
```

---

### Task 2: Detect account in extractor and attach to notes

**Files:**
- Modify: `scripts/extract_v4.js`

**Step 1: Write the failing test**

```js
// scripts/ai/__tests__/account.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildAccountKey } = require('../account');

test('buildAccountKey falls back to unknown', () => {
  const key = buildAccountKey({ nickname: '', uid: '' });
  assert.equal(key, 'unknown_000000');
});
```

**Step 2: Run test to verify it fails**

Run: `node --test scripts/ai/__tests__/account.test.js`
Expected: FAIL with "unknown_000000" mismatch

**Step 3: Implement minimal detection**

- Add CDP extraction for uid and nickname from current page
- Attach `{ uid, nickname, accountKey }` to each note record
- If extraction fails, use `unknown_000000`

**Step 4: Run test to verify it passes**

Run: `node --test scripts/ai/__tests__/account.test.js`
Expected: PASS

**Step 5: Commit (only if requested)**

```bash
git add scripts/extract_v4.js scripts/ai/account.js
git commit -m "feat: add account detection to extractor"
```

---

### Task 3: Route output and images by account key

**Files:**
- Modify: `scripts/ocr_and_write.js`

**Step 1: Write the failing test**

```js
// scripts/ai/__tests__/account.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildOutputDirs } = require('../account');

test('buildOutputDirs uses accountKey', () => {
  const out = buildOutputDirs('output', 'foo_123');
  assert.ok(out.notesDir.endsWith('output\\foo_123'));
});
```

**Step 2: Run test to verify it fails**

Run: `node --test scripts/ai/__tests__/account.test.js`
Expected: FAIL with "buildOutputDirs is not a function"

**Step 3: Implement output routing**

- In `ocr_and_write.js`, use `note.accountKey` for `output/<accountKey>/...`
- Images go to `output/<accountKey>/_images/<noteId>/...`
- Fallback to `unknown_000000` if missing

**Step 4: Run test to verify it passes**

Run: `node --test scripts/ai/__tests__/account.test.js`
Expected: PASS

**Step 5: Commit (only if requested)**

```bash
git add scripts/ocr_and_write.js scripts/ai/account.js
git commit -m "feat: route output by account"
```

---

### Task 4: Migrate existing output folders

**Files:**
- Modify: `scripts/ocr_and_write.js`

**Step 1: Write the failing test**

```js
// scripts/ai/__tests__/account.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildOutputDirs } = require('../account');

test('buildOutputDirs returns imagesDir inside account folder', () => {
  const out = buildOutputDirs('output', 'foo_123');
  assert.ok(out.imagesDir.includes('output\\foo_123\\_images'));
});
```

**Step 2: Run test to verify it fails**

Run: `node --test scripts/ai/__tests__/account.test.js`
Expected: FAIL with "buildOutputDirs is not a function"

**Step 3: Implement migration**

- On startup, detect legacy folders `output/AI` and `output/笔记`
- Move them to `output/<accountKey>/AI` and `output/<accountKey>/笔记`
- Skip if destination already exists

**Step 4: Run test to verify it passes**

Run: `node --test scripts/ai/__tests__/account.test.js`
Expected: PASS

**Step 5: Commit (only if requested)**

```bash
git add scripts/ocr_and_write.js scripts/ai/account.js
git commit -m "feat: migrate legacy outputs into account folder"
```

---

### Task 5: Update README

**Files:**
- Modify: `README.md`

**Step 1: Update README**

- Explain per-account output layout
- Document auto-detection behavior
- Describe migration behavior for legacy output folders

**Step 2: Commit (only if requested)**

```bash
git add README.md
git commit -m "docs: document multi-account output"
```

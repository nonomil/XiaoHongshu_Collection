# Account Detection via DOM Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Read profile page DOM to capture nickname (and uid if available) to avoid `unknown_000000` outputs, with network listener as fallback.

**Architecture:** Add a DOM extraction helper in `extract_v4.js` that reads profile nickname/uid from visible elements and URL. Use it before network fallback; if uid missing, use `{nickname}_unknown`.

**Tech Stack:** Node.js, CDP (WebSocket)

---

### Task 1: Add DOM parsing helper + tests

**Files:**
- Create: `scripts/ai/__tests__/account_dom.test.js`
- Modify: `scripts/extract_v4.js`

**Step 1: Write the failing test**

```js
// scripts/ai/__tests__/account_dom.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildAccountKeyFromDom } = require('../account_dom');

test('buildAccountKeyFromDom uses nickname and uid', () => {
  const info = { nickname: '小红薯62AE42E3', uid: '62ade3ea000000001b026c75' };
  const out = buildAccountKeyFromDom(info);
  assert.equal(out, '小红薯62AE42E3_62ade3ea000000001b026c75');
});
```

**Step 2: Run test to verify it fails**

Run: `node --test scripts/ai/__tests__/account_dom.test.js`
Expected: FAIL with "Cannot find module '../account_dom'"

**Step 3: Write minimal implementation**

```js
// scripts/ai/account_dom.js
const { buildAccountKey } = require('./account');

function buildAccountKeyFromDom(info) {
  const nickname = info?.nickname || '';
  const uid = info?.uid || '';
  if (nickname && uid) return buildAccountKey({ nickname, uid });
  if (nickname) return `${nickname}_unknown`;
  return 'unknown_000000';
}

module.exports = { buildAccountKeyFromDom };
```

**Step 4: Run test to verify it passes**

Run: `node --test scripts/ai/__tests__/account_dom.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add scripts/ai/account_dom.js scripts/ai/__tests__/account_dom.test.js

git commit -m "feat: add account DOM helper"
```

---

### Task 2: Wire DOM extraction into extract_v4.js

**Files:**
- Modify: `scripts/extract_v4.js`

**Step 1: Write the failing test**

```js
// scripts/ai/__tests__/account_dom.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildAccountKeyFromDom } = require('../account_dom');

test('buildAccountKeyFromDom falls back to nickname_unknown', () => {
  const info = { nickname: '小红薯62AE42E3', uid: '' };
  const out = buildAccountKeyFromDom(info);
  assert.equal(out, '小红薯62AE42E3_unknown');
});
```

**Step 2: Run test to verify it fails**

Run: `node --test scripts/ai/__tests__/account_dom.test.js`
Expected: FAIL if missing new test or export

**Step 3: Implement wiring**

- Add `getAccountInfoFromDom` in `extract_v4.js` to query:
  - nickname element on profile page
  - profile URL for uid
- Call DOM extraction before network fallback
- If only nickname exists, set `accountKey` to `{nickname}_unknown`

**Step 4: Run test to verify it passes**

Run: `node --test scripts/ai/__tests__/account_dom.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add scripts/extract_v4.js scripts/ai/account_dom.js

git commit -m "feat: detect account from DOM"
```

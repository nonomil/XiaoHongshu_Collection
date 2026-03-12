# Account Detection via Network Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Capture uid/nickname by listening to `user/me` network responses via CDP, with fallback to existing DOM/localStorage logic.

**Architecture:** Add a network listener in `scripts/extract_v4.js` using `Network.enable` and `Network.responseReceived` + `Network.getResponseBody`. Cache detected account info and attach it to notes. Preserve fallback logic for safety.

**Tech Stack:** Node.js, CDP (WebSocket)

---

### Task 1: Add network capture utilities + tests

**Files:**
- Create: `scripts/ai/__tests__/account_detect.test.js`
- Modify: `scripts/extract_v4.js`

**Step 1: Write the failing test**

```js
// scripts/ai/__tests__/account_detect.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseUserMeResponse } = require('../account_detect');

test('parseUserMeResponse extracts uid and nickname', () => {
  const sample = { data: { userId: '123', nickname: 'Alice' } };
  const out = parseUserMeResponse(sample);
  assert.deepEqual(out, { uid: '123', nickname: 'Alice' });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test scripts/ai/__tests__/account_detect.test.js`
Expected: FAIL with "Cannot find module '../account_detect'"

**Step 3: Write minimal implementation**

```js
// scripts/ai/account_detect.js
function parseUserMeResponse(payload) {
  const data = payload?.data || payload?.user || payload?.data?.user || payload?.data?.me || payload?.data?.info || payload?.data?.user_info;
  if (!data) return { uid: '', nickname: '' };
  return {
    uid: String(data.userId || data.uid || data.id || ''),
    nickname: String(data.nickname || data.name || '')
  };
}

module.exports = { parseUserMeResponse };
```

**Step 4: Run test to verify it passes**

Run: `node --test scripts/ai/__tests__/account_detect.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add scripts/ai/account_detect.js scripts/ai/__tests__/account_detect.test.js
git commit -m "feat: add account detect parser"
```

---

### Task 2: Wire network capture in extract_v4.js

**Files:**
- Modify: `scripts/extract_v4.js`

**Step 1: Write the failing test**

```js
// scripts/ai/__tests__/account_detect.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseUserMeResponse } = require('../account_detect');

test('parseUserMeResponse handles missing payload', () => {
  const out = parseUserMeResponse(null);
  assert.deepEqual(out, { uid: '', nickname: '' });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test scripts/ai/__tests__/account_detect.test.js`
Expected: FAIL if missing new test or export

**Step 3: Implement wiring**

- Enable `Network` after CDP connection
- Listen to `Network.responseReceived` for `user/me`
- On match, call `Network.getResponseBody` and parse JSON
- Cache account info when found
- Use cached account info before DOM fallback

**Step 4: Run test to verify it passes**

Run: `node --test scripts/ai/__tests__/account_detect.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add scripts/extract_v4.js scripts/ai/account_detect.js

git commit -m "feat: detect account via network"
```

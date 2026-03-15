# 外部入口同步模式 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add “同步最新 / 同步全部” buttons for external inbox sync, and support a `mode` parameter in `/api/inbox/sync` to switch between incremental and full pull.

**Architecture:** UI sends `{ mode: 'latest' | 'all' }` to `/api/inbox/sync`. The server passes this to `syncInbox`, which maps `all` to `since=0` and keeps `latest` as `lastModified`. Storage remains append + de-dupe.

**Tech Stack:** Node.js UI server, static HTML/CSS/JS, Node test runner

---

### Task 1: Update UI regression test to require both buttons

**Files:**
- Modify: `scripts/ai/__tests__/ui_index.test.js`

**Step 1: Write the failing test**

```js
const html = readIndexHtml();
assert.match(html, /入口\s*03/);
assert.match(html, /外部入口/);
assert.match(html, /同步最新/);
assert.match(html, /同步全部/);
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL because “同步最新 / 同步全部” not yet in UI

**Step 3: Commit**

```bash
git add scripts/ai/__tests__/ui_index.test.js
git commit -m "test: require inbox sync latest/all buttons"
```

---

### Task 2: Add latest/all buttons to the external entry card

**Files:**
- Modify: `ui/index.html`

**Step 1: Update UI markup**

- Change the topbar button label to `同步最新` (acts as quick latest sync).
- Replace the card’s single button with two:

```html
<div class="button-row">
  <button id="inbox-sync-latest" class="button secondary" type="button">同步最新</button>
  <button id="inbox-sync-all" class="button ghost" type="button">同步全部</button>
</div>
```

**Step 2: Run tests**

Run: `npm test`
Expected: PASS

**Step 3: Commit**

```bash
git add ui/index.html
git commit -m "ui: add latest/all inbox sync buttons"
```

---

### Task 3: Wire UI buttons to send sync mode

**Files:**
- Modify: `ui/app.js`

**Step 1: Update JS wiring**

Add DOM refs and a unified handler:

```js
const inboxSyncLatestButton = document.getElementById('inbox-sync-latest');
const inboxSyncAllButton = document.getElementById('inbox-sync-all');

async function runInboxSync(mode = 'latest') {
  setBusy(true, '正在同步收件箱...');
  renderText('任务已提交，等待返回...');
  resetProgressList();

  try {
    const payload = await requestJson('/api/inbox/sync', {
      body: { uiConfig: readConfigFromForm(), mode }
    });
    statusText.textContent = '收件箱同步完成';
    renderReport(payload);
  } catch (error) {
    statusText.textContent = '收件箱同步失败';
    renderText(error.message);
  } finally {
    setBusy(false, statusText.textContent);
  }
}

inboxSyncButton.addEventListener('click', () => runInboxSync('latest'));
if (inboxSyncLatestButton) inboxSyncLatestButton.addEventListener('click', () => runInboxSync('latest'));
if (inboxSyncAllButton) inboxSyncAllButton.addEventListener('click', () => runInboxSync('all'));
```

**Step 2: Run tests**

Run: `npm test`
Expected: PASS

**Step 3: Commit**

```bash
git add ui/app.js
git commit -m "ui: send inbox sync mode from buttons"
```

---

### Task 4: Support sync mode in backend

**Files:**
- Modify: `scripts/ui_server.js`
- Modify: `scripts/lib/inbox_sync.js`
- Modify: `scripts/ai/__tests__/inbox_sync.test.js`

**Step 1: Add a failing test**

```js
test('syncInbox uses since=0 for full sync', async () => {
  resetTmp();
  fs.writeFileSync(pushbulletConfigPath, JSON.stringify({
    enabled: true,
    accessToken: 'token',
    lastModified: 999,
    inboxPath: 'data/inbox.jsonl'
  }, null, 2), 'utf-8');

  let capturedSince = null;
  await syncInbox({
    pushbulletConfigPath,
    mode: 'all',
    providerFactory: () => ({
      pull: async ({ since }) => {
        capturedSince = since;
        return { items: [], nextModified: 10 };
      }
    }),
    storeFactory: () => ({ append: async () => ({ added: 0, skipped: 0 }) })
  });

  assert.equal(capturedSince, 0);
});
```

**Step 2: Update implementation**

- `syncInbox({ mode })` should map:
  - `all` -> `since = 0`
  - default -> `since = lastModified`
- In `ui_server.js`, pass `mode` from request body to `syncInbox`:

```js
const payload = await readJsonBody(request);
const mode = payload.mode || 'latest';
const result = await runExclusive('inbox-sync', () => runInbox({
  uiConfigPath,
  uiConfig,
  mode
}));
```

**Step 3: Run tests**

Run: `npm test`
Expected: PASS

**Step 4: Commit**

```bash
git add scripts/lib/inbox_sync.js scripts/ui_server.js scripts/ai/__tests__/inbox_sync.test.js
git commit -m "feat: add inbox sync mode"
```

---

### Task 5: Final verification

**Step 1: Run full test suite**

Run: `npm test`
Expected: PASS

**Step 2: Summarize changes**

Note: new UI buttons + backend mode support.

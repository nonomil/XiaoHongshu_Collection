# 收件箱同步入口增强与解析保存 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add topbar “同步全部” and a “收件箱解析保存” button, plus a UI API to parse/save inbox links without clearing them.

**Architecture:** UI triggers `/api/inbox/sync` with `mode` for sync, and new `/api/inbox/save` for parsing/saving inbox links. The server uses `saveInboxUrls` with a `saveLinksText` wrapper to apply UI config overrides.

**Tech Stack:** Node.js UI server, static HTML/CSS/JS, Node test runner

---

### Task 1: Update UI regression test for new button copy

**Files:**
- Modify: `scripts/ai/__tests__/ui_index.test.js`

**Step 1: Write the failing test**

```js
const html = readIndexHtml();
assert.match(html, /同步全部/);
assert.match(html, /收件箱解析保存/);
```

**Step 2: Run test to verify it fails**

Run: `npm test -- scripts/ai/__tests__/ui_index.test.js`
Expected: FAIL because “收件箱解析保存” not yet in UI

**Step 3: Commit**

```bash
git add scripts/ai/__tests__/ui_index.test.js
git commit -m "test: require inbox save button"
```

---

### Task 2: Add topbar “同步全部” and card “收件箱解析保存” buttons

**Files:**
- Modify: `ui/index.html`

**Step 1: Update markup**

- Add topbar button next to “同步最新”:

```html
<button id="inbox-sync-all-top" class="button ghost" type="button">同步全部</button>
```

- Add card button in “入口 03”:

```html
<button id="inbox-save" class="button" type="button">收件箱解析保存</button>
```

**Step 2: Run tests**

Run: `npm test -- scripts/ai/__tests__/ui_index.test.js`
Expected: PASS

**Step 3: Commit**

```bash
git add ui/index.html
git commit -m "ui: add inbox save and topbar sync-all buttons"
```

---

### Task 3: Wire new buttons in UI logic

**Files:**
- Modify: `ui/app.js`

**Step 1: Write the failing test**

No new test required (covered by API test in Task 4), proceed to implementation.

**Step 2: Implement UI wiring**

- Add DOM refs for `inbox-sync-all-top` and `inbox-save`.
- Include new buttons in `setBusy` disable logic.
- Add `runInboxSave()` which calls `/api/inbox/save` with `uiConfig`.
- Add event listeners for both “同步全部” buttons and “收件箱解析保存”.

**Step 3: Run tests**

Run: `npm test`
Expected: PASS

**Step 4: Commit**

```bash
git add ui/app.js
git commit -m "ui: wire inbox save action"
```

---

### Task 4: Add `/api/inbox/save` endpoint in UI server

**Files:**
- Modify: `scripts/ui_server.js`
- Modify: `scripts/ai/__tests__/ui_server.test.js`

**Step 1: Write the failing test**

```js
test('inbox save api returns a normalized success payload', async () => {
  const { baseUrl } = await startServer({
    runInboxSave: async () => ({
      total: 2,
      summary: { total: 2, successCount: 2, failureCount: 0, results: [] }
    })
  });

  const response = await requestJson(`${baseUrl}/api/inbox/save`, {});

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.report.total, 2);
  assert.equal(response.body.report.successCount, 2);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- scripts/ai/__tests__/ui_server.test.js`
Expected: FAIL because endpoint does not exist

**Step 3: Implement minimal endpoint**

- Add `runInboxSave` injection with default implementation.
- Default implementation should call `saveInboxUrls` with a `saveLinksText` wrapper that applies UI config overrides (`outputRoot`, `imagesRoot`, `conflictStrategy`, `maxTitleLength`, `uiRuntime`).
- Endpoint should return `report` as `summary` (or `{ total: 0, summary: null }` handled gracefully).

**Step 4: Run test to verify it passes**

Run: `npm test -- scripts/ai/__tests__/ui_server.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add scripts/ui_server.js scripts/ai/__tests__/ui_server.test.js
git commit -m "feat: add inbox save api"
```

---

### Task 5: Full test suite

**Step 1: Run tests**

Run: `npm test`
Expected: PASS

**Step 2: Summarize changes**

Note: topbar sync-all, inbox save button, new inbox save API.


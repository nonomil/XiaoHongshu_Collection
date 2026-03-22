# Inbox Flow Layout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Unify inbox sync and inbox save into a single clear UI flow and add recent 10/20/30 message sync support.

**Architecture:** Keep all inbox actions inside entry 03, introduce a non-persistent recent-sync range select in the UI, and add a backend `recent` mode that fetches the latest N Pushbullet items without mutating the incremental cursor. Existing result-summary rendering continues to be the main feedback surface.

**Tech Stack:** Vanilla JS, HTML, CSS, Node test runner, JSDOM

---

### Task 1: Write failing tests for the new inbox workflow

**Files:**
- Modify: `scripts/ai/__tests__/ui_index.test.js`
- Modify: `scripts/ai/__tests__/ui_server.test.js`
- Modify: `scripts/ai/__tests__/inbox_sync.test.js`
- Modify: `scripts/ai/__tests__/inbox_pushbullet.test.js`
- Create: `scripts/ai/__tests__/ui_inbox_flow.test.js`

**Step 1: Write the failing HTML assertions**

Require:

- top header no longer contains direct inbox sync buttons
- entry 03 contains range select for `10 / 20 / 30`
- entry 03 copy describes `先同步，再解析保存`

**Step 2: Write the failing app behavior test**

Require:

- clicking entry 03 recent sync uses selected limit
- request body includes `mode: "recent"` and `limit`

**Step 3: Write the failing server and sync tests**

Require:

- `/api/inbox/sync` forwards `mode=recent` and numeric `limit`
- `syncInbox({ mode: "recent" })` does not advance stored `lastModified`
- Pushbullet provider supports `maxItems`

**Step 4: Run focused tests to confirm RED**

Run:

```bash
node --test scripts/ai/__tests__/ui_index.test.js scripts/ai/__tests__/ui_server.test.js scripts/ai/__tests__/inbox_sync.test.js scripts/ai/__tests__/inbox_pushbullet.test.js scripts/ai/__tests__/ui_inbox_flow.test.js
```

Expected: FAIL because recent sync mode and new layout do not exist yet.

### Task 2: Implement recent inbox sync semantics

**Files:**
- Modify: `scripts/lib/inbox_pushbullet.js`
- Modify: `scripts/lib/inbox_sync.js`
- Modify: `scripts/ui_server.js`

**Step 1: Add `maxItems` support in the provider**

- stop after collecting the latest N items
- mark result truncated when more items may exist

**Step 2: Add `recent` mode in sync logic**

- allow `{ mode: "recent", limit }`
- use `since=0`
- do not persist `lastModified`
- return `mode` and `limit` in report

**Step 3: Update server request parsing**

- accept `limit` from `/api/inbox/sync`
- pass `mode` and `limit` through to `syncInbox`

**Step 4: Run focused tests**

Expected: backend-focused tests PASS

### Task 3: Implement the UI layout and request behavior

**Files:**
- Modify: `ui/index.html`
- Modify: `ui/app.js`
- Modify: `ui/styles.css`

**Step 1: Restructure entry 03**

- remove topbar sync actions
- add two-step copy inside entry 03
- add sync range select

**Step 2: Wire app behavior**

- read the selected sync range
- recent sync button posts `mode: "recent"` and selected `limit`
- full sync button still posts `mode: "all"`
- result summary shows readable recent labels

**Step 3: Add layout polish**

- make entry 03 hierarchy obvious
- keep desktop and mobile readable

**Step 4: Run focused tests**

Expected: all UI tests PASS

### Task 4: Capture screenshots and update audit docs

**Files:**
- Modify: `docs/analysis/2026-03-21-ui-result-panel-audit.md`
- Modify: `docs/analysis/img/2026-03-21-ui-result-panel-audit.assets/capture_manifest.json`
- Create or modify preview asset under `docs/analysis/img/2026-03-21-ui-result-panel-audit.assets/preview/`

**Step 1: Create a stable preview page**

- show the new entry 03 inbox workflow
- show recent range select and save button in one place

**Step 2: Capture desktop and mobile screenshots**

- local Chrome headless only

**Step 3: Update audit notes**

- document why the old split flow was confusing
- record that the new layout keeps sync and save in one task zone

### Task 5: Final verification

**Files:**
- Verify only

**Step 1: Run focused tests**

```bash
node --test scripts/ai/__tests__/ui_index.test.js scripts/ai/__tests__/ui_server.test.js scripts/ai/__tests__/inbox_sync.test.js scripts/ai/__tests__/inbox_pushbullet.test.js scripts/ai/__tests__/ui_inbox_flow.test.js
```

Expected: PASS

**Step 2: Run full suite**

```bash
npm test
```

Expected: PASS with 0 failing tests

# Link Save And Dual Entry UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add batch link saving, rename the single-note output to `单条笔记保存`, and ship a minimal local UI with `链接保存笔记` and `收藏保存笔记` entry points.

**Architecture:** Keep the existing collection pipeline and single-note exporter intact, then layer a shared batch-save executor on top of `scripts/save_note.js`. Build the UI as a static page served by a minimal Node HTTP server so the project stays dependency-light and consistent with current local-script usage.

**Tech Stack:** Node.js built-in `http`, existing CDP scripts, existing test runner `node --test`, static HTML/CSS/JS.

---

### Task 1: Rename single-note output target

**Files:**
- Modify: `scripts/lib/cdp_note.js`
- Modify: `scripts/ai/__tests__/cdp_note.test.js`
- Modify: `scripts/ai/__tests__/note_export.test.js`

**Step 1: Write the failing test**

Update the existing single-note tests so they expect `单条笔记保存` instead of `单挑保存`.

**Step 2: Run test to verify it fails**

Run: `node --test --experimental-test-isolation=none scripts/ai/__tests__/cdp_note.test.js scripts/ai/__tests__/note_export.test.js`
Expected: FAIL because the implementation still emits `单挑保存`.

**Step 3: Write minimal implementation**

Change `buildSingleNote()` in `scripts/lib/cdp_note.js` to emit `单条笔记保存`.

**Step 4: Run test to verify it passes**

Run: `node --test --experimental-test-isolation=none scripts/ai/__tests__/cdp_note.test.js scripts/ai/__tests__/note_export.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add scripts/lib/cdp_note.js scripts/ai/__tests__/cdp_note.test.js scripts/ai/__tests__/note_export.test.js
git commit -m "refactor: rename single note output collection"
```

### Task 2: Add multi-link extraction and batch save execution

**Files:**
- Modify: `scripts/lib/note_input.js`
- Modify: `scripts/save_note.js`
- Modify: `scripts/ai/__tests__/note_input.test.js`
- Modify: `scripts/ai/__tests__/save_note.test.js`

**Step 1: Write the failing test**

Add tests for:

- extracting all Xiaohongshu links from one text block
- removing duplicates while preserving first-seen order
- resolving a batch of inputs into sequential save targets
- aggregating batch results without aborting after the first failure

**Step 2: Run test to verify it fails**

Run: `node --test --experimental-test-isolation=none scripts/ai/__tests__/note_input.test.js scripts/ai/__tests__/save_note.test.js`
Expected: FAIL because multi-link helpers and batch executor do not exist yet.

**Step 3: Write minimal implementation**

Implement:

- `extractUrlsFromText()` and `normalizeNoteInputs()` in `scripts/lib/note_input.js`
- batch target resolution and sequential save execution in `scripts/save_note.js`

Keep the existing single-note CLI behavior working.

**Step 4: Run test to verify it passes**

Run: `node --test --experimental-test-isolation=none scripts/ai/__tests__/note_input.test.js scripts/ai/__tests__/save_note.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add scripts/lib/note_input.js scripts/save_note.js scripts/ai/__tests__/note_input.test.js scripts/ai/__tests__/save_note.test.js
git commit -m "feat: support batch note saving from mixed text"
```

### Task 3: Add a minimal local UI and API surface

**Files:**
- Create: `scripts/ui_server.js`
- Create: `ui/index.html`
- Create: `ui/app.js`
- Create: `ui/styles.css`
- Modify: `package.json`
- Modify: `README.md`
- Create: `scripts/ai/__tests__/ui_server.test.js`

**Step 1: Write the failing test**

Add tests for:

- rejecting empty link-save payloads
- guarding against concurrent task execution
- returning normalized summary payloads for both UI actions

**Step 2: Run test to verify it fails**

Run: `node --test --experimental-test-isolation=none scripts/ai/__tests__/ui_server.test.js`
Expected: FAIL because the UI server helpers do not exist yet.

**Step 3: Write minimal implementation**

Implement a small HTTP server that:

- serves the static UI files
- exposes `POST /api/save-links`
- exposes `POST /api/save-collection`
- serializes task execution through a simple in-memory lock

Update `package.json` with a `ui` script and document it in `README.md`.

**Step 4: Run test to verify it passes**

Run: `node --test --experimental-test-isolation=none scripts/ai/__tests__/ui_server.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add scripts/ui_server.js ui/index.html ui/app.js ui/styles.css package.json README.md scripts/ai/__tests__/ui_server.test.js
git commit -m "feat: add local dual entry UI"
```

### Task 4: Full verification and merge-ready cleanup

**Files:**
- Review: `docs/plans/2026-03-09-link-save-dual-entry-ui-design.md`
- Review: `docs/plans/2026-03-09-link-save-dual-entry-ui-implementation-plan.md`
- Verify: changed source and test files

**Step 1: Run syntax verification**

Run: `node --check scripts/save_note.js`
Run: `node --check scripts/lib/note_input.js`
Run: `node --check scripts/lib/cdp_note.js`
Run: `node --check scripts/lib/note_export.js`
Run: `node --check scripts/ui_server.js`
Expected: all exit with code 0.

**Step 2: Run full tests**

Run: `node --test --experimental-test-isolation=none scripts/ai/__tests__/*.test.js`
Expected: PASS with zero failures.

**Step 3: Run a manual smoke check**

Run: `node scripts/ui_server.js`
Expected: server starts and prints the local URL.

**Step 4: Review the diff before merge**

Check modified files, confirm no unrelated changes were pulled into the feature branch commit.

**Step 5: Commit**

```bash
git add docs/plans/2026-03-09-link-save-dual-entry-ui-design.md docs/plans/2026-03-09-link-save-dual-entry-ui-implementation-plan.md
git commit -m "docs: add link save and ui implementation plan"
```

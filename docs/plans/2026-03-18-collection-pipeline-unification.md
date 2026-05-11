# Collection Pipeline Unification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the legacy two-script collection export path with a shared collection export service that reuses the unified note export pipeline while keeping CLI and UI behavior compatible.

**Architecture:** Add a new `collection_export` orchestrator in `scripts/lib/` that fetches collection notes, persists the raw snapshot, exports each note through `processSingleNoteExport`, and returns a stable report shape. Rewire UI and new CLI entrypoints to call this orchestrator directly, while keeping legacy scripts available as compatibility shims during transition.

**Tech Stack:** Node.js, built-in `node:test`, existing `scripts/lib/*` pipeline modules, existing CDP collection fetcher in `extract_v4.js`

---

### Task 1: Add collection export service contract tests

**Files:**
- Create: `G:\UserCode\XiaoHongshu_Collection\scripts\ai\__tests__\collection_export.test.js`
- Modify: `G:\UserCode\XiaoHongshu_Collection\scripts\ai\__tests__\ui_server.test.js`
- Test: `G:\UserCode\XiaoHongshu_Collection\scripts\ai\__tests__\collection_export.test.js`

**Step 1: Write the failing test**

Add tests that lock these behaviors:

- `runCollectionExport()` persists the raw collection payload before exporting notes
- it exports every note via `processSingleNoteExport`
- it returns a stable report with `total`, `successCount`, `failureCount`, `results`, `rawPath`, and `reportPath`
- UI collection route can use the orchestrator result shape directly

**Step 2: Run test to verify it fails**

Run: `node --test scripts/ai/__tests__/collection_export.test.js`

Expected: FAIL because `scripts/lib/collection_export.js` does not exist yet.

**Step 3: Write minimal implementation**

Create `scripts/lib/collection_export.js` with:

- `flattenBoardNotes()`
- `buildCollectionExportSummary()`
- `runCollectionExport()`

The function should accept injected dependencies for fetch, raw persistence, note export, and report writing so tests can stay fast and deterministic.

**Step 4: Run test to verify it passes**

Run: `node --test scripts/ai/__tests__/collection_export.test.js`

Expected: PASS

**Step 5: Commit**

```bash
git add scripts/lib/collection_export.js scripts/ai/__tests__/collection_export.test.js scripts/ai/__tests__/ui_server.test.js
git commit -m "refactor: add shared collection export service"
```

### Task 2: Add a unified collection CLI entrypoint

**Files:**
- Create: `G:\UserCode\XiaoHongshu_Collection\scripts\save_collection.js`
- Modify: `G:\UserCode\XiaoHongshu_Collection\package.json`
- Test: `G:\UserCode\XiaoHongshu_Collection\scripts\ai\__tests__\collection_export.test.js`

**Step 1: Write the failing test**

Extend collection export tests to assert the CLI wrapper:

- builds a collection task
- calls the shared orchestrator
- prints a compact summary
- sets exit code when failures exist

**Step 2: Run test to verify it fails**

Run: `node --test scripts/ai/__tests__/collection_export.test.js`

Expected: FAIL because `save_collection.js` does not exist yet.

**Step 3: Write minimal implementation**

Create `scripts/save_collection.js` that:

- builds `buildCollectionTask({ source: 'cli' })`
- calls `runCollectionExport()`
- prints totals and key paths

Update `package.json` with a new script:

- `"save-collection": "node scripts/save_collection.js"`

**Step 4: Run test to verify it passes**

Run: `node --test scripts/ai/__tests__/collection_export.test.js`

Expected: PASS

**Step 5: Commit**

```bash
git add scripts/save_collection.js package.json scripts/ai/__tests__/collection_export.test.js
git commit -m "feat: add unified collection save entrypoint"
```

### Task 3: Rewire UI collection export to the shared service

**Files:**
- Modify: `G:\UserCode\XiaoHongshu_Collection\scripts\ui_server.js`
- Modify: `G:\UserCode\XiaoHongshu_Collection\scripts\ai\__tests__\ui_server.test.js`
- Test: `G:\UserCode\XiaoHongshu_Collection\scripts\ai\__tests__\ui_server.test.js`

**Step 1: Write the failing test**

Add or update tests so `/api/save-collection`:

- calls the shared orchestrator instead of spawn-based dual scripts
- still returns normalized success payload
- still surfaces collection errors in the same way

**Step 2: Run test to verify it fails**

Run: `node --test scripts/ai/__tests__/ui_server.test.js`

Expected: FAIL because `ui_server.js` still uses `runNodeScript('scripts/extract_v4.js')` and `runNodeScript('scripts/ocr_and_write.js')`.

**Step 3: Write minimal implementation**

Modify `scripts/ui_server.js` to:

- import the shared collection export service
- build the same overrides object as today
- call the orchestrator directly
- map its result into the existing response contract

**Step 4: Run test to verify it passes**

Run: `node --test scripts/ai/__tests__/ui_server.test.js`

Expected: PASS

**Step 5: Commit**

```bash
git add scripts/ui_server.js scripts/ai/__tests__/ui_server.test.js
git commit -m "refactor: route ui collection export through shared service"
```

### Task 4: Keep legacy scripts as compatibility wrappers

**Files:**
- Modify: `G:\UserCode\XiaoHongshu_Collection\scripts\extract_v4.js`
- Modify: `G:\UserCode\XiaoHongshu_Collection\scripts\ocr_and_write.js`
- Modify: `G:\UserCode\XiaoHongshu_Collection\README.md`
- Test: `G:\UserCode\XiaoHongshu_Collection\scripts\ai\__tests__\extract_v4.test.js`

**Step 1: Write the failing test**

Add a small compatibility test or assertion that legacy commands still work or clearly point users to the unified flow.

**Step 2: Run test to verify it fails**

Run: `node --test scripts/ai/__tests__/extract_v4.test.js`

Expected: FAIL after the earlier refactor unless wrappers are made explicit.

**Step 3: Write minimal implementation**

Adjust legacy scripts so they either:

- remain callable and delegate to the shared collection service, or
- remain fetch-only / write-only with explicit compatibility messaging

Update `README.md` so the recommended collection path becomes the unified entrypoint.

**Step 4: Run test to verify it passes**

Run: `node --test scripts/ai/__tests__/extract_v4.test.js`

Expected: PASS

**Step 5: Commit**

```bash
git add scripts/extract_v4.js scripts/ocr_and_write.js README.md scripts/ai/__tests__/extract_v4.test.js
git commit -m "docs: mark unified collection flow as primary path"
```

### Task 5: Full verification

**Files:**
- Modify: none
- Test: `G:\UserCode\XiaoHongshu_Collection\scripts\ai\__tests__\*.test.js`

**Step 1: Run targeted tests**

Run: `node --test scripts/ai/__tests__/collection_export.test.js scripts/ai/__tests__/ui_server.test.js`

Expected: PASS

**Step 2: Run full test suite**

Run: `npm test`

Expected: PASS with all tests green.

**Step 3: Manual smoke check**

Run: `node scripts/save_collection.js`

Expected: Either a normal collection summary or a clear Chrome/login guidance message.

**Step 4: Commit verification**

```bash
git status --short
```

Expected: clean or only intentional doc updates remaining.

**Step 5: Commit**

```bash
git add .
git commit -m "refactor: unify collection export pipeline"
```

Plan complete and saved to `docs/plans/2026-03-18-collection-pipeline-unification.md`. Per your request, I should execute this in an isolated worktree and verify with tests.

# Zhihu Favorites Export Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add first-phase Zhihu favorites export support that can recognize favorites URLs, collect favorite item links with persisted progress, and reuse the existing single-page save pipeline for each Zhihu article or answer entry.

**Architecture:** Keep the current `save_note.js` single-page exporter unchanged as the per-item execution core, then add a separate favorites-directory layer responsible for Zhihu collection metadata, paginated item discovery, progress persistence, and batch orchestration. The UI should only be wired after the CLI path is stable, so phase one starts with URL detection, a dedicated favorites collector module, and a standalone batch command.

**Tech Stack:** Node.js built-ins, existing browser attach flow, current test runner `node --test`, current Markdown export pipeline, persisted JSON state files.

---

### Task 1: Recognize Zhihu favorites URLs and fail with a dedicated handoff message

**Files:**
- Modify: `scripts/lib/source_detector.js`
- Modify: `scripts/save_note.js`
- Modify: `scripts/ai/__tests__/source_detector.test.js`
- Modify: `scripts/ai/__tests__/save_note.test.js`

**Step 1: Write the failing test**

Add tests for:

- `https://www.zhihu.com/collection/<id>` is detected as `zhihu_collection`
- `fetchPageForMode()` rejects `zhihu_collection` with a clear “use favorites export flow” message without opening the browser

**Step 2: Run test to verify it fails**

Run: `node --test scripts/ai/__tests__/source_detector.test.js scripts/ai/__tests__/save_note.test.js`
Expected: FAIL because the detector and handoff message do not exist yet.

**Step 3: Write minimal implementation**

Implement:

- `zhihu_collection` detection in `scripts/lib/source_detector.js`
- an early guard in `scripts/save_note.js` that throws a dedicated error for favorites URLs instead of treating them as unsupported single pages

**Step 4: Run test to verify it passes**

Run: `node --test scripts/ai/__tests__/source_detector.test.js scripts/ai/__tests__/save_note.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add scripts/lib/source_detector.js scripts/save_note.js scripts/ai/__tests__/source_detector.test.js scripts/ai/__tests__/save_note.test.js
git commit -m "feat: detect zhihu favorites urls"
```

### Task 2: Add favorites metadata and progress file model

**Files:**
- Create: `scripts/lib/zhihu_favorites.js`
- Create: `scripts/ai/__tests__/zhihu_favorites.test.js`

**Step 1: Write the failing test**

Add tests for:

- parsing a favorites URL into collection ID
- building stable output paths for `output/知乎收藏夹/<标题>/`
- building `_state/export-progress-<id>.json`
- reading and writing progress payloads with exported item IDs and offsets

**Step 2: Run test to verify it fails**

Run: `node --test scripts/ai/__tests__/zhihu_favorites.test.js`
Expected: FAIL because the module does not exist yet.

**Step 3: Write minimal implementation**

Implement:

- URL parsing helpers
- output path helpers
- progress JSON read/write helpers

Keep this task free of live network fetching.

**Step 4: Run test to verify it passes**

Run: `node --test scripts/ai/__tests__/zhihu_favorites.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add scripts/lib/zhihu_favorites.js scripts/ai/__tests__/zhihu_favorites.test.js
git commit -m "feat: add zhihu favorites progress model"
```

### Task 3: Implement favorites item discovery with pagination and resume support

**Files:**
- Modify: `scripts/lib/zhihu_favorites.js`
- Modify: `scripts/ai/__tests__/zhihu_favorites.test.js`

**Step 1: Write the failing test**

Add tests for:

- collecting multiple pages of favorites items from mocked API responses
- skipping already exported item IDs from progress state
- preserving first-seen order
- continuing after one page or item-level parse failure while recording warnings

**Step 2: Run test to verify it fails**

Run: `node --test scripts/ai/__tests__/zhihu_favorites.test.js`
Expected: FAIL because the collector does not support pagination or resume.

**Step 3: Write minimal implementation**

Implement:

- paginated favorites item collection
- progress checkpoints after each page
- warning collection for failed or unsupported items
- light request pacing hooks so throttling can be added without refactoring later

**Step 4: Run test to verify it passes**

Run: `node --test scripts/ai/__tests__/zhihu_favorites.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add scripts/lib/zhihu_favorites.js scripts/ai/__tests__/zhihu_favorites.test.js
git commit -m "feat: add zhihu favorites pagination collector"
```

### Task 4: Add standalone CLI export that reuses the current single-page save pipeline

**Files:**
- Create: `scripts/save_zhihu_favorites.js`
- Modify: `package.json`
- Modify: `scripts/save_note.js` (only if a shared helper extraction is truly needed)
- Modify: `scripts/ai/__tests__/save_note.test.js` or create `scripts/ai/__tests__/save_zhihu_favorites.test.js`
- Modify: `README.md`

**Step 1: Write the failing test**

Add tests for:

- accepting a favorites URL input
- iterating collected entries through the current single-page save executor
- writing into `知乎收藏夹/<收藏夹标题>/`
- surfacing summary counts and warnings

**Step 2: Run test to verify it fails**

Run: `node --test scripts/ai/__tests__/save_zhihu_favorites.test.js`
Expected: FAIL because the CLI does not exist yet.

**Step 3: Write minimal implementation**

Implement a standalone CLI that:

- loads favorites metadata and progress
- collects favorite entries
- reuses existing per-item save helpers
- prints a familiar success/failure summary

Do not wire the homepage UI in this task.

**Step 4: Run test to verify it passes**

Run: `node --test scripts/ai/__tests__/save_zhihu_favorites.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add scripts/save_zhihu_favorites.js package.json README.md scripts/ai/__tests__/save_zhihu_favorites.test.js
git commit -m "feat: add zhihu favorites export cli"
```

### Task 5: Full verification and follow-up decision

**Files:**
- Review: `docs/analysis/2026-03-22-zhihu-favorites-export-research.md`
- Review: `docs/plans/2026-03-22-zhihu-favorites-export-implementation-plan.md`
- Verify: touched source and test files

**Step 1: Run syntax verification**

Run: `node --check scripts/lib/source_detector.js`
Run: `node --check scripts/lib/zhihu_favorites.js`
Run: `node --check scripts/save_note.js`
Run: `node --check scripts/save_zhihu_favorites.js`
Expected: all exit with code 0.

**Step 2: Run targeted tests**

Run: `node --test scripts/ai/__tests__/source_detector.test.js scripts/ai/__tests__/save_note.test.js scripts/ai/__tests__/zhihu_favorites.test.js scripts/ai/__tests__/save_zhihu_favorites.test.js`
Expected: PASS.

**Step 3: Run full repository tests**

Run: `npm test`
Expected: PASS with zero failures.

**Step 4: Decide UI timing**

After CLI stabilizes, choose one of:

- keep favorites export CLI-only for one more iteration
- add a UI entry in settings or the external inbox flow

Do not add the UI before CLI and progress resume are proven stable.

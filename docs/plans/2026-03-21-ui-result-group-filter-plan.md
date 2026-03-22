# UI Result Group Filter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let the result panel group saved links by final collection and quickly filter to one collection or failures.

**Architecture:** Keep the backend unchanged and derive grouping on the frontend from existing `report.results` fields such as `status`, `filepath`, `platform`, and warnings. Add a lightweight helper layer for deriving collection labels and group metadata, then render filter chips plus grouped result sections in `ui/app.js`.

**Tech Stack:** Vanilla JS, HTML, CSS, Node test runner, JSDOM

---

### Task 1: Plan Result Group Data Shape

**Files:**
- Modify: `ui/ui_helpers.js`
- Test: `scripts/ai/__tests__/ui_helpers.test.js`

**Step 1: Write the failing test**

Add tests that require:
- a helper to derive saved collection from `filepath`
- a helper or summary item that exposes current auto-classify mode

**Step 2: Run test to verify it fails**

Run: `node --test scripts/ai/__tests__/ui_helpers.test.js`
Expected: FAIL because the new helper or summary behavior does not exist yet.

**Step 3: Write minimal implementation**

Add helper functions that:
- derive final collection from `filepath`
- expose auto-classify status in summary chips

**Step 4: Run test to verify it passes**

Run: `node --test scripts/ai/__tests__/ui_helpers.test.js`
Expected: PASS

### Task 2: Add Settings Toggle Markup

**Files:**
- Modify: `ui/index.html`
- Test: `scripts/ai/__tests__/ui_index.test.js`

**Step 1: Write the failing test**

Add a test that expects:
- `runtime-auto-classify` input
- visible copy mentioning automatic classification for saved links

**Step 2: Run test to verify it fails**

Run: `node --test scripts/ai/__tests__/ui_index.test.js`
Expected: FAIL because the markup is not present.

**Step 3: Write minimal implementation**

Add one checkbox toggle under runtime settings and one short hint line.

**Step 4: Run test to verify it passes**

Run: `node --test scripts/ai/__tests__/ui_index.test.js`
Expected: PASS

### Task 3: Bind Runtime Toggle and Grouped Result Rendering

**Files:**
- Modify: `ui/app.js`
- Modify: `ui/styles.css`
- Test: `scripts/ai/__tests__/ui_app_warnings.test.js`
- Test: `scripts/ai/__tests__/ui_app_error_banner.test.js`

**Step 1: Write the failing test**

Add tests that require:
- runtime auto-classify toggle to read and save config
- successful link-save rows to display final collection
- grouped or filterable result rendering for saved items

**Step 2: Run test to verify it fails**

Run: `node --test scripts/ai/__tests__/ui_app_warnings.test.js scripts/ai/__tests__/ui_app_error_banner.test.js`
Expected: FAIL because the toggle binding and grouped rendering are missing.

**Step 3: Write minimal implementation**

Update `ui/app.js` to:
- read/write `runtime.autoClassifyLinksEnabled`
- compute per-result collection labels from helpers
- render filter chips and grouped blocks

Update `ui/styles.css` to:
- style filter chips
- style grouped result blocks and compact group headers

**Step 4: Run test to verify it passes**

Run: `node --test scripts/ai/__tests__/ui_app_warnings.test.js scripts/ai/__tests__/ui_app_error_banner.test.js`
Expected: PASS

### Task 4: Full Verification

**Files:**
- Verify only

**Step 1: Run focused UI verification**

Run: `node --test scripts/ai/__tests__/ui_index.test.js scripts/ai/__tests__/ui_helpers.test.js scripts/ai/__tests__/ui_app_error_banner.test.js scripts/ai/__tests__/ui_app_warnings.test.js`
Expected: PASS

**Step 2: Run full suite**

Run: `npm test`
Expected: PASS with 0 failing tests

**Step 3: Optional manual check**

Run local UI, trigger a mixed save, verify the result panel can filter `AI`, `工具`, and `失败`.

# Result Warning Visibility Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make warning-bearing result rows easier to find by adding per-group warning badges and a `有提示` filter.

**Architecture:** Extend the existing frontend-only grouping logic in `ui/app.js`. Groups already know their rows, so we can derive warning counts from `item.warnings`, expose a new filter option when needed, and render only warning rows when that filter is active. CSS adds a compact badge style without changing layout structure.

**Tech Stack:** Vanilla JS, CSS, Node test runner, JSDOM

---

### Task 1: Add the failing warning visibility tests

**Files:**
- Modify: `scripts/ai/__tests__/ui_app_warnings.test.js`
- Modify: `scripts/ai/__tests__/ui_markup.test.js`

**Step 1: Write the failing UI test**

Require:

- a `warnings` filter chip when warning rows exist
- a warning badge in the affected group header
- warning filter mode to show only warning rows/groups

**Step 2: Write the failing CSS test**

Require:

- `.result-group-warning-count`

**Step 3: Run focused tests**

Run: `node --test scripts/ai/__tests__/ui_app_warnings.test.js scripts/ai/__tests__/ui_markup.test.js`
Expected: FAIL because the warning-specific filter and badge do not exist yet.

### Task 2: Implement minimal warning badge and filter behavior

**Files:**
- Modify: `ui/app.js`
- Modify: `ui/styles.css`

**Step 1: Derive warning counts**

- count rows with warnings per group
- derive total warning row count for the filter chip

**Step 2: Render UI**

- append `有提示` filter when warnings exist
- render warning badge in group headers
- when filter is active, show only rows with warnings

**Step 3: Verify focused tests**

Run: `node --test scripts/ai/__tests__/ui_app_warnings.test.js scripts/ai/__tests__/ui_markup.test.js`
Expected: PASS

### Task 3: Update the audit report

**Files:**
- Modify: `docs/analysis/2026-03-21-ui-result-panel-audit.md`
- Modify: `docs/analysis/img/2026-03-21-ui-result-panel-audit.assets/capture_manifest.json`

**Step 1: Capture a preview screenshot**

Show at least one group header with the warning badge and warning filter visible.

**Step 2: Document the change**

Record that warning inspection now needs fewer clicks and less scanning.

### Task 4: Full verification

**Files:**
- Verify only

**Step 1: Run focused tests**

Run: `node --test scripts/ai/__tests__/ui_app_warnings.test.js scripts/ai/__tests__/ui_markup.test.js`
Expected: PASS

**Step 2: Run full suite**

Run: `npm test`
Expected: PASS with 0 failing tests

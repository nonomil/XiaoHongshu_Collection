# Result Group Action Hierarchy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce result-group header noise by keeping one primary action visible and moving secondary actions into a compact "更多" menu.

**Architecture:** Keep the current result grouping logic intact in `ui/app.js`, but change the header action rendering to a primary button plus a small toggle menu. All existing actions continue using the same link-collection logic and request APIs. CSS adds compact hierarchy styling and a positioned secondary menu.

**Tech Stack:** Vanilla JS, HTML, CSS, Node test runner, JSDOM

---

### Task 1: Add failing tests for the new action hierarchy

**Files:**
- Modify: `scripts/ai/__tests__/ui_group_run.test.js`
- Modify: `scripts/ai/__tests__/ui_markup.test.js`

**Step 1: Write the failing DOM test**

Require:

- a visible `run-links` button
- a `toggle-more` button
- a hidden secondary action menu containing copy/fill/export buttons

**Step 2: Write the failing CSS test**

Require:

- `.result-group-more-toggle`
- `.result-group-more-menu`
- primary action styling for the visible run button

**Step 3: Run the focused tests**

Run: `node --test scripts/ai/__tests__/ui_group_run.test.js scripts/ai/__tests__/ui_markup.test.js`
Expected: FAIL because the menu structure and styles do not exist yet.

### Task 2: Implement the minimal menu behavior

**Files:**
- Modify: `ui/app.js`
- Modify: `ui/styles.css`

**Step 1: Update result-group rendering**

- keep `开始保存本组` visible
- add a `更多` toggle button
- render copy/fill/export inside a hidden secondary menu

**Step 2: Add the minimal menu behavior**

- toggle menu open/close without collapsing the outer details
- close other open menus when a new one opens
- close the menu after a secondary action runs

**Step 3: Add compact styles**

- highlight the primary action
- style the small `更多` toggle
- style the floating secondary menu panel

### Task 3: Re-run screenshots and update the audit report

**Files:**
- Modify: `docs/analysis/2026-03-21-ui-result-panel-audit.md`
- Modify: `docs/analysis/img/2026-03-21-ui-result-panel-audit.assets/capture_manifest.json`

**Step 1: Capture a fresh desktop screenshot**

Verify the group summary looks calmer and the primary action stands out.

**Step 2: Update the audit report**

Document that grouped actions now have a clear primary/secondary hierarchy.

### Task 4: Full verification

**Files:**
- Verify only

**Step 1: Run focused tests**

Run: `node --test scripts/ai/__tests__/ui_group_run.test.js scripts/ai/__tests__/ui_markup.test.js`
Expected: PASS

**Step 2: Run full suite**

Run: `npm test`
Expected: PASS with 0 failing tests

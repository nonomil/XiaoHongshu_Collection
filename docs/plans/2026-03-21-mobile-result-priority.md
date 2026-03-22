# Mobile Result Priority Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show the result panel earlier on mobile so progress and failure feedback are visible before the input cards.

**Architecture:** Keep the existing HTML structure and change only responsive CSS. On small screens, reorder the two top-level layout children so `.result-card` renders before `.stack`, then tighten the empty-state spacing to avoid an oversized first card.

**Tech Stack:** HTML, CSS, Node test runner

---

### Task 1: Add the failing responsive-layout test

**Files:**
- Modify: `scripts/ai/__tests__/ui_markup.test.js`
- Test: `scripts/ai/__tests__/ui_markup.test.js`

**Step 1: Write the failing test**

Add a test that expects:

- a mobile media-query block
- `.result-card` to use `order: -1`
- `.result-empty-state` to reduce height or spacing on mobile

**Step 2: Run test to verify it fails**

Run: `node --test scripts/ai/__tests__/ui_markup.test.js`
Expected: FAIL because the responsive ordering rules do not exist yet.

### Task 2: Implement the minimal responsive CSS

**Files:**
- Modify: `ui/styles.css`
- Test: `scripts/ai/__tests__/ui_markup.test.js`

**Step 1: Write minimal implementation**

Inside the existing mobile media query:

- set `.result-card { order: -1; }`
- shrink `.result-empty-state` minimum height and padding for small screens

**Step 2: Run test to verify it passes**

Run: `node --test scripts/ai/__tests__/ui_markup.test.js`
Expected: PASS

### Task 3: Re-capture screenshots and update audit notes

**Files:**
- Modify: `docs/analysis/2026-03-21-ui-result-panel-audit.md`
- Create or update: `docs/analysis/img/2026-03-21-ui-result-panel-audit.assets/capture_manifest.json`

**Step 1: Capture fresh screenshots**

Run local headless Chrome screenshots for:

- desktop home
- mobile home

**Step 2: Update audit conclusions**

Document that mobile now surfaces the result card on first screen and note any remaining trade-offs.

### Task 4: Full verification

**Files:**
- Verify only

**Step 1: Run focused test**

Run: `node --test scripts/ai/__tests__/ui_markup.test.js`
Expected: PASS

**Step 2: Run full suite**

Run: `npm test`
Expected: PASS with 0 failing tests

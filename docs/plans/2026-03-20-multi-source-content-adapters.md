# Multi-Source Content Adapters Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add first-phase multi-source single-page save support for WeChat, Zhihu, and CSDN on top of the existing XiaoHongshu pipeline.

**Architecture:** Keep the current unified pipeline and add a small detection-and-adapter layer in the fetch step. Reuse the existing export, OCR, AI summary, reporting, and UI pathways by normalizing all extracted pages into the same payload shape already used by the current single-note exporter.

**Tech Stack:** Node.js, Chrome/CDP, existing UI server, existing Markdown export pipeline, Node test runner

---

### Task 1: Add source detection primitives

**Files:**
- Create: `scripts/lib/source_detector.js`
- Test: `scripts/ai/__tests__/source_detector.test.js`

**Step 1: Write the failing test**

Cover hostname and URL-based detection for:

- XiaoHongshu note URL
- WeChat article URL
- Zhihu article URL
- Zhihu answer URL
- CSDN article URL
- unknown generic URL

**Step 2: Run test to verify it fails**

Run: `node --test scripts/ai/__tests__/source_detector.test.js`

**Step 3: Write minimal implementation**

Implement a detector that returns:

- `xiaohongshu`
- `wechat_article`
- `zhihu_article`
- `zhihu_answer`
- `csdn_article`
- `generic_web`

**Step 4: Run test to verify it passes**

Run: `node --test scripts/ai/__tests__/source_detector.test.js`

**Step 5: Commit**

Commit message:

```bash
git add scripts/lib/source_detector.js scripts/ai/__tests__/source_detector.test.js
git commit -m "feat: add source detector for multi-source save flow"
```

### Task 2: Add normalized article adapter contract

**Files:**
- Create: `scripts/lib/sources/generic_types.js`
- Test: `scripts/ai/__tests__/generic_types.test.js`

**Step 1: Write the failing test**

Test a helper that normalizes article payloads into the existing export-compatible shape.

Required output fields:

- `platform`
- `sourceType`
- `sourceUrl`
- `canonicalUrl`
- `title`
- `author`
- `date`
- `content`
- `images`
- `comments`
- `collection`

**Step 2: Run test to verify it fails**

Run: `node --test scripts/ai/__tests__/generic_types.test.js`

**Step 3: Write minimal implementation**

Implement a normalizer that:

- fills empty arrays/default strings
- maps article payloads into the current export-compatible object
- keeps `comments` empty for non-XiaoHongshu sources

**Step 4: Run test to verify it passes**

Run: `node --test scripts/ai/__tests__/generic_types.test.js`

**Step 5: Commit**

```bash
git add scripts/lib/sources/generic_types.js scripts/ai/__tests__/generic_types.test.js
git commit -m "feat: add normalized article payload helper"
```

### Task 3: Add WeChat article adapter

**Files:**
- Create: `scripts/lib/sources/wechat_article.js`
- Test: `scripts/ai/__tests__/wechat_article.test.js`

**Step 1: Write the failing test**

Test extraction helpers against representative WeChat article HTML snippets for:

- title
- author
- publish date
- main content
- images

**Step 2: Run test to verify it fails**

Run: `node --test scripts/ai/__tests__/wechat_article.test.js`

**Step 3: Write minimal implementation**

Implement DOM extraction logic that prefers stable article container selectors and returns a normalized article payload.

**Step 4: Run test to verify it passes**

Run: `node --test scripts/ai/__tests__/wechat_article.test.js`

**Step 5: Commit**

```bash
git add scripts/lib/sources/wechat_article.js scripts/ai/__tests__/wechat_article.test.js
git commit -m "feat: add wechat article adapter"
```

### Task 4: Add Zhihu adapter

**Files:**
- Create: `scripts/lib/sources/zhihu.js`
- Test: `scripts/ai/__tests__/zhihu.test.js`

**Step 1: Write the failing test**

Cover:

- Zhihu article page extraction
- Zhihu answer page extraction
- title / author / content / images normalization

**Step 2: Run test to verify it fails**

Run: `node --test scripts/ai/__tests__/zhihu.test.js`

**Step 3: Write minimal implementation**

Implement article and answer extraction under one adapter with source subtypes.

**Step 4: Run test to verify it passes**

Run: `node --test scripts/ai/__tests__/zhihu.test.js`

**Step 5: Commit**

```bash
git add scripts/lib/sources/zhihu.js scripts/ai/__tests__/zhihu.test.js
git commit -m "feat: add zhihu adapter"
```

### Task 5: Add CSDN adapter

**Files:**
- Create: `scripts/lib/sources/csdn.js`
- Test: `scripts/ai/__tests__/csdn.test.js`

**Step 1: Write the failing test**

Cover:

- title
- author
- date
- article content
- image extraction

**Step 2: Run test to verify it fails**

Run: `node --test scripts/ai/__tests__/csdn.test.js`

**Step 3: Write minimal implementation**

Implement a CSDN article extractor returning the normalized payload.

**Step 4: Run test to verify it passes**

Run: `node --test scripts/ai/__tests__/csdn.test.js`

**Step 5: Commit**

```bash
git add scripts/lib/sources/csdn.js scripts/ai/__tests__/csdn.test.js
git commit -m "feat: add csdn adapter"
```

### Task 6: Wire adapters into the single-page save flow

**Files:**
- Modify: `scripts/save_note.js`
- Modify: `scripts/lib/task.js`
- Test: `scripts/ai/__tests__/save_note.test.js`

**Step 1: Write the failing test**

Add tests for:

- current-page save on WeChat article
- current-page save on Zhihu article
- current-page save on CSDN article
- existing XiaoHongshu save behavior unchanged

**Step 2: Run test to verify it fails**

Run: `node --test scripts/ai/__tests__/save_note.test.js`

**Step 3: Write minimal implementation**

Update save flow so fetch routing works like:

- detect current page/source
- if `xiaohongshu`, use existing specialized extractor
- otherwise dispatch to source adapter and normalize payload

Keep CLI contract unchanged for phase 1.

**Step 4: Run test to verify it passes**

Run: `node --test scripts/ai/__tests__/save_note.test.js`

**Step 5: Commit**

```bash
git add scripts/save_note.js scripts/lib/task.js scripts/ai/__tests__/save_note.test.js
git commit -m "feat: route single-page save through source adapters"
```

### Task 7: Surface platform in reports and UI

**Files:**
- Modify: `scripts/lib/report.js`
- Modify: `ui/app.js`
- Modify: `ui/ui_helpers.js`
- Test: `scripts/ai/__tests__/report.test.js`
- Test: `scripts/ai/__tests__/ui_app_warnings.test.js`
- Test: `scripts/ai/__tests__/ui_helpers.test.js`

**Step 1: Write the failing test**

Add expectations that report rows and UI can expose:

- `platform`
- a readable short label for each row

**Step 2: Run test to verify it fails**

Run:

```bash
node --test scripts/ai/__tests__/report.test.js scripts/ai/__tests__/ui_app_warnings.test.js scripts/ai/__tests__/ui_helpers.test.js
```

**Step 3: Write minimal implementation**

Ensure platform is preserved in report payloads and visible in UI result summaries without regressing existing XiaoHongshu wording.

**Step 4: Run test to verify it passes**

Run:

```bash
node --test scripts/ai/__tests__/report.test.js scripts/ai/__tests__/ui_app_warnings.test.js scripts/ai/__tests__/ui_helpers.test.js
```

**Step 5: Commit**

```bash
git add scripts/lib/report.js ui/app.js ui/ui_helpers.js scripts/ai/__tests__/report.test.js scripts/ai/__tests__/ui_app_warnings.test.js scripts/ai/__tests__/ui_helpers.test.js
git commit -m "feat: show platform in multi-source save reports"
```

### Task 8: Add source-focused smoke and regression coverage

**Files:**
- Modify: `README.md`
- Modify: `docs/plans/2026-03-20-multi-source-content-adapters-design.md`
- Test: existing relevant suites

**Step 1: Write/extend test checklist**

Document exact regression commands to run before completion.

**Step 2: Run focused suites**

Run:

```bash
node --test scripts/ai/__tests__/source_detector.test.js scripts/ai/__tests__/generic_types.test.js scripts/ai/__tests__/wechat_article.test.js scripts/ai/__tests__/zhihu.test.js scripts/ai/__tests__/csdn.test.js scripts/ai/__tests__/save_note.test.js scripts/ai/__tests__/ui_helpers.test.js scripts/ai/__tests__/ui_app_warnings.test.js
```

**Step 3: Run full suite**

Run:

```bash
npm test
```

**Step 4: Update docs**

Add short usage examples for supported article sources.

**Step 5: Commit**

```bash
git add README.md docs/plans/2026-03-20-multi-source-content-adapters-design.md
git commit -m "docs: add multi-source save usage notes"
```

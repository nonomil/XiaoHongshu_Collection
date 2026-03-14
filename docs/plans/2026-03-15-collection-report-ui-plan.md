# Collection Report + UI Error Banner Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a collection-export markdown report plus a UI error banner that shows actionable, compliant hints.

**Architecture:** Add small helper functions for report path/markdown generation and UI error display; wire them into existing persistence and UI request flows. Keep changes minimal, aligning with existing tests and config resolution.

**Tech Stack:** Node.js (node:test), browser UI (vanilla JS, HTML, CSS).

---

### Task 0: Environment Baseline (Worktree)

**Files:**
- None

**Step 1: Install dependencies for tests**

Run: `npm --prefix "G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui" install`
Expected: PASS (no npm error). If it fails, stop and capture the error before proceeding.

**Step 2: (Optional) Baseline test sanity**

Run: `node --test "G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui/scripts/ai/__tests__/ui_helpers.test.js"`
Expected: FAIL because `buildErrorDisplay` is missing.

**Step 3: Commit**

Skip commit for setup-only steps.

---

### Task 1: UI Error Display Helpers (TDD)

**Files:**
- Modify: `G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui/ui/ui_helpers.js`
- Modify: `G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui/scripts/ai/__tests__/ui_helpers.test.js`

**Step 1: Write/confirm the failing test**

Ensure tests include (or add) a case like:

```js
const result = helpers.buildErrorDisplay('未检测到登录账号，请在 Chrome 调试窗口登录后重试。');
assert.match(result.title, /失败/);
assert.match(result.message, /登录/);
assert.equal(result.hints.some((hint) => /登录/.test(hint)), true);
```

**Step 2: Run test to verify it fails**

Run: `node --test "G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui/scripts/ai/__tests__/ui_helpers.test.js"`
Expected: FAIL with `buildErrorDisplay` missing.

**Step 3: Implement minimal helper**

Add to `ui/ui_helpers.js`:

```js
function buildErrorDisplay(errorMessage = '') {
  const message = String(errorMessage || '').trim();
  const normalized = message.toLowerCase();
  const hints = [];

  if (/登录|未登录|账号|账户|cookie|session|auth/.test(message)) {
    hints.push('请在 Chrome 调试窗口重新登录后重试');
  }
  if (/频率|过快|限流|timeout|超时|too many|rate/.test(message) || /timeout/.test(normalized)) {
    hints.push('降低采集频率，稍后重试');
  }
  if (/账号异常|异常/.test(message)) {
    hints.push('账号异常可尝试切换账号或等待恢复');
  }
  if (hints.length === 0) {
    hints.push('查看日志或稍后重试');
  }

  return {
    title: '失败',
    message: message || '未知错误，请查看日志或稍后重试。',
    hints
  };
}
```

Export it in both module and browser exports:

```js
module.exports = { buildSummaryItems, openSettingsModal, closeSettingsModal, buildErrorDisplay };
window.XhsUiHelpers = { buildSummaryItems, openSettingsModal, closeSettingsModal, buildErrorDisplay };
```

**Step 4: Run test to verify it passes**

Run: `node --test "G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui/scripts/ai/__tests__/ui_helpers.test.js"`
Expected: PASS

**Step 5: Commit**

```bash
git -C "G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui" add "G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui/ui/ui_helpers.js" "G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui/scripts/ai/__tests__/ui_helpers.test.js"
git -C "G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui" commit -m "Add UI error display helper"
```

---

### Task 2: UI Error Banner Markup + Styles (TDD)

**Files:**
- Create: `G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui/scripts/ai/__tests__/ui_markup.test.js`
- Modify: `G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui/ui/index.html`
- Modify: `G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui/ui/styles.css`

**Step 1: Write the failing test**

Create `ui_markup.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const html = fs.readFileSync('G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui/ui/index.html', 'utf-8');
const css = fs.readFileSync('G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui/ui/styles.css', 'utf-8');

test('index.html contains error banner container', () => {
  assert.match(html, /id="error-banner"/);
});

test('styles.css contains error banner styles', () => {
  assert.match(css, /\.error-banner/);
});
```

**Step 2: Run test to verify it fails**

Run: `node --test "G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui/scripts/ai/__tests__/ui_markup.test.js"`
Expected: FAIL (banner not present yet).

**Step 3: Add error banner markup**

Insert in `ui/index.html` above the “执行结果” card:

```html
<section id="error-banner" class="error-banner" hidden>
  <div class="error-banner-head">
    <strong id="error-title">失败</strong>
    <button id="error-dismiss" class="icon-button" type="button" aria-label="关闭提示">×</button>
  </div>
  <p id="error-message" class="error-message"></p>
  <ul id="error-hints" class="error-hints"></ul>
</section>
```

**Step 4: Add styles**

In `ui/styles.css` add:

```css
.error-banner {
  border: 1px solid rgba(180, 35, 24, 0.25);
  background: rgba(180, 35, 24, 0.08);
  border-radius: 18px;
  padding: 16px 18px;
  display: grid;
  gap: 10px;
  margin-bottom: 16px;
}

.error-banner-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #b42318;
}

.error-message {
  margin: 0;
  color: #7a2a25;
  font-size: 13px;
  line-height: 1.6;
}

.error-hints {
  margin: 0;
  padding-left: 18px;
  color: #7a2a25;
  font-size: 12px;
  line-height: 1.6;
}
```

**Step 5: Run test to verify it passes**

Run: `node --test "G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui/scripts/ai/__tests__/ui_markup.test.js"`
Expected: PASS

**Step 6: Commit**

```bash
git -C "G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui" add "G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui/ui/index.html" "G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui/ui/styles.css" "G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui/scripts/ai/__tests__/ui_markup.test.js"
git -C "G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui" commit -m "Add UI error banner markup and styles"
```

---

### Task 3: Wire Error Banner in UI Logic (TDD)

**Files:**
- Modify: `G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui/ui/app.js`

**Step 1: Write/confirm failing behavior test (minimal)**

If no test exists, add a JSDOM-based test to `ui_helpers.test.js` verifying `buildErrorDisplay` output is consumed to render banner in DOM (or add a tiny helper if needed). Keep it minimal.

**Step 2: Implement banner wiring in app.js**

Add DOM refs:

```js
const errorBanner = document.getElementById('error-banner');
const errorTitle = document.getElementById('error-title');
const errorMessage = document.getElementById('error-message');
const errorHints = document.getElementById('error-hints');
const errorDismiss = document.getElementById('error-dismiss');
```

Add helpers:

```js
function clearErrorBanner() {
  if (errorBanner) errorBanner.hidden = true;
  if (errorTitle) errorTitle.textContent = '';
  if (errorMessage) errorMessage.textContent = '';
  if (errorHints) errorHints.innerHTML = '';
}

function renderErrorBanner(message) {
  const display = helpers.buildErrorDisplay ? helpers.buildErrorDisplay(message) : { title: '失败', message, hints: [] };
  if (errorTitle) errorTitle.textContent = display.title || '失败';
  if (errorMessage) errorMessage.textContent = display.message || '未知错误，请查看日志或稍后重试。';
  if (errorHints) {
    errorHints.innerHTML = '';
    (display.hints || []).forEach((hint) => {
      const li = document.createElement('li');
      li.textContent = hint;
      errorHints.appendChild(li);
    });
  }
  if (errorBanner) errorBanner.hidden = false;
}
```

Hook dismiss button:

```js
if (errorDismiss) {
  errorDismiss.addEventListener('click', () => clearErrorBanner());
}
```

In both `linksForm` and `collectionSubmit` handlers:
- Call `clearErrorBanner()` at start.
- On error: `renderErrorBanner(error.message || '请求失败')`.
- On success: keep banner hidden.

**Step 3: Run tests**

Run: `node --test "G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui/scripts/ai/__tests__/ui_helpers.test.js"`
Expected: PASS

**Step 4: Commit**

```bash
git -C "G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui" add "G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui/ui/app.js"
git -C "G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui" commit -m "Wire UI error banner"
```

---

### Task 4: Collection Report Helpers (TDD)

**Files:**
- Modify: `G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui/scripts/ai/__tests__/extract_v4.test.js`
- Modify: `G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui/scripts/extract_v4.js`

**Step 1: Write/confirm failing tests**

Ensure tests exist (or add) for `buildCollectionReportPath` and `buildCollectionReportMarkdown`, e.g.:

```js
const reportPath = buildCollectionReportPath({ outputRoot: 'G:/output', now: new Date(2026, 2, 15, 16, 9, 10) });
assert.equal(reportPath.includes('collection-export-20260315-160910.md'), true);

const markdown = buildCollectionReportMarkdown({ rawPath: 'G:/data/raw_notes.json', total: 2, failures: 1, failed: [ ... ] });
assert.match(markdown, /raw_notes\.json/);
assert.match(markdown, /降低频率|稍后重试|重新登录/);
```

**Step 2: Run test to verify it fails**

Run: `node --test "G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui/scripts/ai/__tests__/extract_v4.test.js"`
Expected: FAIL with missing helper functions.

**Step 3: Implement helpers in extract_v4.js**

Add helper functions:

```js
const { resolveCollectionOutputRoot } = require('./lib/collection_paths');

function formatTimestamp(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function buildCollectionReportPath({ outputRoot, now } = {}) {
  const root = outputRoot || resolveCollectionOutputRoot({ projectDir: PROJECT_DIR });
  const dir = path.join(root, '_reports');
  return path.join(dir, `collection-export-${formatTimestamp(now)}.md`);
}

function buildCollectionReportMarkdown({ rawPath, total, failures, failed } = {}) {
  const lines = [];
  const now = new Date();
  lines.push('# 收藏导出报告');
  lines.push('');
  lines.push(`- 时间: ${now.toLocaleString('zh-CN')}`);
  if (rawPath) lines.push(`- 原始数据: ${rawPath}`);
  lines.push(`- 总数: ${Number(total || 0)}`);
  lines.push(`- 失败: ${Number(failures || 0)}`);
  lines.push('');
  if (Array.isArray(failed) && failed.length > 0) {
    lines.push('## 失败明细');
    failed.forEach((item) => {
      const board = item.board || '';
      const noteId = item.noteId || '';
      const href = item.href || '';
      const error = item.error || '';
      lines.push(`- [${board}] ${noteId} ${href} ${error}`.trim());
    });
    lines.push('');
  }
  lines.push('## 合规建议');
  lines.push('- 重新登录后重试');
  lines.push('- 降低采集频率，稍后重试');
  lines.push('- 若账号异常，等待恢复或切换账号');
  lines.push('');
  return lines.join('\n');
}
```

Export the helpers.

**Step 4: Run test to verify it passes**

Run: `node --test "G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui/scripts/ai/__tests__/extract_v4.test.js"`
Expected: PASS

**Step 5: Commit**

```bash
git -C "G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui" add "G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui/scripts/extract_v4.js" "G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui/scripts/ai/__tests__/extract_v4.test.js"
git -C "G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui" commit -m "Add collection report helpers"
```

---

### Task 5: Write Report After Collection Export (TDD)

**Files:**
- Modify: `G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui/scripts/ai/__tests__/extract_v4.test.js`
- Modify: `G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui/scripts/extract_v4.js`

**Step 1: Write failing test for report writing**

Add a small test:

```js
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { writeCollectionReport } = require('../../extract_v4');

test('writeCollectionReport writes markdown report', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'xhs-report-'));
  const reportPath = writeCollectionReport({
    outputRoot: tmp,
    rawPath: path.join(tmp, 'raw_notes.json'),
    total: 1,
    failures: 1,
    failed: [{ board: 'AI', noteId: 'n1', href: 'https://xhs.com/explore/n1', error: 'note detail empty' }],
    now: new Date(2026, 2, 15, 16, 9, 10)
  });
  assert.equal(fs.existsSync(reportPath), true);
  const content = fs.readFileSync(reportPath, 'utf-8');
  assert.match(content, /note detail empty/);
});
```

**Step 2: Run test to verify it fails**

Run: `node --test "G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui/scripts/ai/__tests__/extract_v4.test.js"`
Expected: FAIL (helper missing).

**Step 3: Implement `writeCollectionReport`**

Add in `extract_v4.js`:

```js
function writeCollectionReport({ outputRoot, rawPath, total, failures, failed, now } = {}) {
  const reportPath = buildCollectionReportPath({ outputRoot, now });
  const reportDir = path.dirname(reportPath);
  fs.mkdirSync(reportDir, { recursive: true });
  const markdown = buildCollectionReportMarkdown({ rawPath, total, failures, failed });
  fs.writeFileSync(reportPath, markdown, 'utf-8');
  return reportPath;
}
```

Call it from `persistCollectionData` after saving `raw_notes.json`:

```js
const outputRoot = resolveCollectionOutputRoot({ projectDir: PROJECT_DIR });
const reportPath = writeCollectionReport({ outputRoot, rawPath: RAW_PATH, total, failures: failed.length, failed });
console.log(`Report: ${reportPath}`);
```

Export `writeCollectionReport`.

**Step 4: Run test to verify it passes**

Run: `node --test "G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui/scripts/ai/__tests__/extract_v4.test.js"`
Expected: PASS

**Step 5: Commit**

```bash
git -C "G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui" add "G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui/scripts/extract_v4.js" "G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui/scripts/ai/__tests__/extract_v4.test.js"
git -C "G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui" commit -m "Write collection report after export"
```

---

### Task 6: Final Verification

**Files:**
- None

**Step 1: Run key tests**

Run:
- `node --test "G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui/scripts/ai/__tests__/ui_helpers.test.js"`
- `node --test "G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui/scripts/ai/__tests__/ui_markup.test.js"`
- `node --test "G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui/scripts/ai/__tests__/extract_v4.test.js"`

Expected: All PASS.

**Step 2: Commit if any remaining changes**

```bash
git -C "G:/UserCode/XiaoHongshu_Collection/.worktrees/codex/collection-report-ui" status --short
```

If clean, stop. If not, commit any remaining fixes.

---

**Plan complete.**

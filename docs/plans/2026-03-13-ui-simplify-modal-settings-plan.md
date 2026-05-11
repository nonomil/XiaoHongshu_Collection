# UI Simplify Modal Settings Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Simplify the UI by moving settings into a modal, keeping a compact summary row and focused input/log areas with per-link progress.

**Architecture:** Keep the existing backend endpoints and data flow; restructure HTML/CSS and add lightweight UI helpers for modal toggling and summary rendering. Add small unit tests for UI helpers with jsdom.

**Tech Stack:** Vanilla HTML/CSS/JS, Node.js `node --test`, `jsdom` (dev dependency).

---

### Task 1: Add UI Helper Module + Tests

**Files:**
- Modify: `G:\UserCode\XiaoHongshu_Collection\.worktrees\codex-ui-simplify-modal\package.json`
- Create: `G:\UserCode\XiaoHongshu_Collection\.worktrees\codex-ui-simplify-modal\ui\ui_helpers.js`
- Create: `G:\UserCode\XiaoHongshu_Collection\.worktrees\codex-ui-simplify-modal\scripts\ai\__tests__\ui_helpers.test.js`

**Step 1: Write the failing test (and add jsdom dev dependency)**

```js
// G:\UserCode\XiaoHongshu_Collection\.worktrees\codex-ui-simplify-modal\scripts\ai\__tests__\ui_helpers.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

let helpers;
try {
  helpers = require('../../../ui/ui_helpers');
} catch (e) {
  helpers = null;
}

test('buildSummaryItems returns compact tokens', () => {
  assert.ok(helpers, 'ui_helpers module should exist');
  const items = helpers.buildSummaryItems({
    paths: { saveLinksOutputRoot: 'output/单条笔记保存' },
    naming: { conflictStrategy: 'content-aware' },
    runtime: { aiSummaryEnabled: false, visionOcrEnabled: false, ocrFallbackEnabled: false, maxImagesPerNote: 12 }
  });
  assert.equal(items.length >= 3, true);
});

test('modal helpers toggle open state', () => {
  assert.ok(helpers, 'ui_helpers module should exist');
  const dom = new JSDOM('<div id="overlay" hidden></div><div id="modal" hidden></div>');
  const overlay = dom.window.document.getElementById('overlay');
  const modal = dom.window.document.getElementById('modal');
  helpers.openSettingsModal({ overlay, modal });
  assert.equal(overlay.hidden, false);
  assert.equal(modal.hidden, false);
  helpers.closeSettingsModal({ overlay, modal });
  assert.equal(overlay.hidden, true);
  assert.equal(modal.hidden, true);
});
```

Also add `jsdom` as a dev dependency in `package.json`:

```json
{
  "devDependencies": {
    "jsdom": "^24.0.0"
  }
}
```

**Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL with module not found or missing exports.

**Step 3: Write minimal implementation**

```js
// G:\UserCode\XiaoHongshu_Collection\.worktrees\codex-ui-simplify-modal\ui\ui_helpers.js
function buildSummaryItems(config = {}) {
  const items = [];
  const paths = config.paths || {};
  if (paths.saveLinksOutputRoot) {
    items.push({ label: '输出路径', value: paths.saveLinksOutputRoot });
  }
  const naming = config.naming || {};
  if (naming.conflictStrategy) {
    items.push({ label: '冲突策略', value: naming.conflictStrategy === 'content-aware' ? '智能覆盖' : '直接覆盖' });
  }
  const runtime = config.runtime || {};
  const aiOn = runtime.aiSummaryEnabled !== false;
  const visionOn = runtime.visionOcrEnabled !== false;
  const ocrOn = runtime.ocrFallbackEnabled !== false;
  items.push({ label: 'AI/OCR', value: `${aiOn ? 'AI开' : 'AI关'} / ${visionOn ? 'Vision开' : 'Vision关'} / ${ocrOn ? 'OCR开' : 'OCR关'}` });
  if (runtime.maxImagesPerNote) {
    items.push({ label: 'OCR上限', value: String(runtime.maxImagesPerNote) });
  }
  return items;
}

function openSettingsModal({ overlay, modal } = {}) {
  if (overlay) overlay.hidden = false;
  if (modal) modal.hidden = false;
}

function closeSettingsModal({ overlay, modal } = {}) {
  if (overlay) overlay.hidden = true;
  if (modal) modal.hidden = true;
}

if (typeof module !== 'undefined') {
  module.exports = { buildSummaryItems, openSettingsModal, closeSettingsModal };
}

if (typeof window !== 'undefined') {
  window.XhsUiHelpers = { buildSummaryItems, openSettingsModal, closeSettingsModal };
}
```

**Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (all tests green)

**Step 5: Commit**

```bash
git add package.json package-lock.json ui/ui_helpers.js scripts/ai/__tests__/ui_helpers.test.js
git commit -m "test: add ui helper tests and module"
```

---

### Task 2: Restructure HTML Layout + Modal Markup

**Files:**
- Modify: `G:\UserCode\XiaoHongshu_Collection\.worktrees\codex-ui-simplify-modal\ui\index.html`

**Step 1: Update HTML structure**
- 顶部栏加入“设置”按钮
- 主界面增加摘要区容器
- 移除右侧常驻设置面板
- 新增遮罩层与设置弹窗结构
- 引入 `/ui_helpers.js` 脚本

**Step 2: Manual verification**
- 打开页面后，确认设置按钮显示在右上角
- 设置面板不再占据主界面
- 弹窗 DOM 结构存在且默认隐藏

**Step 3: Commit**

```bash
git add ui/index.html
git commit -m "feat: move settings into modal structure"
```

---

### Task 3: Update Styles for New Layout + Modal

**Files:**
- Modify: `G:\UserCode\XiaoHongshu_Collection\.worktrees\codex-ui-simplify-modal\ui\styles.css`

**Step 1: Add styles**
- 顶部栏布局与按钮
- 摘要区紧凑样式（标签式 chips）
- Modal 遮罩/容器/关闭按钮样式
- 主操作区与日志区在 1~2 列的视觉平衡

**Step 2: Manual verification**
- 视觉层级：标题 > 摘要 > 操作区 > 日志
- 弹窗居中、遮罩可点击关闭
- 移动端下布局不拥挤

**Step 3: Commit**

```bash
git add ui/styles.css
git commit -m "feat: restyle layout and modal"
```

---

### Task 4: Wire Modal + Summary + Existing Actions

**Files:**
- Modify: `G:\UserCode\XiaoHongshu_Collection\.worktrees\codex-ui-simplify-modal\ui\app.js`

**Step 1: Implement JS behavior**
- 使用 `window.XhsUiHelpers` 渲染摘要区
- 绑定设置按钮与遮罩/关闭事件
- 保存配置后更新摘要
- 保持现有保存流程与进度条逻辑不变

**Step 2: Manual verification**
- 点击“设置”打开弹窗
- ESC/遮罩关闭弹窗
- 保存配置后摘要区即时刷新
- 链接保存、收藏导出仍能正常执行

**Step 3: Commit**

```bash
git add ui/app.js
git commit -m "feat: wire modal and summary rendering"
```

---

### Task 5: Final Verification

**Files:**
- None (verification only)

**Step 1: Run full test suite**

Run: `npm test`
Expected: PASS (all tests green)

**Step 2: Manual smoke test**
- 启动 UI：`node scripts/ui_server.js`
- 打开 `http://127.0.0.1:3030/`
- 粘贴 2 条链接，确认逐条进度更新
- 设置弹窗可开关且摘要区显示准确

**Step 3: Commit (if any changes)**

```bash
git status -sb
```

---

**End of Plan**

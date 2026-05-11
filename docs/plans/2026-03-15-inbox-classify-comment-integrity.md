# Inbox Sync Classify & Comment Integrity Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add inbox-specific category routing and comment completeness metadata with clear warnings, plus UI editing for inbox categories.

**Architecture:** Introduce an inbox classifier module used only by inbox saves, inject a fixed inbox output root, and surface comment totals/warnings in note export and task summaries. UI settings store category JSON and feed inbox save.

**Tech Stack:** Node.js scripts, UI static HTML/JS, node:test.

---

### Task 1: UI Config + Settings Field for Inbox Categories

**Files:**
- Modify: `scripts/lib/ui_config.js`
- Modify: `ui/index.html`
- Modify: `ui/app.js`
- Test: `scripts/ai/__tests__/ui_config.test.js`
- Test: `scripts/ai/__tests__/ui_index.test.js`

**Step 1: Write the failing tests**

```js
// scripts/ai/__tests__/ui_config.test.js
// add a new test

test('loadUiConfig provides inbox categories defaults', () => {
  resetTmp();
  const cfg = loadUiConfig({ configPath: cfgPath });
  assert.ok(cfg.inbox);
  assert.deepEqual(cfg.inbox.categories, {});
});
```

```js
// scripts/ai/__tests__/ui_index.test.js
// extend test

assert.match(html, /收件箱分类规则/);
assert.match(html, /inbox-categories/);
```

**Step 2: Run tests to verify failure**

Run: `node --test scripts/ai/__tests__/ui_config.test.js scripts/ai/__tests__/ui_index.test.js`
Expected: FAIL (missing inbox defaults / missing settings UI)

**Step 3: Implement minimal UI config + settings field**

- In `scripts/lib/ui_config.js`, add default `inbox: { categories: {} }` and allow merge.
- In `ui/index.html`, add a panel section with a textarea:

```html
<label class="field">
  <span>收件箱分类规则 (JSON)</span>
  <textarea id="inbox-categories" rows="8" placeholder='{"AI": ["GPT"], "理财": ["ETF"]}'></textarea>
</label>
```

- In `ui/app.js`, read/save `inboxCategories` JSON:
  - Parse JSON on save; throw error if invalid.
  - On load, stringify categories to textarea (pretty JSON).

**Step 4: Run tests to verify pass**

Run: `node --test scripts/ai/__tests__/ui_config.test.js scripts/ai/__tests__/ui_index.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add scripts/lib/ui_config.js ui/index.html ui/app.js scripts/ai/__tests__/ui_config.test.js scripts/ai/__tests__/ui_index.test.js
git commit -m "ui: add inbox category json setting"
```

---

### Task 2: Inbox Classifier Module

**Files:**
- Create: `scripts/lib/inbox_classifier.js`
- Test: `scripts/ai/__tests__/inbox_classifier.test.js`

**Step 1: Write the failing test**

```js
// scripts/ai/__tests__/inbox_classifier.test.js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { classifyInboxNote, defaultInboxCategories } = require('../../lib/inbox_classifier');

test('classifyInboxNote matches default categories by keywords', () => {
  const category = classifyInboxNote({
    title: '红利低波策略',
    content: 'ETF 定投 收益率',
    tags: []
  });
  assert.equal(category, '理财');
});

test('classifyInboxNote falls back to 未分类', () => {
  const category = classifyInboxNote({ title: '随便写写', content: '测试', tags: [] });
  assert.equal(category, '未分类');
});
```

**Step 2: Run test to verify it fails**

Run: `node --test scripts/ai/__tests__/inbox_classifier.test.js`
Expected: FAIL (module missing)

**Step 3: Write minimal implementation**

```js
// scripts/lib/inbox_classifier.js
const DEFAULT_CATEGORIES = {
  AI: ['AI', '人工智能', 'LLM', 'GPT', 'Claude', 'Prompt', 'AIGC', 'RAG', 'Agent', 'Embedding', '向量', '微调'],
  理财: ['投资', '基金', 'ETF', '红利', '指数', '定投', '收益率', '资产配置', '债券', '股票', '回撤'],
  职场: ['简历', '面试', '求职', '晋升', '管理', '绩效', 'KPI', '沟通', '领导力', '职场'],
  学习: ['学习', '笔记', '复盘', '考试', '课程', '读书', '认知', '记忆', '知识体系'],
  工具: ['工具', '软件', '插件', '快捷键', '效率', 'Obsidian', 'Notion', 'Excel', '自动化'],
  数码: ['手机', '电脑', '相机', '耳机', '配置', '测评', '芯片', '续航', '屏幕'],
  生活: ['生活', '整理', '断舍离', '习惯', '健康', '作息'],
  健身: ['训练', '肌肉', '减脂', '增肌', '跑步', '力量', '健身房'],
  美食: ['食谱', '烹饪', '探店', '饮食', '甜品', '咖啡'],
  旅行: ['旅行', '攻略', '酒店', '签证', '行程', '机票'],
  家居: ['家装', '收纳', '软装', '家电'],
  母婴: ['育儿', '宝宝', '母婴', '早教'],
  美妆穿搭: ['护肤', '彩妆', '穿搭', '种草', 'OOTD'],
  情感: ['亲密关系', '心理', '情绪', '沟通', '两性'],
  未分类: []
};

function defaultInboxCategories() {
  return JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
}

function normalizeText(...parts) {
  return parts.filter(Boolean).join(' ').toLowerCase();
}

function classifyInboxNote({ title = '', content = '', tags = [] } = {}, categories = DEFAULT_CATEGORIES) {
  const text = normalizeText(title, content, Array.isArray(tags) ? tags.join(' ') : '');
  let best = { name: '未分类', score: 0 };
  for (const [name, keywords] of Object.entries(categories)) {
    if (!Array.isArray(keywords) || keywords.length === 0) continue;
    let score = 0;
    for (const keyword of keywords) {
      if (text.includes(String(keyword || '').toLowerCase())) score += 1;
    }
    if (score > best.score) best = { name, score };
  }
  return best.score > 0 ? best.name : '未分类';
}

module.exports = { classifyInboxNote, defaultInboxCategories };
```

**Step 4: Run test to verify it passes**

Run: `node --test scripts/ai/__tests__/inbox_classifier.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add scripts/lib/inbox_classifier.js scripts/ai/__tests__/inbox_classifier.test.js
git commit -m "feat: add inbox classifier"
```

---

### Task 3: Wire Inbox Save to Classifier + Output Root

**Files:**
- Modify: `scripts/lib/inbox_save.js`
- Modify: `scripts/save_note.js`
- Modify: `scripts/ui_server.js`
- Test: `scripts/ai/__tests__/inbox_save.test.js`
- Test: `scripts/ai/__tests__/save_note.test.js`

**Step 1: Write the failing tests**

```js
// scripts/ai/__tests__/save_note.test.js

test('saveLinksText applies collectionResolver to note collection', async () => {
  let captured;
  await saveLinksText('http://xhslink.com/o/short1', {
    resolveRedirectFn: async () => 'https://www.xiaohongshu.com/discovery/item/abc123',
    fetchNote: async () => ({ title: 'A', noteId: 'abc123', author: 'A', collection: '单条笔记保存', content: 'ETF', tags: [] }),
    collectionResolver: () => '理财',
    exportNote: async (payload) => {
      captured = payload.note.collection;
      return { filepath: 'x.md' };
    }
  });
  assert.equal(captured, '理财');
});
```

```js
// scripts/ai/__tests__/inbox_save.test.js

test('saveInboxUrls injects inbox output root and classifier', async () => {
  let seenOptions;
  await saveInboxUrls({
    pushbulletConfigPath: path.join(tmpDir, 'pushbullet.json'),
    saveLinksText: async (_text, options) => {
      seenOptions = options;
      return { total: 1, results: [] };
    },
    storeFactory: () => ({ readAll: async () => [{ url: 'https://www.xiaohongshu.com/discovery/item/abc' }] })
  });
  assert.match(seenOptions.outputRoot, /收件箱同步/);
  assert.equal(typeof seenOptions.collectionResolver, 'function');
});
```

**Step 2: Run tests to verify failure**

Run: `node --test scripts/ai/__tests__/save_note.test.js scripts/ai/__tests__/inbox_save.test.js`
Expected: FAIL (resolver not applied / inbox output root missing)

**Step 3: Implement minimal wiring**

- In `scripts/save_note.js`, accept `collectionResolver` (and optional `collectionOverride`). Apply it before export.
- In `scripts/lib/inbox_save.js`, build inbox output root as `output/收件箱同步`, resolve categories (UI config or default), and pass `collectionResolver` to `saveLinksText`.
- In `scripts/ui_server.js`, pass `uiConfig` into `saveInboxUrls` so inbox save uses UI categories.

**Step 4: Run tests to verify pass**

Run: `node --test scripts/ai/__tests__/save_note.test.js scripts/ai/__tests__/inbox_save.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add scripts/save_note.js scripts/lib/inbox_save.js scripts/ui_server.js scripts/ai/__tests__/save_note.test.js scripts/ai/__tests__/inbox_save.test.js
git commit -m "feat: categorize inbox saves and route output"
```

---

### Task 4: Comment Completeness Metadata + Warnings

**Files:**
- Modify: `scripts/lib/cdp_note.js`
- Modify: `scripts/lib/note_export.js`
- Modify: `scripts/save_note.js`
- Test: `scripts/ai/__tests__/note_export.test.js`

**Step 1: Write the failing test**

```js
// scripts/ai/__tests__/note_export.test.js

test('generateMarkdown includes comment total and collected', () => {
  const markdown = generateMarkdown({
    note: {
      title: '标题',
      noteId: 'abc123',
      author: '作者',
      collection: '单条笔记保存',
      date: '2026-03-08',
      tags: [],
      images: [],
      commentTotal: 10,
      comments: [{ content: 'a', author: 'x' }, { content: 'b', author: 'y' }]
    },
    content: '正文',
    ocrTexts: [],
    summary: '摘要',
    tags: ['标签1', '标签2', '标签3']
  });
  assert.match(markdown, /comment_total: 10/);
  assert.match(markdown, /comment_collected: 2/);
});
```

**Step 2: Run test to verify failure**

Run: `node --test scripts/ai/__tests__/note_export.test.js`
Expected: FAIL (frontmatter missing comment counts)

**Step 3: Implement minimal metadata + warnings**

- In `scripts/lib/cdp_note.js`, store `commentTotal` from `readCommentExpansionStateWithRetry` into result.
- In `scripts/lib/note_export.js`, add frontmatter fields `comment_total` and `comment_collected`.
- Add `warnings` to export result when `commentTotal > collected`.
- In `scripts/save_note.js`, include export warnings in summary results so UI raw report exposes them.

**Step 4: Run test to verify pass**

Run: `node --test scripts/ai/__tests__/note_export.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add scripts/lib/cdp_note.js scripts/lib/note_export.js scripts/save_note.js scripts/ai/__tests__/note_export.test.js
git commit -m "feat: surface comment completeness metadata"
```

---

### Task 5: Docs + Manual E2E

**Files:**
- Modify: `docs/guide/pushbullet-inbox.md`

**Step 1: Update docs**

Add:
- 默认输出目录为 `output/收件箱同步`。
- 说明 UI 设置里可编辑“收件箱分类规则 (JSON)”。

**Step 2: Commit**

```bash
git add docs/guide/pushbullet-inbox.md
git commit -m "docs: add inbox categorize notes guide"
```

**Step 3: Manual E2E**

Run:
- `npm run inbox:sync` (mode all if needed)
- `npm run inbox:save`

Verify:
- 收件箱内容保存到 `output/收件箱同步/<分类>/`。
- 目标笔记“红利低波长文投资攻略②”评论总数>=75，若未满应有明确提示与 warning。

---

**After all tasks:** Run `npm test` once and prepare final report.

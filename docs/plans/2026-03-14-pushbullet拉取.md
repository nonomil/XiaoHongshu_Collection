# Pushbullet 收件箱同步 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 增加 Pushbullet 日批量收件箱同步（UI + CLI），并默认将冲突策略改为覆盖。

**Architecture:** 新增 InboxStore + Provider（Pushbullet）+ Sync Orchestrator，通过 UI API 与 CLI 调用；收件箱统一 JSONL 存储，后续可扩展 IFTTT/OpenClaw/飞书。

**Tech Stack:** Node.js, HTTP API, JSONL storage, existing UI server + tests

---

### Task 1: 调整默认冲突策略（UI + CLI）

**Files:**
- Modify: `G:\UserCode\XiaoHongshu_Collection\scripts\lib\ui_config.js`
- Modify: `G:\UserCode\XiaoHongshu_Collection\scripts\lib\note_export.js`
- Test: `G:\UserCode\XiaoHongshu_Collection\scripts\ai\__tests__\ui_config.test.js`

**Step 1: 写失败测试**

```js
// scripts/ai/__tests__/ui_config.test.js
const cfg = loadUiConfig({ configPath: cfgPath });
expect(cfg.naming.conflictStrategy).toBe('overwrite');
```

**Step 2: 运行测试验证失败**

Run: `npm test`
Expected: FAIL (conflictStrategy 仍为 content-aware)

**Step 3: 最小实现**

```js
// scripts/lib/ui_config.js
naming: {
  conflictStrategy: 'overwrite',
  maxTitleLength: 80
}
```

```js
// scripts/lib/note_export.js
function writeSingleNoteMarkdown({ conflictStrategy = 'overwrite', ...rest }) {
  // 保持逻辑不变
}
```

**Step 4: 运行测试验证通过**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add scripts/lib/ui_config.js scripts/lib/note_export.js scripts/ai/__tests__/ui_config.test.js
git commit -m "feat: default conflict strategy to overwrite"
```

---

### Task 2: InboxStore（JSONL 收件箱）

**Files:**
- Create: `G:\UserCode\XiaoHongshu_Collection\scripts\lib\inbox_store.js`
- Test: `G:\UserCode\XiaoHongshu_Collection\scripts\ai\__tests__\inbox_store.test.js`

**Step 1: 写失败测试**

```js
// scripts/ai/__tests__/inbox_store.test.js
const store = createInboxStore({ filePath });
await store.append([{ url: 'https://example.com', source: 'pushbullet', timestamp: 1 }]);
const items = await store.readAll();
expect(items.length).toBe(1);
```

**Step 2: 运行测试验证失败**

Run: `npm test`
Expected: FAIL (inbox_store 不存在)

**Step 3: 最小实现**

```js
// scripts/lib/inbox_store.js
function createInboxStore({ filePath }) {
  return {
    async append(items) { /* 写 JSONL + 去重 */ },
    async readAll() { /* 读 JSONL */ }
  };
}
```

**Step 4: 运行测试验证通过**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add scripts/lib/inbox_store.js scripts/ai/__tests__/inbox_store.test.js
git commit -m "feat: add inbox store"
```

---

### Task 3: Pushbullet Provider（增量拉取）

**Files:**
- Create: `G:\UserCode\XiaoHongshu_Collection\scripts\lib\inbox_pushbullet.js`
- Test: `G:\UserCode\XiaoHongshu_Collection\scripts\ai\__tests__\inbox_pushbullet.test.js`

**Step 1: 写失败测试**

```js
// scripts/ai/__tests__/inbox_pushbullet.test.js
const provider = createPushbulletProvider({ accessToken: 'x', fetchImpl: mockFetch });
const { items, nextModified } = await provider.pull({ since: 0 });
expect(items[0].url).toBe('https://example.com');
```

**Step 2: 运行测试验证失败**

Run: `npm test`
Expected: FAIL

**Step 3: 最小实现**

```js
// scripts/lib/inbox_pushbullet.js
function createPushbulletProvider({ accessToken, fetchImpl = fetch }) {
  async function pull({ since }) {
    // 调用 /v2/pushes?modified_after=since
    // 解析 link 或正文内 URL
  }
  return { pull };
}
```

**Step 4: 运行测试验证通过**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add scripts/lib/inbox_pushbullet.js scripts/ai/__tests__/inbox_pushbullet.test.js
git commit -m "feat: add pushbullet inbox provider"
```

---

### Task 4: 后端 API + CLI

**Files:**
- Modify: `G:\UserCode\XiaoHongshu_Collection\scripts\ui_server.js`
- Create: `G:\UserCode\XiaoHongshu_Collection\scripts\inbox_sync.js`
- Modify: `G:\UserCode\XiaoHongshu_Collection\package.json`
- Test: `G:\UserCode\XiaoHongshu_Collection\scripts\ai\__tests__\ui_server.test.js`

**Step 1: 写失败测试**

```js
// scripts/ai/__tests__/ui_server.test.js
const res = await request(app).post('/api/inbox/sync').send({});
expect(res.status).toBe(200);
expect(res.body.ok).toBe(true);
```

**Step 2: 运行测试验证失败**

Run: `npm test`
Expected: FAIL (endpoint 不存在)

**Step 3: 最小实现**

```js
// scripts/ui_server.js
app.post('/api/inbox/sync', async (req, res) => {
  // 读取 ui_config pushbullet 配置
  // 调用 provider.pull + store.append
  // 返回统计
});
```

```js
// scripts/inbox_sync.js
// CLI 同步入口
```

```json
// package.json
"scripts": {
  "inbox:sync": "node scripts/inbox_sync.js"
}
```

**Step 4: 运行测试验证通过**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add scripts/ui_server.js scripts/inbox_sync.js package.json scripts/ai/__tests__/ui_server.test.js
git commit -m "feat: add inbox sync api and cli"
```

---

### Task 5: UI 接入

**Files:**
- Modify: `G:\UserCode\XiaoHongshu_Collection\ui\index.html`
- Modify: `G:\UserCode\XiaoHongshu_Collection\ui\app.js`
- Modify: `G:\UserCode\XiaoHongshu_Collection\ui\styles.css`

**Step 1: 写失败测试（如不做 UI 测试可跳过）**

```js
// 若不新增 UI 自动化测试，此步记录为手动验证
```

**Step 2: 手动验证前添加最小实现**

- 增加“同步收件箱”按钮
- 新增 Pushbullet Token 输入项
- 同步结果写到 UI 状态区

**Step 3: 手动验证**

Run:
- `node scripts/ui_server.js`
- 打开 `http://127.0.0.1:3030/`
Expected:
- 按钮可用，触发后有结果统计

**Step 4: Commit**

```bash
git add ui/index.html ui/app.js ui/styles.css
git commit -m "feat: add inbox sync button and pushbullet settings"
```

---

### Task 6: 文档与收尾

**Files:**
- Modify: `G:\UserCode\XiaoHongshu_Collection\docs\guide\xhs-collection-export.md` (或新增指南)
- Modify: `G:\UserCode\XiaoHongshu_Collection\docs\plans\pushbullet拉取\pushbullet拉取-step-by-step.md`

**Step 1: 更新使用说明**
- 如何获取 Token
- 如何每日同步

**Step 2: 勾选完成清单**

**Step 3: Commit**

```bash
git add docs/guide/xhs-collection-export.md docs/plans/pushbullet拉取/pushbullet拉取-step-by-step.md
git commit -m "docs: add pushbullet sync usage"
```

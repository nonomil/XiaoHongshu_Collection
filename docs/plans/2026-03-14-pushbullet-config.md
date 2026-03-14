# Pushbullet 配置外置与收件箱同步增强 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把 Pushbullet 配置迁移到 `config/pushbullet.json` 作为唯一来源，并为收件箱同步加入分页拉取与认证兼容。

**Architecture:** 新增 Pushbullet 配置模块负责读取/迁移/保存；UI/CLI 通过统一配置接口读写；同步逻辑用 `modified_after` + `cursor` 分页；Pushbullet 认证保持 Access-Token 头并兼容 Basic Auth。

**Tech Stack:** Node.js, JSON 文件配置, HTTP API, JSONL 存储

---

### Task 1: Pushbullet 配置模块与迁移

**Files:**
- Create: `G:\UserCode\XiaoHongshu_Collection\scripts\lib\pushbullet_config.js`
- Test: `G:\UserCode\XiaoHongshu_Collection\scripts\ai\__tests__\pushbullet_config.test.js`

**Step 1: 写失败测试**

```js
const cfg = loadPushbulletConfig({ configPath });
assert.equal(cfg._missing, true);
assert.equal(cfg.enabled, false);
```

```js
fs.writeFileSync(configPath, 'token-123', 'utf-8');
const cfg = loadPushbulletConfig({ configPath });
assert.equal(cfg.accessToken, 'token-123');
const stored = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
assert.equal(stored.accessToken, 'token-123');
```

**Step 2: 运行测试验证失败**

Run: `node --test scripts/ai/__tests__/pushbullet_config.test.js`
Expected: FAIL (module not found)

**Step 3: 最小实现**

```js
const DEFAULT_PUSHBULLET_CONFIG = {
  enabled: false,
  accessToken: '',
  lastModified: 0,
  inboxPath: 'data/inbox_links.jsonl'
};

function loadPushbulletConfig({ configPath }) {
  // missing -> defaults + _missing
  // json parse -> merge defaults
  // non-json text -> treat as token, save JSON back
}
```

**Step 4: 运行测试验证通过**

Run: `node --test scripts/ai/__tests__/pushbullet_config.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add scripts/lib/pushbullet_config.js scripts/ai/__tests__/pushbullet_config.test.js
git commit -m "feat: add pushbullet config loader"
```

---

### Task 2: UI 配置默认项清理

**Files:**
- Modify: `G:\UserCode\XiaoHongshu_Collection\scripts\lib\ui_config.js`
- Modify: `G:\UserCode\XiaoHongshu_Collection\scripts\ai\__tests__\ui_config.test.js`

**Step 1: 写失败测试**

```js
const cfg = loadUiConfig({ configPath: cfgPath });
assert.equal(cfg.pushbullet, undefined);
assert.equal(cfg.inbox, undefined);
```

**Step 2: 运行测试验证失败**

Run: `node --test scripts/ai/__tests__/ui_config.test.js`
Expected: FAIL

**Step 3: 最小实现**

```js
// remove pushbullet/inbox from DEFAULT_UI_CONFIG
```

**Step 4: 运行测试验证通过**

Run: `node --test scripts/ai/__tests__/ui_config.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add scripts/lib/ui_config.js scripts/ai/__tests__/ui_config.test.js
git commit -m "chore: drop pushbullet from ui config defaults"
```

---

### Task 3: 收件箱同步改为读取 pushbullet.json

**Files:**
- Modify: `G:\UserCode\XiaoHongshu_Collection\scripts\lib\inbox_sync.js`
- Test: `G:\UserCode\XiaoHongshu_Collection\scripts\ai\__tests__\inbox_sync.test.js`

**Step 1: 写失败测试**

```js
const result = await syncInbox({
  pushbulletConfigPath,
  providerFactory: () => ({ pull: async () => ({ items: [], nextModified: 10 }) }),
  storeFactory: () => ({ append: async () => ({ added: 0, skipped: 0 }) })
});
const stored = JSON.parse(fs.readFileSync(pushbulletConfigPath, 'utf-8'));
assert.equal(stored.lastModified, 10);
```

**Step 2: 运行测试验证失败**

Run: `node --test scripts/ai/__tests__/inbox_sync.test.js`
Expected: FAIL

**Step 3: 最小实现**

```js
async function syncInbox({ pushbulletConfigPath, providerFactory, storeFactory } = {}) {
  const config = loadPushbulletConfig({ configPath: pushbulletConfigPath });
  const provider = providerFactory ? providerFactory(config) : createPushbulletProvider({ accessToken: config.accessToken });
  const store = storeFactory ? storeFactory(config) : createInboxStore({ filePath: resolveInboxPath(config.inboxPath) });
  // update lastModified in pushbullet.json
}
```

**Step 4: 运行测试验证通过**

Run: `node --test scripts/ai/__tests__/inbox_sync.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add scripts/lib/inbox_sync.js scripts/ai/__tests__/inbox_sync.test.js
git commit -m "feat: sync inbox from pushbullet config"
```

---

### Task 4: UI Server 分离保存逻辑

**Files:**
- Modify: `G:\UserCode\XiaoHongshu_Collection\scripts\ui_server.js`
- Modify: `G:\UserCode\XiaoHongshu_Collection\scripts\ai\__tests__\ui_server.test.js`

**Step 1: 写失败测试**

```js
const postResponse = await requestJson(`${baseUrl}/api/ui-config`, {
  config: { pushbullet: { enabled: true, accessToken: 't' }, inbox: { path: 'data/inbox.jsonl' } }
});
const stored = JSON.parse(fs.readFileSync(pushbulletConfigPath, 'utf-8'));
assert.equal(stored.accessToken, 't');
assert.equal(stored.inboxPath, 'data/inbox.jsonl');
```

**Step 2: 运行测试验证失败**

Run: `node --test scripts/ai/__tests__/ui_server.test.js`
Expected: FAIL

**Step 3: 最小实现**

```js
// GET /api/ui-config -> merge ui.json + pushbullet.json
// POST /api/ui-config -> save ui.json (without pushbullet/inbox) + save pushbullet.json
// POST /api/inbox/sync -> call syncInbox({ pushbulletConfigPath })
```

**Step 4: 运行测试验证通过**

Run: `node --test scripts/ai/__tests__/ui_server.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add scripts/ui_server.js scripts/ai/__tests__/ui_server.test.js
git commit -m "feat: persist pushbullet config separately"
```

---

### Task 5: UI 读取与写入兼容

**Files:**
- Modify: `G:\UserCode\XiaoHongshu_Collection\ui\app.js`

**Step 1: 手动验证前添加最小实现**

```js
const inboxFromConfig = cfg.inbox?.path || cfg.pushbullet?.inboxPath || '';
```

**Step 2: 手动验证**

Run:
- `node scripts/ui_server.js`
- 打开 `http://127.0.0.1:3030/`
Expected:
- 保存设置后写入 pushbullet.json
- 重新打开 UI 能读出配置

**Step 3: Commit**

```bash
git add ui/app.js
git commit -m "chore: keep ui inbox path compatible"
```

---

### Task 6: Pushbullet Provider 分页与认证兼容

**Files:**
- Modify: `G:\UserCode\XiaoHongshu_Collection\scripts\lib\inbox_pushbullet.js`
- Modify: `G:\UserCode\XiaoHongshu_Collection\scripts\ai\__tests__\inbox_pushbullet.test.js`

**Step 1: 写失败测试**

```js
let calls = 0;
const mockFetch = async (url, opts) => {
  calls += 1;
  if (calls === 1) {
    assert.match(opts.headers.Authorization, /Basic/);
    return { ok: true, json: async () => ({ pushes: [{ type: 'link', url: 'https://a.com', modified: 10 }], cursor: 'c1' }) };
  }
  return { ok: true, json: async () => ({ pushes: [{ type: 'link', url: 'https://b.com', modified: 20 }] }) };
};
```

**Step 2: 运行测试验证失败**

Run: `node --test scripts/ai/__tests__/inbox_pushbullet.test.js`
Expected: FAIL

**Step 3: 最小实现**

```js
function buildAuthHeaders(accessToken) {
  const encoded = Buffer.from(`${accessToken}:`).toString('base64');
  return {
    'Access-Token': accessToken,
    Authorization: `Basic ${encoded}`
  };
}

async function pull({ since = 0 } = {}) {
  let cursor = '';
  const items = [];
  let nextModified = Number(since) || 0;
  do {
    const url = `${baseUrl}/pushes?modified_after=${encodeURIComponent(since)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    // fetch -> merge pushes -> update cursor
  } while (cursor);
  return { items, nextModified };
}
```

**Step 4: 运行测试验证通过**

Run: `node --test scripts/ai/__tests__/inbox_pushbullet.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add scripts/lib/inbox_pushbullet.js scripts/ai/__tests__/inbox_pushbullet.test.js
git commit -m "feat: add pushbullet pagination and basic auth"
```

---

### Task 7: 文档更新

**Files:**
- Modify: `G:\UserCode\XiaoHongshu_Collection\docs\guide\pushbullet-inbox.md`
- Modify: `G:\UserCode\XiaoHongshu_Collection\docs\plans\pushbullet拉取\pushbullet拉取-step-by-step.md`

**Step 1: 更新使用说明**
- 标明配置写入 `config/pushbullet.json`
- 写明迁移规则（纯文本 Token 自动转 JSON）
- 说明 UI/CLI 统一读取

**Step 2: 勾选清单或补充新项**

**Step 3: Commit**

```bash
git add docs/guide/pushbullet-inbox.md docs/plans/pushbullet拉取/pushbullet拉取-step-by-step.md
git commit -m "docs: document pushbullet config file"
```

---

### Task 8: 全量测试与收尾

**Step 1: 运行全量测试**

Run: `npm test`
Expected: PASS

**Step 2: 收尾说明**
- 更新验收勾选
- 记录未做的现实拉取验证

**Step 3: Commit**

```bash
git add docs/plans/pushbullet拉取/pushbullet拉取-step-by-step.md
git commit -m "docs: mark pushbullet config acceptance"
```

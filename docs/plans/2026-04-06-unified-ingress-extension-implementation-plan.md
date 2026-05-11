# Unified Ingress Extension Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 构建一个“浏览器里一键把当前页/链接送进现有归档管线”的最小可用方案，并为后续云端、飞书、Pushbullet、多端接入保留统一入站接口。

**Architecture:** 保持现有 `scripts/`、`ui/`、保存链路不大迁移，在主工程新增统一 ingress API，在 `prj/chrome-extension/` 新建轻量插件工程，先支持“本地立即执行”和“本地入队”两种模式。第二阶段再把同一套 ingress 扩展到云端和多入口 webhook。

**Tech Stack:** Node.js、原生 HTTP server、Chrome Extension Manifest V3、现有 `save_note` / `saveLinksText` / inbox JSONL 链路、Node test runner

---

### Task 1: 固化 `prj/` 目录约定与入口文档

**Files:**
- Create: `prj/README.md`
- Create: `prj/chrome-extension/README.md`
- Create: `prj/desktop-exe/README.md`
- Modify: `README.md`

**Step 1: 写失败前置检查**

检查当前仓库中是否已经存在 `prj/` 相关约定；如果没有，记录为新增目录规范。

Run: `git ls-files "prj/*" "prj/**/*"`

Expected: 不存在或为空

**Step 2: 写最小目录说明**

在 `prj/README.md` 里说明：

- `chrome-extension/` 是浏览器入口层
- `desktop-exe/` 是桌面包装层
- 主工程 `scripts/`、`ui/` 仍是归档内核

**Step 3: 更新主 README**

在 `README.md` 中补充：

- `prj/` 的职责
- 插件入口与主工程的关系
- 本地优先、云端扩展在后的定位

**Step 4: 验证文档引用**

Run: `git grep -n "prj/" README.md prj/`

Expected: 能看到目录约定和职责说明

**Step 5: Commit**

```bash
git add README.md prj/README.md prj/chrome-extension/README.md prj/desktop-exe/README.md
git commit -m "docs: add prj product incubation layout"
```

### Task 2: 为统一入站扩展任务与 inbox 元数据

**Files:**
- Modify: `scripts/lib/task.js`
- Modify: `scripts/lib/inbox_store.js`
- Modify: `scripts/lib/inbox_save.js`
- Test: `scripts/ai/__tests__/inbox_store.test.js`
- Test: `scripts/ai/__tests__/inbox_save.test.js`
- Create: `scripts/ai/__tests__/task_ingress.test.js`

**Step 1: 写失败测试**

新增测试覆盖：

- `task` 能接受 `source=chrome-extension`
- `task` 能带 `route`、`delivery_mode`、`metadata`
- inbox append 会保留额外元数据字段

Run: `node --test scripts/ai/__tests__/task_ingress.test.js scripts/ai/__tests__/inbox_store.test.js scripts/ai/__tests__/inbox_save.test.js`

Expected: FAIL，提示缺少 ingress 字段支持或字段被丢弃

**Step 2: 最小实现任务扩展**

在 `task.js` 增加：

- ingress 任务构造器，或扩展现有 note-save task 构造器
- `route`
- `delivery_mode`
- `metadata`

保持向后兼容，不破坏现有 CLI/UI 调用。

**Step 3: 最小实现 inbox 元数据保留**

在 `inbox_store.js` 中保证写入与读取保留以下字段：

- `url`
- `source`
- `route`
- `delivery_mode`
- `requested_at`
- `metadata`

**Step 4: 回归运行测试**

Run: `node --test scripts/ai/__tests__/task_ingress.test.js scripts/ai/__tests__/inbox_store.test.js scripts/ai/__tests__/inbox_save.test.js`

Expected: PASS

**Step 5: Commit**

```bash
git add scripts/lib/task.js scripts/lib/inbox_store.js scripts/lib/inbox_save.js scripts/ai/__tests__/task_ingress.test.js scripts/ai/__tests__/inbox_store.test.js scripts/ai/__tests__/inbox_save.test.js
git commit -m "feat: extend task and inbox metadata for ingress sources"
```

### Task 3: 新增本地 ingress API

**Files:**
- Modify: `scripts/ui_server.js`
- Modify: `scripts/lib/report.js`
- Create: `scripts/lib/ingress.js`
- Test: `scripts/ai/__tests__/ui_server.test.js`
- Create: `scripts/ai/__tests__/ingress.test.js`

**Step 1: 写失败测试**

新增测试覆盖：

- `POST /api/ingress/save-link` 校验 `url`
- 可选择 `immediate` 执行
- 可选择 `queue` 入队
- 返回统一的 accepted / execution 字段

Run: `node --test scripts/ai/__tests__/ingress.test.js scripts/ai/__tests__/ui_server.test.js`

Expected: FAIL，接口不存在或响应结构不匹配

**Step 2: 提取 ingress 逻辑**

在 `scripts/lib/ingress.js` 实现：

- payload 校验
- URL 规范化
- 立即执行分支
- 入队分支
- 响应结构统一

**Step 3: 接入 `ui_server.js`**

新增路由：

- `POST /api/ingress/save-link`
- `POST /api/ingress/enqueue-link`

要求：

- 保持仅本地监听
- 不影响现有 UI 路由
- 复用现有 `saveLinksText` / `saveInboxUrls` / task 构造能力

**Step 4: 跑测试确认通过**

Run: `node --test scripts/ai/__tests__/ingress.test.js scripts/ai/__tests__/ui_server.test.js`

Expected: PASS

**Step 5: Commit**

```bash
git add scripts/ui_server.js scripts/lib/ingress.js scripts/lib/report.js scripts/ai/__tests__/ingress.test.js scripts/ai/__tests__/ui_server.test.js
git commit -m "feat: add local ingress api for one-click link save"
```

### Task 4: 为本地工作台补充 ingress 状态与最近任务入口

**Files:**
- Modify: `ui/app.js`
- Modify: `ui/index.html`
- Modify: `ui/styles.css`
- Test: `scripts/ai/__tests__/ui_index.test.js`
- Test: `scripts/ai/__tests__/ui_markup.test.js`
- Create: `scripts/ai/__tests__/ui_ingress_status.test.js`

**Step 1: 写失败测试**

新增测试覆盖：

- 页面存在 ingress 简介或最近任务入口说明
- 存在“插件/外部入口”相关文案位置
- 样式类名存在且不会破坏当前布局

Run: `node --test scripts/ai/__tests__/ui_index.test.js scripts/ai/__tests__/ui_markup.test.js scripts/ai/__tests__/ui_ingress_status.test.js`

Expected: FAIL

**Step 2: 最小 UI 补充**

只增加轻量信息层，不加入复杂配置：

- 当前是否可接收插件请求的状态提示
- 最近入站任务说明
- 打开工作台后的排障提示

**Step 3: 跑前端静态测试**

Run: `node --test scripts/ai/__tests__/ui_index.test.js scripts/ai/__tests__/ui_markup.test.js scripts/ai/__tests__/ui_ingress_status.test.js`

Expected: PASS

**Step 4: Commit**

```bash
git add ui/app.js ui/index.html ui/styles.css scripts/ai/__tests__/ui_index.test.js scripts/ai/__tests__/ui_markup.test.js scripts/ai/__tests__/ui_ingress_status.test.js
git commit -m "feat: expose ingress status in local workbench"
```

### Task 5: 搭建 Chrome 插件 MVP 骨架

**Files:**
- Create: `prj/chrome-extension/manifest.json`
- Create: `prj/chrome-extension/service_worker.js`
- Create: `prj/chrome-extension/popup.html`
- Create: `prj/chrome-extension/popup.css`
- Create: `prj/chrome-extension/popup.js`
- Create: `prj/chrome-extension/icons/.gitkeep`
- Create: `prj/chrome-extension/README.md`

**Step 1: 先写骨架验收清单**

定义最低验收：

- `load unpacked` 可加载
- 点击 popup 可读取当前标签页 URL
- 有本地发送按钮
- 有“打开工作台”按钮

**Step 2: 写最小 MV3 文件**

`manifest.json` 至少包含：

- `manifest_version`
- `name`
- `version`
- `action.default_popup`
- `permissions`
- `host_permissions`
- `background.service_worker`

**Step 3: 写 popup 最小交互**

`popup.js` 实现：

- 读取当前活动标签页
- 调用本地 ingress API
- 展示成功 / 失败文案
- 提供打开 `http://127.0.0.1:3030/` 的按钮

**Step 4: 手工验证**

Run:

```bash
start chrome --load-extension="G:\\UserCode\\XiaoHongshu_Collection\\prj\\chrome-extension"
```

Expected:

- 插件可加载
- popup 可展示当前页
- 点击保存时能命中本地 API

**Step 5: Commit**

```bash
git add prj/chrome-extension/
git commit -m "feat: scaffold chrome extension ingress mvp"
```

### Task 6: 打通插件到本地 ingress 的端到端链路

**Files:**
- Modify: `prj/chrome-extension/popup.js`
- Modify: `scripts/lib/ingress.js`
- Modify: `scripts/ui_server.js`
- Test: `scripts/ai/__tests__/ingress.test.js`
- Add verification note: `docs/analysis/2026-04-06-chrome-extension-local-ingress-smoke.md`

**Step 1: 写失败测试或手工验收清单**

覆盖：

- 小红书 URL 发送成功
- 知乎 URL 发送成功
- 本地服务未启动时插件报错明确

Run: `node --test scripts/ai/__tests__/ingress.test.js`

Expected: 如交互字段不完整则 FAIL

**Step 2: 完善 popup 提交逻辑**

要求：

- 读取当前标签页标题
- 读取当前 URL
- 发送 `source=chrome-extension`
- 默认走 `route=local`
- 默认走 `delivery_mode=immediate`

**Step 3: 做手工 smoke test**

手工场景：

- 打开本地工作台
- 随机访问知乎文章或小红书笔记页
- 点插件按钮保存
- 在工作台结果区或输出目录验证结果

**Step 4: 记录验证结果**

将手工验证结论写入 `docs/analysis/2026-04-06-chrome-extension-local-ingress-smoke.md`

**Step 5: Commit**

```bash
git add prj/chrome-extension/popup.js scripts/lib/ingress.js scripts/ui_server.js docs/analysis/2026-04-06-chrome-extension-local-ingress-smoke.md
git commit -m "feat: connect chrome extension to local ingress api"
```

### Task 7: 为云端接入预留配置但不默认启用

**Files:**
- Modify: `prj/chrome-extension/popup.html`
- Modify: `prj/chrome-extension/popup.js`
- Modify: `scripts/lib/ui_config.js`
- Modify: `README.md`
- Test: `scripts/ai/__tests__/ui_config.test.js`

**Step 1: 写失败测试**

覆盖：

- UI 配置可保存 ingress endpoint
- 插件可读取默认本地 endpoint
- 可切换到云端 endpoint，但默认仍为本地

Run: `node --test scripts/ai/__tests__/ui_config.test.js`

Expected: FAIL

**Step 2: 最小实现云端配置**

先只增加配置项，不做公网部署：

- `ingress.local_base_url`
- `ingress.cloud_base_url`
- `ingress.default_route`

插件侧可显示但默认只启用本地。

**Step 3: 运行测试**

Run: `node --test scripts/ai/__tests__/ui_config.test.js`

Expected: PASS

**Step 4: Commit**

```bash
git add prj/chrome-extension/popup.html prj/chrome-extension/popup.js scripts/lib/ui_config.js README.md scripts/ai/__tests__/ui_config.test.js
git commit -m "feat: reserve cloud ingress routing configuration"
```

### Task 8: 扩展统一 inbox 入口以兼容 Pushbullet / 飞书 / 手机分享

**Files:**
- Modify: `scripts/lib/inbox_sync.js`
- Modify: `scripts/lib/inbox_save.js`
- Modify: `scripts/lib/inbox_store.js`
- Create: `scripts/lib/ingress_webhook.js`
- Create: `scripts/ai/__tests__/ingress_webhook.test.js`
- Modify: `README.md`

**Step 1: 写失败测试**

覆盖：

- webhook payload 能写入统一 inbox
- `source` 字段能区分 `pushbullet` / `feishu` / `mobile-share`
- 不破坏现有 Pushbullet 同步行为

Run: `node --test scripts/ai/__tests__/ingress_webhook.test.js scripts/ai/__tests__/inbox_save.test.js scripts/ai/__tests__/inbox_store.test.js`

Expected: FAIL

**Step 2: 最小实现 webhook 入站**

实现一个轻量入口：

- 接收外部 URL
- 写入 inbox
- 标记来源
- 不立即抓取

**Step 3: 跑回归测试**

Run: `node --test scripts/ai/__tests__/ingress_webhook.test.js scripts/ai/__tests__/inbox_save.test.js scripts/ai/__tests__/inbox_store.test.js`

Expected: PASS

**Step 4: Commit**

```bash
git add scripts/lib/inbox_sync.js scripts/lib/inbox_save.js scripts/lib/inbox_store.js scripts/lib/ingress_webhook.js scripts/ai/__tests__/ingress_webhook.test.js README.md
git commit -m "feat: unify webhook and inbox link ingestion"
```

### Task 9: 云端部署草案与安全基线

**Files:**
- Create: `docs/plans/2026-04-06-cloud-ingress-deployment-notes.md`
- Create: `config/ingress.example.json`
- Modify: `README.md`

**Step 1: 写部署说明**

记录：

- VPS 上如何启 ingress API
- 仅本地监听与公网监听的差异
- token 鉴权要求
- OpenClaw 监控接入点

**Step 2: 写示例配置**

在 `config/ingress.example.json` 中给出：

- 本地端点
- 云端端点
- token 占位
- 默认路由

**Step 3: 检查文档引用**

Run: `git grep -n "ingress" README.md docs/plans/2026-04-06-cloud-ingress-deployment-notes.md config/ingress.example.json`

Expected: 可看到部署与配置说明

**Step 4: Commit**

```bash
git add docs/plans/2026-04-06-cloud-ingress-deployment-notes.md config/ingress.example.json README.md
git commit -m "docs: add cloud ingress deployment baseline"
```

### Task 10: 完成总体验证与交付说明

**Files:**
- Create: `docs/analysis/2026-04-06-unified-ingress-verification.md`
- Modify: `README.md`

**Step 1: 运行本地测试集合**

Run:

```bash
node --test \
  scripts/ai/__tests__/task_ingress.test.js \
  scripts/ai/__tests__/ingress.test.js \
  scripts/ai/__tests__/inbox_store.test.js \
  scripts/ai/__tests__/inbox_save.test.js \
  scripts/ai/__tests__/ui_server.test.js \
  scripts/ai/__tests__/ui_index.test.js \
  scripts/ai/__tests__/ui_markup.test.js
```

Expected: PASS

**Step 2: 执行手工验收**

至少覆盖：

- 插件保存当前知乎页到本地
- 插件保存当前小红书页到本地
- 插件在本地服务未启动时给出明确信息
- webhook / Pushbullet 写入统一 inbox

**Step 3: 记录验证报告**

在 `docs/analysis/2026-04-06-unified-ingress-verification.md` 中记录：

- 测试命令
- 手工步骤
- 成功项
- 已知限制

**Step 4: Commit**

```bash
git add docs/analysis/2026-04-06-unified-ingress-verification.md README.md
git commit -m "docs: record unified ingress verification results"
```

---

## Implementation Notes

- 所有新增入口必须优先复用现有保存链路，不重写 `save_note` 的主逻辑。
- 插件第一阶段只做当前页 URL 发送，不做复杂 DOM 提取。
- 云端第一阶段只保证“接收并入队”，不默认承诺小红书立刻完整抓取。
- 如需公网 ingress，必须先补 token 校验，再谈部署。
- 现有工作区有未提交改动，实现时必须避免覆盖无关文件变更。

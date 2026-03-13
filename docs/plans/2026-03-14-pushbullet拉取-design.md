# Pushbullet 拉取与收件箱扩展设计
日期：2026-03-14

## 背景与动机
当前项目的核心场景是“从手机/网页端把小红书链接送到电脑并保存为本地 Markdown”。
现有 UI/CLI 已能保存链接，但缺少一个轻量“跨设备收件箱”。

目标是提供一个低门槛、可扩展的入口：
- 先接入 Pushbullet（每日批量拉取即可）。
- 预留通用收件箱接口，后续可接 IFTTT / OpenClaw / 飞书 / 其他渠道。

## 目标
- 新增“收件箱同步”能力：UI 与 CLI 都能触发。
- Pushbullet 作为首个来源，支持增量拉取（modified_after）。
- 默认冲突策略改为覆盖（UI + CLI）。
- 收件箱结构统一，后续可接多来源。

## 非目标
- 不做实时推送与 WebSocket 监听（先日批量即可）。
- 不做多账户复杂管理。
- 不引入 OpenClaw 或重型编排系统。

## 范围与优先级
- 这是扩展能力，不置于最前优先级。
- 主线功能保持稳定，扩展模块独立、可选启用。

## 架构与数据流
### 核心模块
1. InboxStore：负责写入/读取/去重收件箱。
2. InboxProvider 接口：统一来源。
3. PushbulletProvider：实现 pull() 拉取。

### 数据流（UI）
1. 用户点击“同步收件箱”。
2. UI 调用后端 `/api/inbox/sync`。
3. 后端调用 Pushbullet 拉取增量。
4. 解析链接，写入收件箱（去重）。
5. 返回本次新增/跳过/错误统计。

### 数据流（CLI）
1. 运行 `node scripts/inbox_sync.js` 或 `npm run inbox:sync`。
2. 同步结果输出到终端，并写入收件箱。

## 配置与存储
### UI 配置（ui_config.json）
- `pushbullet.enabled`: boolean
- `pushbullet.accessToken`: string (本地保存)
- `pushbullet.lastModified`: number (Unix 秒)
- `inbox.path`: string (默认 `data/inbox_links.jsonl`)

### 收件箱格式
- JSONL 一行一个条目，字段包含：
  - `source`: string (pushbullet/ifttt/openclaw/feishu)
  - `url`: string
  - `title`: string (可选)
  - `timestamp`: number
  - `raw`: object (可选，保留原始 payload)

## 默认冲突策略
- UI 默认值：overwrite
- CLI 默认值：overwrite

## 扩展接口预留
### InboxProvider 接口
- `pull({ since }) -> { items, nextCursor }`
- 统一输出 `items`（标准化结构）

未来可扩展：
- IFTTTProvider
- OpenClawProvider
- FeishuProvider

## UI 交互设计
- 在主界面增加一个轻量按钮：`同步收件箱`
- 同步完成后展示：新增 X / 跳过 Y / 失败 Z
- 配置弹窗新增 Pushbullet Token 输入框
- Token 显示掩码（例如 `pb-****abcd`）

## 错误与安全
- 无 Token：明确提示并阻止同步
- API 失败：不更新 lastModified，避免漏数据
- 本地保存 Token，不写入日志

## 测试策略
- Provider 单元测试：模拟 API 响应解析
- InboxStore 单元测试：去重与写入
- API 端到端测试：/api/inbox/sync

## 迁移与兼容
- 不影响现有保存流程
- 仅新增可选入口
- 默认策略变化需在 UI 上显式提示

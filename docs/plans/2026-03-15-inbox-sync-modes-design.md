# 外部入口同步模式设计

**日期：** 2026-03-15

## 背景
当前外部入口（Pushbullet）仅支持增量同步（基于 lastModified）。当用户确认已推送但没有拉到时，需要可选“全量拉取”以补齐遗漏内容。

## 目标
- 在 UI 提供“同步最新 / 同步全部”两个按钮。
- 仍复用 `/api/inbox/sync` 接口，通过参数区分模式。
- 全量同步不破坏已有收件箱数据，保持去重追加。

## 非目标
- 不引入新的 provider（IFTTT/飞书仅为文案预留）。
- 不改变现有 `inbox_links.jsonl` 存储格式。

## 方案概述
- 前端调用 `/api/inbox/sync` 时附带 `mode`：
  - `latest`：现有逻辑，`modified_after = lastModified`
  - `all`：强制 `modified_after = 0`
- 后端根据 `mode` 决定 `since` 值。
- 返回结构保持不变：`{ added, skipped, total, nextModified }`。

## UI/交互
- 在外部入口卡片内加入两枚按钮：
  - `同步最新`（默认增量）
  - `同步全部`（全量拉取）
- 顶部按钮继续作为“同步最新”的快捷入口。

## 数据与副作用
- 全量同步仍走“去重追加”，不会重复写入历史链接。
- `lastModified` 更新为本次拉取的 `nextModified`，保证后续增量生效。

## 错误处理
- 缺少 token 或未启用 Pushbullet 时，继续返回明确错误信息。
- UI 复用现有错误展示，无需新增错误类型。

## 测试策略
- 新增 UI 测试：检查按钮文案与结构。
- 新增接口测试：`mode=all` 时使用 `since=0`。
- 现有测试保持通过。

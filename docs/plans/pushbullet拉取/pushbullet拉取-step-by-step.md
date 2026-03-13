# Pushbullet 拉取扩展 - Step by Step 计划（可打勾清单）
日期：2026-03-14

> 说明：这是扩展功能，不放在最前面，按“可选增强”推进。
> 完成一项就打勾。

## Phase 0｜准备与约束
- [ ] 确认功能开关：默认不开启，需配置 Token 才启用
 - [x] 确认默认冲突策略：UI + CLI 改为覆盖（overwrite）
- [ ] 确认收件箱落盘路径与格式（JSONL）

## Phase 1｜配置与数据结构
- [ ] 在 `ui_config.json` 结构中增加 `pushbullet.*` 与 `inbox.path`
- [ ] 新增 `InboxItem` 结构定义（source/url/title/timestamp/raw）
 - [x] 新增 `InboxStore`（写入、去重、读取）

## Phase 2｜Provider 设计与实现（可扩展）
- [ ] 定义 `InboxProvider` 接口（pull/normalize）
 - [x] 实现 `PushbulletProvider`
 - [x] 支持 `modified_after` 增量拉取
 - [x] 解析 push 内容中 URL（包含正文内 URL 提取）

## Phase 3｜后端 API + CLI
- [ ] 新增 API：`POST /api/inbox/sync`
- [ ] 返回统计：新增/跳过/失败 + 错误摘要
- [ ] CLI 命令：`npm run inbox:sync`（或脚本入口）

## Phase 4｜UI 接入
- [ ] 主界面新增“同步收件箱”按钮
- [ ] 同步中状态反馈（加载态 + 结果统计）
- [ ] 设置弹窗新增 Pushbullet Token 输入
- [ ] Token 展示掩码（保存后不明文回显）

## Phase 5｜测试
- [ ] InboxStore 单元测试
- [ ] PushbulletProvider 单元测试（mock API）
- [ ] API E2E：`/api/inbox/sync`

## Phase 6｜文档与说明
- [ ] 更新使用说明（如何获取 Token / 如何同步）
- [ ] 记录扩展入口的“可接入其他来源”规范

## Phase 7｜验收
- [ ] 日批量拉取成功写入收件箱
- [ ] UI 与 CLI 同步一致
- [ ] 默认覆盖策略生效

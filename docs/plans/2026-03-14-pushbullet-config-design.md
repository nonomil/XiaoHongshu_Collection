# Pushbullet 配置外置与收件箱同步增强 Design

**Goal:** 将 Pushbullet 配置统一迁移到 `config/pushbullet.json`，并增强收件箱同步的分页与认证兼容。

**Architecture:** 以 `pushbullet.json` 作为唯一来源，UI/CLI 读取与写入同一份配置；同步逻辑新增 `cursor` 分页与 Basic Auth 兼容，避免拉取遗漏；保留既有增量逻辑与收件箱 JSONL 落盘。

**Tech Stack:** Node.js, JSON 文件配置, HTTP API, JSONL 存储

---

## 配置与迁移
- 配置路径固定为 `G:\UserCode\XiaoHongshu_Collection\config\pushbullet.json`。
- 兼容旧格式：若文件内容不是 JSON，则视为纯文本 Token，自动迁移为 JSON 并回写。
- 统一 JSON 结构：
```json
{
  "enabled": true,
  "accessToken": "PUSHBULLET_TOKEN",
  "lastModified": 0,
  "inboxPath": "data/inbox_links.jsonl"
}
```
- `config/ui.json` 不再保存 Pushbullet 与 inbox 相关字段（仅保留 UI 其它配置）。

## 同步逻辑与分页
- 继续使用 `modified_after` 做增量拉取。
- 新增 `cursor` 分页，直至无 cursor 或无 pushes。
- 认证方式兼容：优先使用 `Access-Token` 头，同时支持 HTTP Basic Auth（API Key 作为用户名）。

## UI / CLI 行为
- UI 设置弹窗：保存开关、Token、收件箱路径到 `pushbullet.json`。
- UI “同步收件箱”按钮直接读取 `pushbullet.json`。
- CLI `npm run inbox:sync` 统一读取 `pushbullet.json`。
- 缺失文件或 Token 时给出清晰错误。

## 错误处理
- 解析失败：回退为禁用并提示需要有效 Token。
- 网络错误：保留旧的 `lastModified`，避免误前移。
- 写入失败：返回明确错误，不修改配置。

## 测试
- 新增配置迁移单测：纯文本 Token -> JSON。
- 新增分页拉取单测：cursor 多页合并。
- 新增配置优先级单测：pushbullet.json 覆盖 UI 配置。

## 文档
- 更新 Pushbullet 使用说明：配置文件位置、格式、迁移规则。
- 说明 UI 与 CLI 统一使用 pushbullet.json。

## Out of Scope
- 实时 WebSocket 流。
- 其它来源（IFTTT/OpenClaw/飞书）的 Provider 实现。

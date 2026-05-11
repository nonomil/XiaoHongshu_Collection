# 云端 ingress 最小部署方案

日期：2026-04-08

## 目标

这一轮只解决三件事：

1. 把本地与云端入口地址放进统一配置
2. 给飞书留出一条可以直接入队的 webhook
3. 明确公网暴露前必须补 token 鉴权

不在这一轮解决的事情：

- 不把小红书主执行链路迁到云端
- 不承诺云端直接跑完整评论抓取
- 不在这一轮引入数据库或复杂编排器

---

## 当前最小落地范围

### 配置层

本地 `ui_config` 增加：

```json
{
  "ingress": {
    "localBaseUrl": "http://127.0.0.1:3030",
    "cloudBaseUrl": "",
    "defaultRoute": "local"
  }
}
```

说明：

- `localBaseUrl`
  - 本地 UI、浏览器插件、本机脚本默认访问地址
- `cloudBaseUrl`
  - 云端入口地址占位
  - 未部署时允许留空
- `defaultRoute`
  - 当前入口默认把任务送去哪里
  - 本地建议 `local`
  - 云端建议 `cloud`

外部部署示例继续放在 `config/ingress.example.json`，保留 `snake_case` 风格，和内部 `ui_config` 区分开。

### API 层

本轮入口最小集合：

- `POST /api/ingress/save-link`
  - 立即执行
- `POST /api/ingress/enqueue-link`
  - 只入队
- `POST /api/ingress/webhook/feishu`
  - 飞书事件订阅入口
  - `url_verification` 返回 `challenge`
  - 消息事件提取文本里的第一个 URL 并入队

### 安全层

公网暴露前置条件：

- 配置 `XHS_INGRESS_WEBHOOK_TOKEN`
- 用同一个 token 校验飞书验证请求和事件请求
- 没配 token 时，只建议在 `127.0.0.1` 或受控内网调试

---

## 推荐部署拓扑

### 本地模式

```text
浏览器插件 / Pushbullet / 手工脚本
  -> http://127.0.0.1:3030/api/ingress/*
  -> inbox jsonl
  -> 本地执行器
```

适合：

- 小红书单条保存
- 本地浏览器登录态复用
- 手工补跑和快速调试

### 云端模式

```text
飞书 / OpenClaw / 浏览器插件
  -> https://your-domain/api/ingress/*
  -> 统一入队
  -> 后续 worker 或本地拉取执行
```

适合：

- 多端入口收集
- 机器人/Webhook
- 公众号/知乎/CSDN 这类更适合后处理的来源

不适合直接承诺：

- 小红书完整抓取主线
- 强登录态、强人工介入、强反爬的任务

---

## 飞书 webhook 最小契约

### 支持范围

当前实现只保证：

1. 处理 `url_verification`
2. 处理消息事件中的文本 URL 提取
3. 默认只入队，不立即执行

### 入队后的统一 payload

```json
{
  "url": "https://mp.weixin.qq.com/s/demo",
  "source": "feishu",
  "route": "cloud",
  "delivery_mode": "queue",
  "requested_at": "2026-04-08T10:00:00.000Z",
  "metadata": {
    "feishu": {}
  }
}
```

说明：

- `metadata.feishu.header`
  - 保留事件头
- `metadata.feishu.sender`
  - 保留发送者字段
- `metadata.feishu.message`
  - 保留消息字段
  - 额外附带 `parsed_content`

---

## Step By Step 勾选清单

- [x] 在 `ui_config` 增加 `ingress.localBaseUrl`
- [x] 在 `ui_config` 增加 `ingress.cloudBaseUrl`
- [x] 在 `ui_config` 增加 `ingress.defaultRoute`
- [x] `GET /api/ui-config` 返回 ingress 默认值
- [x] `POST /api/ui-config` 能持久化 ingress 配置
- [x] 新增 `scripts/lib/ingress_webhook.js`
- [x] 新增 `POST /api/ingress/webhook/feishu`
- [x] 支持飞书 `url_verification`
- [x] 支持从飞书消息文本中提取第一个 URL
- [x] 飞书 webhook 默认只入队
- [x] 为公网模式预留 `XHS_INGRESS_WEBHOOK_TOKEN`
- [ ] 用真实飞书事件订阅跑一次端到端验证
- [ ] 把云端域名回填到 `cloudBaseUrl`
- [ ] 决定 OpenClaw 是否共用同一 webhook 入口
- [ ] 追加 webhook 限流、来源白名单和审计日志

---

## 风险与边界

### 1. token 不是可选锦上添花，而是公网最低门槛

如果入口暴露在公网但不验 token，后续会很容易被乱写 inbox。

### 2. 飞书 webhook 当前是“入口层适配”，不是“飞书即执行器”

它只负责把消息转成统一 ingress payload，不替代本项目的保存链路。

### 3. 小红书仍应保持本地主执行

即使未来云端 ingress 打通，也不应该立刻把小红书执行主线挪过去。

### 4. 当前 URL 提取策略是“最小可用”

先从消息文本里抓第一个 URL，后续如果要支持卡片、富文本、多链接优先级，再单独扩展。

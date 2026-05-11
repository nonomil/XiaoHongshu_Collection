# 统一入口 Payload 契约

日期：2026-04-08

## 目标

定义本项目统一入口的最小请求/响应协议，供以下入口共用：

- 浏览器插件
- 本地 UI
- Pushbullet
- 飞书 webhook
- OpenClaw / ClawCloud
- 未来 IMA CLI

这份契约只解决“怎么送任务进来”，不替代执行器逻辑。

---

## 设计原则

1. 入口统一，执行器复用
2. 本地与云端共用同一套 payload 结构
3. 小红书不因入口变化而重写抓取逻辑
4. 入口可以只入队，不必须立即执行
5. 入口元数据必须完整保留，便于审计、追踪和回放

---

## 统一字段

所有入口请求都尽量包含以下字段：

```json
{
  "url": "https://example.com/item",
  "source": "chrome-extension",
  "route": "local",
  "delivery_mode": "immediate",
  "requested_at": "2026-04-08T10:00:00.000Z",
  "metadata": {}
}
```

字段说明：

- `url`
  - 必填
  - 目标链接
- `source`
  - 必填
  - 来源标识，例如 `chrome-extension` / `pushbullet` / `feishu` / `mobile-share`
- `route`
  - 选填
  - `local` 或 `cloud`
- `delivery_mode`
  - 选填
  - `immediate` 或 `queue`
- `requested_at`
  - 选填
  - 入口生成时间，ISO 8601
- `metadata`
  - 选填
  - 任意来源附加信息

---

## 接口 1：立即执行保存

### 路径

```text
POST /api/ingress/save-link
```

### 用途

- 浏览器插件点击“保存当前页到本地”
- 本地 UI 或其他本机工具直接送入执行器

### 示例请求

```json
{
  "url": "https://www.xiaohongshu.com/explore/abc123",
  "source": "chrome-extension",
  "route": "local",
  "delivery_mode": "immediate",
  "requested_at": "2026-04-08T10:00:00.000Z",
  "metadata": {
    "page_title": "示例标题",
    "selection_text": "",
    "tab_id": 123
  }
}
```

### 示例响应

```json
{
  "ok": true,
  "accepted": true,
  "execution": "immediate",
  "task": "note-save",
  "report": {}
}
```

---

## 接口 2：仅入队

### 路径

```text
POST /api/ingress/enqueue-link
```

### 用途

- 飞书 webhook
- OpenClaw 消息入口
- 手机分享桥接
- 云端入口收集

### 示例请求

```json
{
  "url": "https://mp.weixin.qq.com/s/demo",
  "source": "feishu",
  "route": "cloud",
  "delivery_mode": "queue",
  "requested_at": "2026-04-08T10:00:00.000Z",
  "metadata": {
    "event_id": "evt_xxx",
    "sender": "user_xxx",
    "chat_id": "oc_xxx"
  }
}
```

### 示例响应

```json
{
  "ok": true,
  "accepted": true,
  "execution": "queued",
  "task": "note-save",
  "queue": {
    "added": 1,
    "skipped": 0
  }
}
```

---

## 元数据建议

### 浏览器插件

```json
{
  "page_title": "标题",
  "selection_text": "选中文本",
  "tab_id": 123
}
```

### Pushbullet

```json
{
  "push_iden": "uj...",
  "push_type": "note",
  "sender_name": "Nomil"
}
```

### 飞书

```json
{
  "event_id": "evt_123",
  "chat_id": "oc_xxx",
  "sender_id": "ou_xxx"
}
```

### OpenClaw

```json
{
  "channel": "feishu",
  "message_id": "msg_xxx",
  "conversation_id": "conv_xxx"
}
```

---

## task 映射建议

入口层收到 payload 后，先转成内部 task：

```json
{
  "type": "note-save",
  "source": "chrome-extension",
  "input": "https://www.xiaohongshu.com/explore/abc123",
  "route": "local",
  "deliveryMode": "immediate",
  "metadata": {
    "pageTitle": "示例标题"
  },
  "options": {},
  "requestedAt": "2026-04-08T10:00:00.000Z"
}
```

说明：

- 外部接口用 `snake_case` 更适合 Web payload
- 内部 task 暂时保留现有 `camelCase` 风格
- ingress 层负责转换，不让执行器直接处理外部 payload

---

## 错误响应建议

### 无效 URL

```json
{
  "ok": false,
  "accepted": false,
  "error": "Invalid url"
}
```

### 缺少必填字段

```json
{
  "ok": false,
  "accepted": false,
  "error": "url is required"
}
```

### 本地执行器不可用

```json
{
  "ok": false,
  "accepted": true,
  "execution": "deferred",
  "error": "Local executor unavailable"
}
```

---

## 认证建议

### 本地模式

- 仅监听 `127.0.0.1`
- 默认不要求额外 token

### 云端模式

- 必须要求 token
- 默认禁用未鉴权公网写入
- 后续可增加来源白名单和限流

---

## 当前结论

后续无论接浏览器插件、飞书还是 OpenClaw，都不应直接绕过这一层。

统一入口的推荐策略是：

1. 外部 payload 用 `snake_case`
2. 内部 task 用现有 `camelCase`
3. ingress 层做规范化、校验和转换

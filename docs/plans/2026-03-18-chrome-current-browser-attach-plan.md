# 2026-03-18 Chrome 当前浏览器接管接入计划

日期：2026-03-18

## 1. 目标

在不破坏当前批量导出链路的前提下，为项目增加一个新的浏览器连接策略：

- `isolated`：现有默认模式，启动隔离 profile 的调试浏览器
- `current-browser`：复用用户当前 Chrome 146+ 浏览器会话

目标不是替换默认链路，而是增加一个更适合单条保存与调试的增强模式。

## 2. 非目标

这轮不做：

- 不把所有采集问题都归因到连接方式
- 不把批量收藏夹导出默认切到当前浏览器
- 不把 Chrome DevTools MCP / agent-browser 整体塞进项目运行时依赖
- 不依赖用户必须安装某个第三方 CLI 才能保存笔记

项目应该直接支持这个连接能力，而不是把核心流程外包给外部工具。

## 3. 实施原则

### 3.1 连接层和采集层分离

要避免把“怎么连浏览器”和“怎么抓小红书页面”耦合在一起。

建议把浏览器连接抽象成统一入口，例如：

- `connectBrowser({ mode, browserUrl, wsEndpoint, channel })`

由它内部决定：

- 固定 `9222` 端口连接
- 自动发现当前浏览器动态端口
- 未来如有需要，再扩展为显式 WebSocket 连接

### 3.2 当前浏览器模式只做增强，不做默认

默认值仍应保持：

- `mode=isolated`

只有单条保存、调试、人工辅助场景才建议选择：

- `mode=current-browser`

### 3.3 评论稳定性继续独立推进

当前浏览器接入只能改善：

- 登录态复用
- 使用摩擦
- 某些接口风控提示

但不能取代：

- 评论加载等待
- 虚拟列表滚动扫描
- 回复展开
- 采集结果完整性判断

## 4. 分阶段计划

## Phase 1：抽象连接策略

目标：

- 让 `scripts/lib/cdp_note.js` 不再假设唯一入口就是 `http://localhost:9222/json`

建议动作：

- 新增连接配置解析层
- 支持以下优先级：
  1. 显式 `browserUrl`
  2. 显式 `wsEndpoint`
  3. `current-browser` 自动发现
  4. 回退到现有 `localhost:9222`

建议新增能力：

- 读取 Chrome 默认 profile 下的 `DevToolsActivePort`
- 支持 stable/beta/canary channel 的常见目录
- 如果动态发现失败，再回退探测 `9222`、`9229`

验收标准：

- 不改采集逻辑时，现有测试仍通过
- 连接逻辑可单测

## Phase 2：CLI 暴露新模式

目标：

- `scripts/save_note.js` 能显式选择连接模式

建议参数：

- `--browser-mode isolated`
- `--browser-mode current-browser`
- `--browser-url http://127.0.0.1:9222`
- `--ws-endpoint ws://...`
- `--browser-channel stable|beta|canary`

行为建议：

- 单条 URL / 分享链接允许使用 `current-browser`
- `--current` 语义保留，但升级为“复用当前 tab + 当前浏览器连接策略”

验收标准：

- 老命令完全兼容
- 新参数不影响旧测试
- 错误提示能说明“未开启远程调试”还是“用户拒绝授权”

## Phase 3：UI 暴露增强入口

目标：

- UI 增加一个清晰但不危险的入口

建议表现：

- 开关文案：`复用当前 Chrome 登录态（实验）`
- 次级说明：
  - 适合单条笔记保存与调试
  - 需要浏览器已开启远程调试
  - 浏览器会弹授权确认

建议限制：

- 默认关闭
- 批量收藏夹导出先不默认启用
- 一次任务开始前明确记录当前模式到 report

## Phase 4：补齐当前模式下的评论策略

目标：

- 把“当前浏览器模式”真正用于提高评论采集成功率

建议动作：

- 当前模式下适当放宽评论加载等待时间
- 优先读取已预热评论 DOM
- 保留 API probe 警告，但不把 API 异常直接当成 0 评论的唯一原因
- 在 report 中区分：
  - `dom_loaded_but_api_limited`
  - `comment_loading_timeout`
  - `login_required`
  - `account_risk_control`

验收标准：

- 单条笔记场景里，能更清楚区分“登录/风控问题”和“DOM 加载时序问题”

## Phase 5：验证与回归

自动化验证：

- `scripts/ai/__tests__/cdp_note.test.js`
- `scripts/ai/__tests__/cdp_note_comments.test.js`
- `scripts/ai/__tests__/save_note.test.js`

建议新增单测：

- `DevToolsActivePort` 文件解析
- 自动发现失败时回退到 `9222/9229`
- `current-browser` 模式参数透传
- 用户拒绝授权时的错误分类

手工验证清单：

1. Chrome 146 stable，开启 `chrome://inspect/#remote-debugging`
2. 打开一个已登录的小红书笔记页
3. 用 `current-browser` 模式保存单条笔记
4. 验证标题、正文、图片、评论数、告警信息
5. 关闭远程调试后再次运行，验证错误提示是否清晰

## 5. 风险与边界

### 风险 1：权限弹窗阻塞自动化

影响：

- 不适合完全无人值守流程

应对：

- 只在单条/调试场景推荐该模式

### 风险 2：默认 profile 范围过大

影响：

- agent 可见当前 profile 下全部打开窗口

应对：

- UI 和 CLI 都要给出明确风险提示
- 默认模式仍保持隔离 profile

### 风险 3：多 profile / 多窗口目标不明确

影响：

- 可能接到不是预期的小红书 tab

应对：

- 连接后先校验当前 URL / tab 列表
- 必要时要求用户先把目标页置前

## 6. 最终建议

当前最合理的推进方式不是“全量切换”，而是：

`保留 isolated 默认模式 + 增加 current-browser 增强模式 + 继续独立优化评论采集稳定性`

这条路线能同时兼顾：

- 用户体验
- 登录态复用
- 批量任务稳定性
- 后续 inbox / Pushbullet / IFTTT 扩展

# 2026-04-06 浏览器任务编排层第一阶段计划

## 1. 目标

在现有 `Node + CDP` 主线之上，补一层确定性的浏览器任务编排层，用于处理：

- 任务状态机
- 重试
- checkpoint 持久化
- 人工接管
- 失败恢复

本阶段不引入外部 RPA 平台，不替换现有 CDP 执行层。

## 2. 第一阶段落地范围

新增基础设施：

- `scripts/lib/browser_checkpoint_store.js`
- `scripts/lib/browser_orchestrator.js`

新增单测：

- `scripts/ai/__tests__/browser_checkpoint_store.test.js`
- `scripts/ai/__tests__/browser_orchestrator.test.js`

## 3. 分层职责

### 3.1 CDP 执行层

继续由现有模块负责：

- `browser_session`
- `cdp_note`
- `save_note`

职责：

- 连接浏览器
- 切换 target
- 读取 DOM / 页面状态 / 请求结果
- 执行点击、滚动、采集

### 3.2 编排层

由新的 `browser_orchestrator` 负责：

- 驱动状态迁移
- 管理每个状态的尝试次数
- 按状态持久化 checkpoint
- 判断是继续重试、失败，还是转人工接管

### 3.3 LLM 角色

LLM 不是执行器，只作为策略辅助：

- 帮助解释失败原因
- 帮助分类页面状态
- 帮助决定是否转人工接管

## 4. 推荐初始状态机

- `attach_browser`
- `locate_target`
- `load_note`
- `expand_comments`
- `collect_comments`
- `validate_result`

终态：

- `done`
- `failed`
- `need_human`

## 5. 第二阶段接入方式

把当前 `save_note` 主流程拆成可复用状态步骤，并逐步接入编排层：

1. 先接入 `attach_browser`
2. 再接入 `locate_target`
3. 再把评论链路拆成：
   - `expand_comments`
   - `collect_comments`
   - `validate_result`

## 6. 人工接管触发条件

优先转人工而不是盲重试的场景：

- 登录失效
- 验证码
- 账号风控
- 页面明确提示需人工展开或确认

## 7. 后续扩展

- checkpoint 从 JSON 升级到 SQLite
- UI 展示当前状态机进度
- 支持从 `need_human` 和 `failed` 状态恢复续跑
- 为每个状态补统一 postcondition 断言

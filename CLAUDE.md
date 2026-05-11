# Codex 主导 + Claude Code 辅助协作规范

> 本文件用于定义本仓库的协作流程。当前默认模式：**Codex 主导，Claude Code 辅助**。
> 详细主入口见 `CODEX.md`。

---

## 0. 生效优先级

1. 用户当次明确指令
2. `CODEX.md`
3. 本文件
4. `.claude/workflows/*` 历史工作流文档

---

## 1. 强制门禁（执行前）

收到新任务时，按以下顺序：

1. 复述需求
2. 列出歧义与风险
3. 判断复杂度
4. 说明将走的工作流
5. 用户确认后进入实施

---

## 2. 复杂度判断

满足全部 4 条为简单模式：

- 涉及文件 ≤ 3
- 预估 diff ≤ 200 行
- 需求明确、无歧义
- 单模块内改动

任意一条不满足，进入复杂模式。

---

## 3. 场景路由（高到低）

1. Debug（报错/测试失败/线上故障）
2. Code Review（审查、质量检查）
3. 研究调研（选型、对比、搜索）
4. 大型代码库（先扫描、影响分析）
5. 并行开发（2+ 可解耦任务）
6. 复杂开发
7. 简单开发

---

## 4. 角色边界（已反转）

### Codex（主）

- 主导需求拆解与计划
- 主导代码实现与重构
- 主导验证、审查、交付
- 必要时调用 Claude Code MCP 能力

### Claude Code（辅）

- 接受 Codex 调用
- 提供补充分析与能力扩展
- 不接管主流程决策

---

## 5. Codex 调用 Claude Code MCP

推荐配置（参考 `AI开发-PLan-Program-Debug-Claude和Codex协作/10.使用 Codex + Claude Code MCP 进行 AI Coding.md`）：

```toml
[mcp_servers.claude]
command = "claude"
args = ["mcp", "serve"]
```

调用约束：

- 先定义 Scope
- 明确 Constraints（禁止删除、禁止越界）
- 写清 Acceptance（验收标准）

---

## 6. 安全与边界

- 禁止删除类命令与危险 Git 回退命令
- 禁止修改 Scope 外文件
- 文本文件统一 UTF-8
- 交付前必须验证（测试/构建/最小复现）

---

## 7. 工作流入口

- 初始化：`.codex/workflows/codex-workflow-init.md`
- 常量：`.codex/workflows/codex-workflow-constants.md`
- 索引：`.codex/workflows/README.md`

---

## 8. 迁移说明

本项目已从“Claude Code 调用 Codex”切换为“Codex 调用 Claude Code”。
若旧文档仍存在“由 Claude Code 担任主导”这类描述，按本文件和 `CODEX.md` 覆盖执行。

---

## 9. 活动/历史边界

- 活动入口：`AGENTS.md`、`CODEX.md`、`CLAUDE.md`、`.codex/workflows/*.md`
- 默认计划目录：`docs/plans/`
- 历史参考：`.claude/reference/`、`AI开发-PLan-Program-Debug-Claude和Codex协作/`
- Claude Code 在默认流程中只承担辅助分析、补充扫描、第二评审，不接管编码主流程
- `.claude/` 仅保留 Claude Code 兼容配置与历史资料

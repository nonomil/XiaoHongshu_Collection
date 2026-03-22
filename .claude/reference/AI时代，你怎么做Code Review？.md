> 历史参考资料
>
> 说明：本文件仅用于兼容、追溯和历史参考，不作为当前默认工作流主入口。当前主入口见 `CODEX.md` 与 `.codex/`。


# AI时代，你怎么做Code Review？

> Legacy 文档：仅用于历史参考。当前执行规范以 `CODEX.md`、`AGENTS.md`、`.claude/workflows/` 为准。




> 标签：#aicoding #codereview #claudecode #技术管理

---

## 【写在前面的话】

最近团队开始用 Claude Code 写代码，我发现一个诡异的现象：Review 队友的代码变的非常搞笑：

代码是 AI 写的，我给的反馈他也不知道怎么改——因为他得把我的意见"翻译"成对话，再让 AI 重新生成。

这不对劲。后来我在 HN 上看到一个 300+ 评论的帖子，才发现全世界的工程师都在纠结同一个问题：**AI 写的代码，到底该怎么 Review？**

---

## 1️⃣ 核心矛盾：你 Review 的不是"代码"

传统 Code Review 的逻辑是：看代码 → 提意见 → 队友改代码。

但 AI 时代变了：

- 代码是 AI 生成的，队友只是"提示词工程师"。
- 你的反馈无法直接落地，必须翻译成"对话语言"。

> **真正的工作是那段对话，不是代码本身。**

结论：**Review 代码 = Review 错了对象。**

---

## 2️⃣ HN 热议方案：project.md + plan.md 工作流

最高赞的做法是这样的：

- **Step 1**：写 `project.md`，描述需求
- **Step 2**：让 AI 生成 `plan.md`，详细规划实现步骤
- **Step 3**：反复迭代 `plan.md`，直到满意
- **Step 4**：让 AI 按 `plan.md` 执行，生成代码
- **Step 5**：把 `project.md` + `plan.md` 一起提交到 Git

> **关键规则：任何代码修改都必须改 `plan.md` 再重新生成，禁止直接改代码。**

这样 **Code Review 就变成了 Plan Review**——你看的是队友的思路，不是 AI 的输出。

---

## 3️⃣ 大厂实践：三文档体系

研究了一下，还有团队更狠，搞了三层文档：

| 文件 | 用途 |
|------|------|
| `design/[feature].md` | 设计文档，列出开放问题 |
| `plan/[feature]/phase-N.md` | 分阶段执行计划 |
| `debug/[feature].md` | 调试假设和验证过程 |

每次 AI 遇到问题，先写假设，再验证，最后修 plan。

> **核心理念：代码是"编译产物"，文档才是"源代码"。**

---

## 4️⃣ 为什么不能直接改代码？

因为下次 AI 重新生成时，你的手动修改会被覆盖。

这就像你在 `.class` 文件里改 Java 字节码，下次编译就没了。

> **正确做法：把修改意见写进 spec/plan，让 AI 重新"编译"。**

---

---

## 【延伸讨论：评论区精华】

### 关于"Agentic Engineering"

- 有读者指出，这套方法论本质上就是 **Agentic Engineering** 的直接落地实践。
- openclaw 创始人 Peter 的观点：人类需要定义清楚**测试用例**，用测试用例来驱动大模型写出正确、符合预期的代码。
- 完整方案 = **plan + 测试用例**，两者缺一不可。

### 关于 SDD（规格驱动开发）

- 本质上与 SDD（Spec-Driven Development）相通。GitHub 上有 **strands agents** 项目，也是 spec driven development 的实践。
- Gemini 的建议：人类通过 SDD 方法论写出高质量、结构清晰的 System Spec；将 Spec 交给强大的 Agentic 系统，让智能体自主阅读旧代码、编写新模块、运行测试并完成部署。

### 关于测试

- 测试范围主要指**单元测试**，确保单元功能正确；压测、容错、回退等仍由专业测试同学负责。
- 推荐：测试驱动的 Agentic Engineering（TDD + Agentic）。

### 关于直接改代码的风险

- AI coding 可能会修改它认为不合理的其他代码，手动未 commit 的改动存在被覆盖的风险。
- 不一定每次都会被覆盖，但风险真实存在。

### 关于 plan 的局限性

- plan 迭代过几轮后可读性也会下降。
- plan 总有留白，plan 对了代码不见得一定对。
- 中途跳出 plan 后，需要更新 plan，明确执行到哪一步，再继续。
- 同一份 plan 不一定每次生成相同代码，非确定性是固有风险。

### 关于引入第二个模型 Review

- 引入第二个模型（如用 Claude Code review GPT 生成的代码）可以减少单一模型的偏差，但不增加风险。
- 关键仍在于前期的模块设计和测试用例定义。

### 对工程师的要求

- **不要发自己不理解的代码**——即使是 AI 生成的，也要对自己提交的 PR 负责。
- 如果一个工程师连自己发的 PR 都不知根知底，直接开除。
- AI 没有智能到可以独立设计大型系统，必须人工将复杂系统分解成具有清晰输入/输出的小模块，再让 AI 生成代码。

---

## 【最后总结】

**AI 时代的 Code Review，本质是 Spec Review。**

代码只是 AI 的输出，真正的工作是那份 `project.md` / `plan.md`。把它们提交到 Git，才是对队友工作的尊重。

## 5️⃣ 可用的 Skills 工具调研

> 评论区提到了把工作流写成 Skills 的思路，以下是目前社区中与 Code Review、Plan、TDD 最相关的几个实用 Skills/插件。

### ⭐ sanyuan0704/code-review-expert — 最契合本专题的专项 Skill

**仓库**：`sanyuan0704/code-review-expert`（⭐ 311 stars，24 forks）

**这是评论区朋友直接推荐的那个**，也是目前社区中专注于 Code Review 本身、最完整的单体 Skill。

**安装**：
```bash
npx skills add sanyuan0704/code-review-expert
```

**使用**：安装后直接在 Claude Code 里运行：
```
/code-review-expert
```
会自动通过 `git diff` 抓取当前改动，无需手动指定文件。

**核心检查维度（6大类）**：

| 维度 | 检查内容 |
|---|---|
| **SOLID 原则** | SRP / OCP / LSP / ISP / DIP 违规检测 |
| **安全扫描** | XSS、注入、SSRF、竞态条件、认证漏洞、密钥泄露 |
| **性能** | N+1 查询、CPU 热点、缺失缓存、内存泄漏 |
| **错误处理** | 吞掉的异常、async 错误、缺失边界 |
| **边界条件** | Null 处理、空集合、off-by-one、数值溢出 |
| **废代码清理** | 识别死代码并给出安全删除计划 |

**Review 工作流（7步）**：

```
1. Preflight      → git diff 确定改动范围
2. SOLID + 架构   → 检查设计原则
3. 废代码识别      → 找出无用代码 + 给出删除计划
4. 安全扫描        → 漏洞检测
5. 代码质量        → 错误处理 / 性能 / 边界条件
6. 输出报告        → 按 P0-P3 严重级别分类
7. 确认步骤        → 询问用户后再执行修复（不自动改）
```

**严重级别定义**：

| 级别 | 名称 | 处置 |
|---|---|---|
| **P0** | Critical | 必须阻塞合并 |
| **P1** | High | 合并前应修复 |
| **P2** | Medium | 修复或创建 follow-up |
| **P3** | Low | 可选改进 |

**文件结构**：
```
code-review-expert/
├── SKILL.md                        # 主 Skill 定义
├── agents/
│   └── agent.yaml                  # Agent 接口配置
└── references/
    ├── solid-checklist.md          # SOLID 检查提示词 + 反模式
    ├── security-checklist.md       # OWASP + 竞态 + 加密 + 供应链
    ├── code-quality-checklist.md   # 错误处理 / 缓存 / N+1 / Null 安全
    └── removal-plan.md             # 安全删除 vs 延迟删除 + 回滚计划
```

**与本文方法论的结合点**：

- 在完成 `plan.md` 并让 AI 生成代码之后，运行 `/code-review-expert` 作为最后一道自动化质量门禁
- 它的 P0/P1 问题 → 更新 `plan.md`，让 AI 重新生成（而不是直接改代码）
- 它的 P2/P3 建议 → 记录到 `debug/[feature].md` 作为后续迭代依据
- 确认环节（Step 7）保证 Claude 不会绕过人工直接改代码，符合"禁止直接改代码"原则

---

### 🔧 Anthropic 官方：/code-review 插件

**仓库**：`anthropics/claude-code`（内置插件）

官方出品，直接内置在 Claude Code 中，无需额外安装。

**核心机制**：
- 在 PR 分支上运行 `/code-review`，会**并行启动 4 个 Review Agent**
- 每条问题打置信度分（0-100），只输出置信度 ≥ 80 的高可信问题
- 支持 `--comment` 参数，自动将 Review 结果 Post 到 PR 评论

**典型输出示例**：
```
Found 3 issues:
1. Missing error handling for OAuth callback (CLAUDE.md says "Always handle OAuth errors")
2. Memory leak: OAuth state not cleaned up (missing cleanup in finally block)
3. Inconsistent naming pattern (Use camelCase for functions)
```

**适合场景**：在走完 plan.md 流程、AI 生成代码后，作为最后一道自动化 Review 关卡。

---

### 🚀 obra/superpowers — 最推荐的完整方法论插件

**仓库**：`obra/superpowers`（已上架 Anthropic 官方插件市场）

**安装**：
```bash
/plugin marketplace add obra/superpowers-marketplace
/plugin install superpowers@superpowers-marketplace
```

这是目前社区中**与本文方法论最契合**的插件。它把整个 Agentic Engineering 流程编码为一套强制执行的 Skills，不是建议，而是硬约束。

**核心 Skills 清单**：

| Skill | 触发时机 | 说明 |
|---|---|---|
| `brainstorming` | 写代码前 | Socratic 式需求梳理，探索技术方案，输出设计文档 |
| `using-git-worktrees` | 设计确认后 | 在新分支创建隔离工作区，验证测试基线 |
| `writing-plans` | 有了设计 | 拆成每个 2-5 分钟的原子任务，含文件路径、完整代码、验证步骤 |
| `test-driven-development` | 实现阶段 | 强制 RED-GREEN-REFACTOR 循环，先写失败测试再写代码 |
| `subagent-driven-development` | 执行 plan | 每个任务派发独立 subagent，任务间有 code review checkpoint |
| `requesting-code-review` | 任务间隔 | 对照 plan 和规范做 Review，Critical 问题阻塞推进 |
| `systematic-debugging` | 遇到 bug | 4 阶段根因分析（根因追踪 → 模式分析 → 假设验证 → 修复） |
| `finishing-a-development-branch` | 任务完成 | 验证测试，提供 merge/PR/keep/discard 选项，清理工作区 |

**核心理念**：把 plan 拆成每个 2-5 分钟的原子任务，写进 Markdown 文件，Claude 不需要把整个 codebase 装进上下文，只加载当前任务所需文件，大幅节省 token。即使跨 session，计划文件也不会丢失。

**实际效果**：有用户运行 `/superpowers:write-plan` 做大型迁移，得到了 500 行详细计划：包含所有需要修改的文件、具体原因、时间估算和测试检查点。

---

### 🔍 levnikolaevich/claude-code-skills — 全流程 Agile 自动化

**仓库**：`levnikolaevich/claude-code-skills`

包含 2 个插件、106 个 Skills，覆盖从需求到交付的完整 Agile 流程。

**与 Code Review 相关的核心 Skills**：
- `ln-005-agent-reviewer`：多模型（Claude + Codex + Gemini）辩论式 Review 协议
- `ln-400-story-executor`：任务执行 + 自动 Review 循环 + 质量门禁（Quality Gates）

**流水线**：`ln-700 项目初始化 → ln-100 生成文档 → ln-200 分解 Epic/Story → ln-400 执行任务（含 Review）→ ln-500 质量门禁`

人工介入点只有两处：Story 验收（ln-310）和质量门禁（ln-500）。

---

### 🐙 aidankinzett/claude-git-pr-skill — GitHub PR Review 专项

**仓库**：`aidankinzett/claude-git-pr-skill`

专注于 GitHub PR Review 场景，通过 `gh` CLI 操作。

**工作流**：
1. Claude 分析 PR，准备所有评论（含代码建议块）
2. **创建 PENDING 状态的 Review**，暂不提交
3. 人工确认后，Claude 才 Submit Review（APPROVE 或 REQUEST_CHANGES）

人工确认环节是核心，Claude 不会绕过你直接 approve。

---

### 📋 相关 Skills 速查

| Skills | 用途 | 链接 |
|---|---|---|
| `subagent-driven-development` | subagent 并行开发 + 任务间 Review | ComposioHQ/awesome-claude-skills |
| `test-driven-development` | 实现前强制写测试 | ComposioHQ/awesome-claude-skills |
| `review-implementing` | 对照 spec 评估实现计划 | BehiSecc/awesome-claude-skills |
| `systematic-debugging` | 遇 bug 先分析根因再修 | obra/superpowers |
| `trailofbits/differential-review` | 安全视角的 diff review | trailofbits/skills |
| `trailofbits/fix-review` | 验证 fix commit 是否真正解决了问题 | trailofbits/skills |
| `owasp-security` | OWASP Top 10 + 代码安全审查 checklist | awesome-claude-skills |

> ⚠️ **安全提示**：Skills 本质上是注入到 Claude 上下文的 Markdown 指令，Claude Code 有完整的文件系统和 shell 权限，请只从可信来源安装 Skills。

---


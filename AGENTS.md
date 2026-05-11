# Codex 插件协作规范（Codex 主导）

> 本文档是 Codex 在本仓库中的主执行规范。
> 当前模式：**Codex 主导，Claude Code 辅助**。
> 主入口：`CODEX.md`

---

## 协作模式

- **Codex（主控）**：需求澄清、方案设计、代码实现、验证、审查、交付总结
- **Claude Code（辅助）**：作为被 Codex 调用的能力节点（MCP Server/子能力）
- 发生冲突时优先级：用户最新指令 > `CODEX.md` > 本文件 > 其他历史文档

---

## 超能力系统

<EXTREMELY_IMPORTANT>
你拥有超能力。超能力会教你新的技能和能力。立即运行：
`node C:/Users/Administrator/.codex/superpowers/.codex/superpowers-codex bootstrap`
并按照返回的指示操作。

Windows PowerShell 中禁止直接执行 `~/.codex/superpowers/.codex/superpowers-codex bootstrap`。
必须使用 `node C:/Users/Administrator/.codex/superpowers/.codex/superpowers-codex bootstrap`，否则会触发文件关联错误。
</EXTREMELY_IMPORTANT>

---

## 基本规则

- 每次都要用简体中文回复
- 代码注释用中文
- 变量和函数名用英文 snake_case

---

## 修改/创建 Python 脚本后必须输出

### 1. 修改说明表格

| 文件       | 操作 | 说明               |
| ---------- | ---- | ------------------ |
| process.py | 修改 | 添加了图像缩放功能 |
| utils.py   | 新建 | 创建工具函数模块   |

### 2. 文件列表

列出所有修改或创建的文件

### 3. 执行命令示例

**格式规则：**

- 参数 ≤1个：单行
- 参数 >1个：用 `\` 分行，每个参数单独一行，缩进 2 空格

**示例：**

```bash
python process.py \
  --input data/input/image.jpg \
  --output data/output/result.jpg \
  --width 800 \
  --height 600
```

---

## 编码规范

- 优先使用标准库和主流生态
- 代码注释用中文
- 小步提交，保持可运行状态

---

## 文件操作硬限制

- 只操作 Prompt 中 Scope 指定目录下的文件
- 禁止删除任何文件或目录，无论理由是什么
- 禁止执行：`rm -rf`、`del`、`rd /s`、`Remove-Item -Recurse`、`git clean -f`、`git reset --hard`
- 需要"清理"时，改为移动到 `[项目目录]/tmp/`，不要删除
- 遇到需要操作 Scope 外文件的情况，必须停下并报告，等待用户确认
- 禁止移动或重命名现有文件；需要重组目录结构时，停下来报告，等用户确认
- 禁止用 PowerShell `Get-Content`/`Set-Content` 处理文本文件；读写文本文件统一用 Python + `encoding='utf-8'`

---

## 编码与文本处理

- 所有文本文件读写必须显式指定 UTF-8 编码
- Python 示例：`Path(f).read_text(encoding='utf-8')` / `Path(f).write_text(content, encoding='utf-8')`
- 禁止依赖系统默认编码（Windows 默认 GBK，会导致中文乱码）

---

## 防乱码规则

- 禁止把多行中文内容直接写进 PowerShell here-string，再由 Python 落盘。
- 如果必须通过 shell + Python 生成中文文件，只允许两种安全路径：
  - 安全路径 A：先写纯 ASCII 转义内容，再在 Python 中解码后写入 UTF-8 文件。
  - 安全路径 B：先读取已有 UTF-8 模板文件，再基于模板修改并按 UTF-8 写回。
- 禁止把 shell 内联字面量作为长篇中文 Markdown 或 Python 中文 docstring 的唯一真实来源。
- 创建或重写任何中文文本文件后，必须执行两个检查：
  - 检查 1：用 `Path(file).read_text(encoding='utf-8')` 重新读取。
  - 检查 2：用 `line.encode('unicode_escape').decode('ascii')` 抽查前 5-20 行，确认中文未被替换成连续问号。
- 任何会输出中文的 Python 脚本，都必须在入口函数开始处调用 `sys.stdout.reconfigure(encoding='utf-8')` 和 `sys.stderr.reconfigure(encoding='utf-8')`。
- 如果文件中的中文已经被连续问号替代，视为内容污染；禁止继续在污染内容上打补丁，必须从干净的 UTF-8 来源整体重写。
- 判断问题属于“终端显示异常”还是“文件内容损坏”时，必须以 `unicode_escape` 抽查为准，不能只相信控制台直接输出。

---

## 任务接收流程

1. 理解需求，复述确认
2. 列出歧义点和风险
3. 判断复杂度（见下方标准）
4. 停下等用户确认后再执行

---

## 复杂度判断标准

满足全部 4 条 → 简单模式（直接执行）：
- ✓ 涉及文件 ≤ 3 个
- ✓ 预估 diff ≤ 200 行
- ✓ 需求明确，无歧义
- ✓ 单模块内，不跨模块

任意 1 条不满足 → 停下报告，等用户确认方案

---

## 角色与职责

### Codex（主控）

✅ **必须做**：
- 需求澄清、方案设计、工作流路由
- 代码生成、修改、重构
- 代码审查（深度）与测试编写
- 大型代码库扫描

❌ **禁止做**：
- 未经确认的跨模块大改
- 越界修改或危险命令执行

### Claude Code（辅助）

✅ **必须做**：
- 按 Codex 指令执行 MCP 能力
- 提供补充分析与交叉验证

❌ **禁止做**：
- 接管主流程决策

---

## Prompt 解读规则

收到结构化 Prompt 时：
1. 先读 `Context` — 了解代码库环境
2. 读 `Task` — 确认唯一可交付项
3. 读 `Constraints` — 这是硬限制，不得违反
4. 读 `Acceptance` — 这定义什么是"完成"

任务模糊时实现最简单的解释。Constraints 冲突时优先级：`API > Scope > Style > Deps`。

---

## 输出格式规范

完成任务后返回：

```
## Result
- Modified: [文件路径列表]
- Added: [文件路径列表]
- Summary: [1-2句话概述]
- Tests: [pass/fail/not run]
```

---

## Linus 哲学对齐

- 简洁优于聪明；向后兼容是铁律
- > 3 层缩进 = 需要重设计；只解决真实问题，不借口实现图正

---

## 提交命名规范

```bash
codex: initial implementation of <feature>
claude-review: fix edge cases in <module>
fix: resolve <bug> in <module>
test: add coverage for <scenario>
```

每次 commit 应附所属任务路径或 Plan 文档路径，便于回溯。

---

## Codex MCP 调用参数（如需反向调用 Codex）

当 **Claude Code 需要反向调用 Codex** 时，必须包含：

```javascript
{
  model: "gpt-5.3-codex",
  sandbox: "danger-full-access",
  "approval-policy": "on-failure"
}
```

---

## 安全检查清单

每次执行前：
- [ ] 确认 Scope 范围（只改指定目录）
- [ ] 确认无删除类命令
- [ ] 确认无文件移动/重命名
- [ ] 确认文本文件用 Python + UTF-8 读写

执行后（Codex 验收）：
- [ ] `git diff --name-only HEAD` 确认改动范围
- [ ] 检查新增/移动文件首行是否可读（无乱码）
- [ ] 对新增或重写的中文文件执行 `unicode_escape` 抽查，确认不存在连续问号污染
- [ ] 发现乱码立即中止，不得在污染文件上继续修补

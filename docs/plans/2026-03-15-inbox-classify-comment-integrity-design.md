# 收件箱同步分类与评论完整性 设计

**Goal:** 收件箱同步保存进入专用目录，并按关键词自动分类；评论抓取完整性可见、可提示。

**Architecture:**
- 收件箱保存链路在写入前注入专用输出根目录与分类结果。
- 分类器使用“关键词命中 + 顺序优先”策略，支持 UI 配置覆盖。
- 评论抓取不足时输出明确提示，并写入 frontmatter 与任务 warnings。

**Data Flow:**
- Inbox URLs -> save_note -> 注入分类 -> note_export -> 写入 Markdown。
- comment_total / comment_collected -> frontmatter + UI/CLI warnings。

## 输出目录
- 收件箱保存输出根目录固定为 `output/收件箱同步`。
- 最终落盘路径为 `output/收件箱同步/<分类>/<标题>.md`。
- 单条保存仍使用 `单条笔记保存`，不受收件箱分类影响。

## 分类规则
- 默认内置分类与关键词清单：AI、理财、职场、学习、工具、数码、生活、健身、美食、旅行、家居、母婴、美妆穿搭、情感、未分类。
- 匹配规则：标题 + 正文 + tags 拼接为文本，按关键词命中数排序，平局按定义顺序优先。
- 未命中时落入 `未分类`。

## UI 配置
- 在 UI 设置中新增“收件箱分类规则”JSON 编辑框。
- JSON 结构示例：
  - `{ "AI": ["AI", "GPT"], "理财": ["ETF", "定投"] }`
- 若 UI 未配置或 JSON 为空，使用内置默认清单。
- 保存时校验 JSON 格式，失败则阻止保存并提示错误。

## 评论完整性
- frontmatter 新增 `comment_total` 与 `comment_collected` 字段。
- 当 `comment_collected < comment_total` 时：
  - 在评论总结区块顶部输出明确提示。
  - 在任务结果中写入 warning，UI 与 CLI 均可见。
- 仅做合规范围内的补充展开，不提供规避/绕过方案。

## Non-goals
- 不引入评论接口绕过或风控规避方式。
- 不改变收藏夹导出或单条保存的既有路径策略。

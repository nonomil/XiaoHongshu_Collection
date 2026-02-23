# 2026-02-23 AI 摘要与标签内嵌设计

## 背景
当前流程通过 `extract_v4.js` 抓取笔记并生成 `output/raw_notes.json`，再由 `ocr_and_write.js` 执行 OCR 并写入 Markdown。用户希望在“现有流程”中自动生成摘要和标签，而不是事后批量改文件。

## 目标
- 在 `ocr_and_write.js` 中完成：OCR 后、写 Markdown 前调用 OpenRouter 生成 `summary` 与 `tags`。
- 默认使用 `openrouter/free`，适配“简单总结 + 标签”的需求。
- 覆盖写入 frontmatter（`summary`、`tags`）。

## 非目标
- 不新增独立的后处理批量脚本。
- 不调整抓取（CDP）与 OCR 逻辑，只在写入阶段增加 AI 处理。

## 方案概述
- 修改 `ocr_and_write.js`：在 OCR 文本得到后，组装输入文本（`title + content + OCR text`），调用 OpenRouter。
- OpenRouter 返回结构化 JSON：`{ summary: string, tags: string[] }`。
- 在 frontmatter 中写入 `summary` 与 `tags`，覆盖原值。

## 数据流
1. `extract_v4.js` → 生成 `output/raw_notes.json`
2. `ocr_and_write.js` → OCR 图片文本
3. 组合输入 → 调用 OpenRouter → 得到 `summary/tags`
4. 写入 Markdown（`output/AI`、`output/笔记`）

## 接口与配置
- 接口：`POST https://openrouter.ai/api/v1/chat/completions`
- 环境变量：
  - `OPENROUTER_API_KEY`（必填）
  - `OPENROUTER_MODEL`（可选，默认 `openrouter/free`）
  - `OPENROUTER_BASE_URL`（可选，默认 `https://openrouter.ai/api/v1`）

## Prompt 与输出约束
- `summary`：中文 1 句，<= 50 字
- `tags`：3-5 个中文标签（名词短语）
- 输出要求：严格 JSON（便于解析与校验）

## 错误处理与降级
- API 超时/失败：降级为“规则摘要（首行截断）+ 现有 tags（含 `小红书`）”。
- 限流：串行请求；重试 2 次，指数退避。
- 输出校验：
  - `summary` 非空且 <= 50 字；否则用降级摘要。
  - `tags` 过滤空字符串，截断到 5 个；不足时追加基础标签。

## 影响范围
- 修改文件：`src/ocr_and_write.js`
- 不修改 `extract_v4.js` / `write_markdown.js`

## 运行方式
- 与当前一致：先运行 `extract_v4.js`，再运行 `ocr_and_write.js`。
- 需要在运行前设置 `OPENROUTER_API_KEY`。

## 验收标准
- 生成的 Markdown frontmatter 中包含 `summary` 与 `tags`。
- `summary` <= 50 字；`tags` 3-5 个。
- API 不可用时仍能写出摘要/标签（降级逻辑生效）。

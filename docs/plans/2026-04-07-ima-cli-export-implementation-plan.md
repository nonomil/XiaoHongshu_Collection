# IMA CLI 导出 Markdown Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在 `G:/UserCode/XiaoHongshu_Collection/prj/Notes_IMA_CLI` 中实现一个可运行的 Node.js CLI，基于 ima 官方 OpenAPI 列出、搜索并导出笔记为本地 Markdown。

**Architecture:** 使用单项目 Node.js CLI 结构，按“参数入口、API 客户端、导出器”分层。第一版只覆盖笔记读取与 Markdown 导出，不实现未证实的知识库导出能力。

**Tech Stack:** Node.js、npm、原生 `fetch`、`node:test`

---

### Task 1: 初始化项目骨架

**Files:**
- Create: `G:/UserCode/XiaoHongshu_Collection/prj/Notes_IMA_CLI/package.json`
- Create: `G:/UserCode/XiaoHongshu_Collection/prj/Notes_IMA_CLI/README.md`
- Create: `G:/UserCode/XiaoHongshu_Collection/prj/Notes_IMA_CLI/src/cli.js`
- Create: `G:/UserCode/XiaoHongshu_Collection/prj/Notes_IMA_CLI/src/config.js`
- Create: `G:/UserCode/XiaoHongshu_Collection/prj/Notes_IMA_CLI/output/.gitkeep`

**Step 1: 写初始化测试目标**

定义最小验收：
- `npm run cli -- --help` 能输出帮助
- `npm test` 能执行空测试集或基础测试文件

**Step 2: 创建最小 `package.json`**

要求：
- 设置 `type: "module"`
- 配置 `bin` 指向 `src/cli.js`
- 提供 `test`、`cli` 脚本

**Step 3: 创建 CLI 入口**

要求：
- 处理 `--help`
- 预留 `auth` 和 `notes` 子命令分发

**Step 4: 创建 `README.md`**

内容至少包含：
- 项目目标
- 已验证的官方能力边界
- 基本使用方式

**Step 5: 运行验证**

Run: `npm test`
Expected: 成功退出

**Step 6: Commit**

```bash
git add G:/UserCode/XiaoHongshu_Collection/prj/Notes_IMA_CLI G:/UserCode/XiaoHongshu_Collection/docs/plans/2026-04-07-ima-cli-export-design.md G:/UserCode/XiaoHongshu_Collection/docs/plans/2026-04-07-ima-cli-export-implementation-plan.md
git commit -m "codex: initialize ima cli export project"
```

### Task 2: 实现凭证加载与鉴权检查

**Files:**
- Modify: `G:/UserCode/XiaoHongshu_Collection/prj/Notes_IMA_CLI/src/config.js`
- Create: `G:/UserCode/XiaoHongshu_Collection/prj/Notes_IMA_CLI/src/ima_api/client.js`
- Create: `G:/UserCode/XiaoHongshu_Collection/prj/Notes_IMA_CLI/tests/config.test.js`
- Create: `G:/UserCode/XiaoHongshu_Collection/prj/Notes_IMA_CLI/tests/client.test.js`

**Step 1: 先写失败测试**

覆盖：
- 环境变量存在时优先读取环境变量
- 环境变量缺失时从本地配置目录读取
- 两者都没有时抛出可读错误

**Step 2: 实现 `config.js`**

要求：
- 读取 `IMA_OPENAPI_CLIENTID`、`IMA_OPENAPI_APIKEY`
- 支持读取用户目录下 `~/.config/ima/client_id` 与 `~/.config/ima/api_key`
- 显式使用 UTF-8

**Step 3: 实现 API 客户端**

要求：
- 固定 base URL 为 `https://ima.qq.com`
- 自动附加 `ima-openapi-clientid`、`ima-openapi-apikey`
- 统一 POST JSON

**Step 4: 增加 `auth check` 命令**

要求：
- 仅检查配置是否齐全
- 可选调用轻量接口验证凭证

**Step 5: 运行验证**

Run: `npm test`
Expected: 新增测试通过

**Step 6: Commit**

```bash
git add G:/UserCode/XiaoHongshu_Collection/prj/Notes_IMA_CLI
git commit -m "feat: add ima auth config and client"
```

### Task 3: 实现笔记列表与搜索

**Files:**
- Create: `G:/UserCode/XiaoHongshu_Collection/prj/Notes_IMA_CLI/src/ima_api/notes.js`
- Modify: `G:/UserCode/XiaoHongshu_Collection/prj/Notes_IMA_CLI/src/cli.js`
- Create: `G:/UserCode/XiaoHongshu_Collection/prj/Notes_IMA_CLI/tests/notes_api.test.js`

**Step 1: 写失败测试**

覆盖：
- 列表接口参数构造正确
- 搜索接口参数构造正确
- 接口返回字段能映射为 CLI 输出对象

**Step 2: 实现 notes API 封装**

至少支持：
- `list_note_by_folder_id`
- `search_note_book`
- `get_doc_content`

**Step 3: 实现 `notes list` 与 `notes search` 命令**

要求：
- 支持纯文本列表输出
- 输出 `doc_id`、标题、修改时间、笔记本名

**Step 4: 运行验证**

Run: `npm test`
Expected: 相关测试通过

**Step 5: Commit**

```bash
git add G:/UserCode/XiaoHongshu_Collection/prj/Notes_IMA_CLI
git commit -m "feat: add ima notes list and search commands"
```

### Task 4: 实现 Markdown 导出器

**Files:**
- Create: `G:/UserCode/XiaoHongshu_Collection/prj/Notes_IMA_CLI/src/exporters/markdown_writer.js`
- Create: `G:/UserCode/XiaoHongshu_Collection/prj/Notes_IMA_CLI/src/exporters/filename.js`
- Create: `G:/UserCode/XiaoHongshu_Collection/prj/Notes_IMA_CLI/src/utils/time.js`
- Create: `G:/UserCode/XiaoHongshu_Collection/prj/Notes_IMA_CLI/tests/filename.test.js`
- Create: `G:/UserCode/XiaoHongshu_Collection/prj/Notes_IMA_CLI/tests/markdown_writer.test.js`

**Step 1: 写失败测试**

覆盖：
- Windows 非法文件名字符被清理
- 导出文件为 UTF-8
- Markdown 头信息字段完整

**Step 2: 实现文件名清洗**

要求：
- 过滤 `<>:\"/\\|?*`
- 控制长度
- 空标题回退到 `untitled-<doc_id>`

**Step 3: 实现 Markdown 写入器**

要求：
- 生成 YAML 头
- 正文前追加一级标题
- 使用 UTF-8 写盘

**Step 4: 运行验证**

Run: `npm test`
Expected: 相关测试通过

**Step 5: Commit**

```bash
git add G:/UserCode/XiaoHongshu_Collection/prj/Notes_IMA_CLI
git commit -m "feat: add markdown export writer"
```

### Task 5: 实现 `notes export`

**Files:**
- Modify: `G:/UserCode/XiaoHongshu_Collection/prj/Notes_IMA_CLI/src/cli.js`
- Modify: `G:/UserCode/XiaoHongshu_Collection/prj/Notes_IMA_CLI/src/ima_api/notes.js`
- Create: `G:/UserCode/XiaoHongshu_Collection/prj/Notes_IMA_CLI/src/utils/errors.js`
- Create: `G:/UserCode/XiaoHongshu_Collection/prj/Notes_IMA_CLI/tests/notes_export.test.js`

**Step 1: 写失败测试**

覆盖：
- `--doc-id` 单篇导出
- `--query` 批量导出
- 缺少参数时报错
- 接口失败时返回可读错误

**Step 2: 实现导出流程**

顺序：
1. 解析参数
2. 定位目标笔记
3. 调用 `get_doc_content` 读取正文
4. 交给 `markdown_writer` 写入 `output/`

**Step 3: 增加批量导出保护**

要求：
- 批量导出打印数量提示
- 同名文件自动追加 `doc_id` 避免覆盖

**Step 4: 运行验证**

Run: `npm test`
Expected: 全部测试通过

**Step 5: 手工验收**

Run:

```bash
npm run cli -- auth check
```

Expected: 在无凭证时输出明确提示；有凭证时通过检查

Run:

```bash
npm run cli -- notes export --doc-id <doc_id>
```

Expected: 在 `G:/UserCode/XiaoHongshu_Collection/prj/Notes_IMA_CLI/output/` 生成 UTF-8 Markdown 文件

**Step 6: Commit**

```bash
git add G:/UserCode/XiaoHongshu_Collection/prj/Notes_IMA_CLI
git commit -m "feat: add ima notes markdown export command"
```

### Task 6: 文档收尾与边界说明

**Files:**
- Modify: `G:/UserCode/XiaoHongshu_Collection/prj/Notes_IMA_CLI/README.md`

**Step 1: 更新 README**

明确写出：
- 当前只支持笔记导出
- 读取内容来自官方纯文本接口，不是官方原生 Markdown 导出
- 知识库导出能力待官方接口进一步确认

**Step 2: 运行最终验证**

Run: `npm test`
Expected: 全部通过

**Step 3: 输出样例命令**

```bash
npm run cli -- notes search "周报"
```

```bash
npm run cli -- notes export --query "周报"
```

```bash
npm run cli -- notes export --folder-id <folder_id>
```

**Step 4: Commit**

```bash
git add G:/UserCode/XiaoHongshu_Collection/prj/Notes_IMA_CLI/README.md
git commit -m "docs: clarify ima export scope and usage"
```

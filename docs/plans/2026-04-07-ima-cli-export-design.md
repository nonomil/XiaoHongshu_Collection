# IMA CLI 导出 Markdown 设计

**目标**

在 `G:/UserCode/XiaoHongshu_Collection/prj/Notes_IMA_CLI` 中新建一个独立 CLI 工具，基于腾讯 ima 官方 OpenAPI 读取个人笔记与知识库元数据，并将可读取内容导出为本地 Markdown 文件，形成可归档、可二次加工的本地文档资产。

**已验证事实**

- `https://ima.qq.com/agent-interface` 在线，且可用于获取 `Client ID` 与 `API Key`。
- 腾讯公开技能包 `https://app-dl.ima.qq.com/skills/ima-skills-1.1.2.zip` 在线可下载。
- 技能包中的 `notes` 与 `knowledge-base` 文档表明：
  - 笔记写入接口 `import_doc`、`append_doc` 只接受 Markdown。
  - 笔记读取接口 `get_doc_content` 支持 `target_content_format=0` 纯文本，`1` Markdown 当前不支持。
  - 知识库支持上传 Markdown 文件，也支持添加微信公众号文章 URL。
- 技能包中未发现 `ima kb export` 之类的官方 API 定义，因此不能把第三方文章中的该命令视为已证实能力。

**问题定义**

当前 ima 公开能力更像“OpenAPI + 技能接入”，而不是一个已经面向终端用户稳定发布的官方命令行工具。要实现“导出 Markdown”，需要我们自行封装 CLI，并在以下边界内工作：

1. 笔记可通过官方接口读取正文，但拿到的是纯文本而非原生 Markdown。
2. 知识库公开接口当前偏向“添加、浏览、搜索”，未在已验证材料中看到直接导出全文的官方接口。
3. 因此第一版应聚焦“笔记导出为 Markdown”，知识库先做列表与定位能力，为后续扩展保留接口。

**第一版范围**

第一版只做最稳路径，避免空耗在未证实接口上：

- 配置 ima OpenAPI 凭证
- 列出笔记本与笔记
- 按标题搜索笔记
- 读取单篇笔记正文
- 将笔记保存为本地 `.md`
- 支持批量导出搜索结果或指定笔记本下的笔记
- 导出时生成简单元数据头，便于后续导入 Obsidian、IMA 或其他知识库

明确不做：

- 不假设存在官方 `kb export`
- 不直接导出知识库全文
- 不做浏览器自动化
- 不做公众号抓取
- 不做反向写回 ima

**推荐方案**

采用 Node.js CLI 单体结构，理由如下：

- 仓库现有项目已使用 Node.js，复用成本低。
- Windows 环境下用 Node 处理 UTF-8、路径、HTTP 请求更稳定。
- 后续如果要补公众号文章处理、Markdown 资源整理，也方便沿用同一技术栈。

CLI 采用“薄命令层 + API 客户端 + 导出器”三层结构：

1. `commands/`
   - 解析参数，校验输入，调用业务层
2. `src/ima_api/`
   - 负责凭证加载、请求头、接口调用、错误归一化
3. `src/exporters/`
   - 负责文件名清洗、Markdown 头信息生成、批量写盘

**命令设计**

第一版建议命令集如下：

```bash
ima-cli auth check
ima-cli notes list
ima-cli notes search "关键词"
ima-cli notes export --doc-id <doc_id>
ima-cli notes export --query "关键词"
ima-cli notes export --folder-id <folder_id>
```

命令语义：

- `auth check`
  - 检查环境变量或本地配置中的 `client_id` / `api_key`
  - 可选请求一个轻量接口验证凭证是否可用
- `notes list`
  - 列出全部笔记或某个笔记本下的笔记
- `notes search`
  - 按标题或正文关键词搜索，输出结构化列表
- `notes export`
  - 单篇或批量导出
  - 输出为 UTF-8 Markdown 文件

**导出格式**

因为官方读取接口返回纯文本，第一版导出的 Markdown 采用“元数据头 + 原始正文”的保守策略：

```md
---
title: 原笔记标题
doc_id: xxxxx
folder_name: 某笔记本
modify_time: 2026-04-07T10:00:00+08:00
source: ima
exported_at: 2026-04-07T23:00:00+08:00
---

# 原笔记标题

这里是从 ima 读取到的纯文本正文。
```

这样做的优点是：

- 文件可直接被大部分 Markdown 工具消费
- 元数据完整，后续可再导回知识库或做索引
- 不伪装成“原生 Markdown 导出”，结论更诚实

**目录结构**

建议在项目目录创建以下结构：

```text
prj/Notes_IMA_CLI/
  package.json
  README.md
  src/
    cli.js
    config.js
    ima_api/
      client.js
      notes.js
    exporters/
      markdown_writer.js
      filename.js
    utils/
      time.js
      errors.js
  output/
  ref/
  tests/
    notes_export.test.js
    filename.test.js
    config.test.js
```

**错误处理**

第一版重点处理四类错误：

1. 凭证缺失
2. 凭证无效或接口鉴权失败
3. 指定笔记不存在或无权限读取
4. 本地文件写入失败

CLI 输出原则：

- 对用户输出简洁中文说明
- 对调试日志保留原始接口错误码与请求上下文摘要
- 不在日志中打印 `api_key`

**测试策略**

测试以单元测试为主，避免把真实 ima 凭证耦合进仓库：

- `config`：验证凭证加载优先级
- `filename`：验证 Windows 非法字符清洗
- `markdown_writer`：验证导出格式与 UTF-8 写入
- `notes export`：通过 mock API 响应验证单篇和批量导出流程

后续如需要，可在本地增加一个手工验收脚本，用真实凭证联调，但不纳入自动化测试。

**风险与边界**

- 如果后续发现 ima 新增了可直接返回 Markdown 的读取接口，应优先切换到官方能力。
- 如果知识库开放全文读取接口，第二版再补 `kb export`，不要在第一版里预埋伪实现。
- 当前只基于已验证的公开 OpenAPI 和技能包设计，不依赖第三方文章中的未证实命令。

**阶段性交付**

第一阶段交付标准：

- 能在本地跑通 `auth check`
- 能列出与搜索笔记
- 能把单篇笔记导出为 Markdown
- 能把搜索结果批量导出到 `output/`

达到以上标准后，再决定是否扩到知识库与公众号链路。

# Notes_IMA_CLI

用于把腾讯 ima 笔记内容导出为本地 Markdown 的命令行工具。

## 当前范围

- 校验 ima OpenAPI 凭证
- 列出与搜索笔记
- 将笔记导出到本地 Markdown

## 已验证边界

- 当前基于 ima 官方 OpenAPI 设计
- 已确认笔记写入使用 Markdown
- 已确认笔记读取接口当前优先返回纯文本
- 还没有把第三方文章中的 `ima kb export` 当作官方已证实能力

## 凭证配置

优先读取环境变量：

```bash
set IMA_OPENAPI_CLIENTID=your_client_id
set IMA_OPENAPI_APIKEY=your_api_key
```

也支持读取用户目录下的配置文件：

```text
~/.config/ima/client_id
~/.config/ima/api_key
```

两个文件都按 UTF-8 文本读取。

## 命令

```bash
node src/cli.js --help
```

```bash
node src/cli.js auth check
```

```bash
node src/cli.js notes folders
```

```bash
node src/cli.js notes list
```

```bash
node src/cli.js notes list --folder-id folder-work
```

```bash
node src/cli.js notes search "周报"
```

```bash
node src/cli.js notes search "项目排期" --content --limit 5
```

```bash
node src/cli.js notes export --doc-id doc-001
```

```bash
node src/cli.js notes export --doc-id doc-001 --title "临时标题" --folder-name "收集箱"
```

```bash
node src/cli.js notes export --query "周报"
```

```bash
node src/cli.js notes export --query "项目排期" --content --limit 5
```

## 导出说明

- 导出的 Markdown 文件默认写入 `output/`
- 文件内容包含 YAML 头信息和正文
- 当前正文来自 ima 官方读取接口返回的纯文本，不是官方原生 Markdown 导出
- `auth check` 除了检查凭证存在，还会执行一次轻量接口探活
- `notes search --content` 会切到正文检索模式
- `--limit` 可用于限制搜索与批量导出的结果数
- 仅提供 `--doc-id` 导出时，若拿不到标题，文件会回退为 `Untitled`

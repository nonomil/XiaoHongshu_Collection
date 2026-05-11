# 视频总结 CLI

`video_summary_cli` 是本仓库的首版命令行工具，用于把哔哩哔哩和 YouTube 单视频转成结构化 Markdown 总结。

当前稳定版本：`0.3.0`

## 目标

- 统一处理 B 站与 YouTube URL
- 优先使用现成字幕
- 输出可复核的元数据、转写、章节化教程笔记与版本快照
- 提供本地 Web 工作台，支持多链接批量导出

## 安装

```bash
python -m venv .venv
.venv\\Scripts\\python -m pip install --upgrade pip
.venv\\Scripts\\python -m pip install -e .[dev,asr,media,web]
```

## 测试

```bash
.venv\\Scripts\\pytest tests -q
```

## 运行

```bash
.venv\\Scripts\\python -m video_summary_cli.cli \
  summarize \
  --url https://b23.tv/1SzaT3c \
  --output-dir ..\\docs\\output \
  --cookies ..\\ref\\Data\\www.bilibili.com_cookies.txt \
  --transcriber auto \
  --screenshot-mode smart \
  --screenshot-count 3 \
  --summary-style tutorial-note
```

## Web 工作台

```bash
.venv\\Scripts\\video-summary \
  web \
  --host 127.0.0.1 \
  --port 7860
```

如果你是在 Windows 下双击启动，也可以从仓库根目录运行 `start_web_ui.bat`。
如果 `7860` 端口已被占用，可以直接双击 `start_web_ui_7861.bat`。
如果需要查看详细日志并保留窗口，可以运行 `start_web_ui_debug.bat`。

启动后访问 `http://127.0.0.1:7860/`，支持：

- 一次输入多个视频链接
- 批次目录下平铺导出多个 Markdown
- 图片统一放到 `img/<文档名>.assets/`
- 本地持久化 cookies、输出目录和 OpenAI 兼容配置
- 关闭“保存 API Key”后，只用于当前提交任务，不写入本机配置
- 可选启用 OpenAI 兼容摘要增强，默认仍会回退到本地抽取式摘要

如果视频没有可用字幕，可回退到本地 ASR：

```bash
.venv\\Scripts\\python -m video_summary_cli.cli \
  summarize \
  --url https://b23.tv/1SzaT3c \
  --output-dir ..\\docs\\output \
  --transcriber faster-whisper \
  --whisper-model tiny \
  --screenshot-mode smart \
  --screenshot-count 3 \
  --summary-style tutorial-note
```

## 输出

CLI 单视频模式成功后将在 `docs/output/<slug-video-id>/` 下生成：

- `metadata.json`
- `transcript.txt`
- `<视频标题>.md`
- `img/`
- `versions/`
- `versions/manifest.json`
- `versions/<timestamp>/chapters.json`
- `versions/<timestamp>/screenshot_caption_blocks.json`

Web 批处理模式会在单个批次目录下生成：

- `<视频标题>.md`
- `img/<文档名>.assets/`
- `.runs/<slug-video-id>/metadata.json`
- `.runs/<slug-video-id>/transcript.txt`
- `.runs/<slug-video-id>/versions/...`
- `batch_manifest.json`

如果要启用截图快速模式：

```bash
.venv\\Scripts\\python -m video_summary_cli.cli \
  summarize \
  --url https://b23.tv/1SzaT3c \
  --output-dir ..\\docs\\output \
  --cookies ..\\ref\\Data\\www.bilibili.com_cookies.txt \
  --transcriber none \
  --screenshot-mode quick \
  --screenshot-count 3 \
  --summary-style default
```

如果要启用截图智能模式：

```bash
.venv\\Scripts\\python -m video_summary_cli.cli \
  summarize \
  --url https://b23.tv/1SzaT3c \
  --output-dir ..\\docs\\output \
  --cookies ..\\ref\\Data\\www.bilibili.com_cookies.txt \
  --transcriber none \
  --screenshot-mode smart \
  --screenshot-count 3 \
  --summary-style default
```

智能模式默认用 OpenCV 做画面相似度过滤；如果本机安装了 `tesseract`，会自动开启 OCR 辅助去重。

## 风格模板

- `default`：通用总结结构
- `concise`：更精简，突出一句话总结与时间锚点
- `tutorial-note`：更适合教程视频，突出 `AI 总结 / 关键信息 / 标签 / 学习目标 / 章节拆解`
- `tutorial-note` 的章节拆解会把每个小节渲染成 `1.x 小节标题 -> 视频节点 -> 内容摘要 -> 对应画面`
- `action-note`：更适合任务导向内容，突出执行清单

## 版本化

- 根目录文件始终表示当前最新一次生成结果
- `versions/<timestamp>/` 会保存当次生成的 `metadata.json`、`transcript.txt`、`<视频标题>.md`、`chapters.json`、`screenshot_caption_blocks.json`
- 如果当次结果引用了截图，版本目录会复制对应图片，避免后续运行覆盖最新目录时丢失历史证据
- `versions/manifest.json` 会记录 `transcriber`、`whisper_model`、`screenshot_mode`、`screenshot_count`、`summary_style`、`summary_quality_mode`、`chapter_count`、`key_segment_strategy`、`screenshot_binding` 与生成时间

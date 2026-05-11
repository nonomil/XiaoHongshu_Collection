# 视频保存图文笔记子项目

此目录是从 `G:\UserCode\视频总结文档` 中拷贝的可运行子项目，保留了 CLI 与 Web 工作台入口。

## 快速开始

```bash
cd prj
python -m venv .venv
.venv\\Scripts\\python -m pip install --upgrade pip
.venv\\Scripts\\python -m pip install -e .[dev,asr,media,web]
```

## CLI 入口

```bash
.venv\\Scripts\\python -m video_summary_cli.cli --help
```

## Web 工作台

```bash
.venv\\Scripts\\video-summary web --host 127.0.0.1 --port 7860
```

## Windows 启动脚本

可直接使用目标目录根下的脚本：

```bash
start_web_ui.bat
```

如果 `7860` 端口被占用，可改用：

```bash
start_web_ui_7861.bat
```

如果需要保留启动日志排查问题，可改用：

```bash
start_web_ui_debug.bat
```

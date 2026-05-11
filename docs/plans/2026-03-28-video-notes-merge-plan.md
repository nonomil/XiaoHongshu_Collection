# 视频图文笔记独立合入 实施计划

> **给 Claude:** 必需子技能：使用 superpowers:executing-plans 来逐任务实施此计划。

**目标：** 将源仓的“视频保存图文笔记”子项目独立拷贝到目标仓库，确保 CLI + Web 入口可运行。

**架构：** 拷贝 `prj` 目录到 `Notes_Video_Collection/prj`，排除 `.venv`。目标目录保留独立虚拟环境和运行指令。

**技术栈：** Python 3.11+，pyproject + editable install，CLI + Web 工作台。

---

### 任务 1：准备目标目录和拷贝子项目

**文件：**
- 创建：`G:/UserCode/XiaoHongshu_Collection/Notes_Video_Collection/README.md`
- 创建：`G:/UserCode/XiaoHongshu_Collection/Notes_Video_Collection/prj/**`

**步骤 1：拷贝子项目（排除 `.venv`）**

执行：使用 Python `shutil.copytree` 拷贝，排除 `.venv`、`__pycache__`、`.pytest_cache`。

**步骤 2：写入 README**

内容包含：创建虚拟环境、安装依赖、运行 CLI/Web 指令。

**步骤 3：验证基础入口**

运行：`python -m video_summary_cli.cli --help`

预期：输出 CLI 帮助信息。

运行：`video-summary web --help`

预期：输出 Web 入口帮助信息。

**步骤 4：提交**

```bash
git add G:/UserCode/XiaoHongshu_Collection/Notes_Video_Collection G:/UserCode/XiaoHongshu_Collection/docs/plans/2026-03-28-video-notes-merge-design.md G:/UserCode/XiaoHongshu_Collection/docs/plans/2026-03-28-video-notes-merge-plan.md
git commit -m "codex: initial implementation of video notes subproject"
```

# 视频保存图文笔记功能合入设计

> 日期：2026-03-28
> 目标目录：G:\UserCode\XiaoHongshu_Collection\Notes_Video_Collection

## 目标
将 `G:\UserCode\视频总结文档` 中的“视频保存图文笔记”能力以独立可运行的形式合入到当前仓库，新目标位置为 `Notes_Video_Collection`。

## 决策
- 优先目标：独立可运行，不直接绑定现有 UI/后端。
- 合入方案：拷贝源仓 `prj` 子项目至目标目录，排除 `.venv` 等运行产物。
- 交付形式：保留 CLI + 本地 Web 工作台入口，使用目标目录的虚拟环境独立运行。

## 交付结构
- `Notes_Video_Collection/prj`：源仓可运行子项目
- `Notes_Video_Collection/README.md`：使用说明

## 风险
- 可能存在未导出的本地依赖或配置。
- Windows 环境下需注意 UTF-8 编码规则。

## 验证
- 目标目录下可执行 `python -m video_summary_cli.cli --help`。
- 可执行 `video-summary web --help` 确认 Web 入口可用。

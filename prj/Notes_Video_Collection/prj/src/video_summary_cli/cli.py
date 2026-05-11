from __future__ import annotations

import argparse
import sys
from pathlib import Path

from video_summary_cli import __version__
from video_summary_cli.models import VideoMetadata
from video_summary_cli.note_styles import SUMMARY_STYLE_CHOICES
from video_summary_cli.pipeline import VideoSummaryPipeline
from video_summary_cli.runtime_factory import (
    build_fetcher as _build_fetcher_impl,
    build_screenshot_sampler as _build_screenshot_sampler_impl,
    build_transcriber as _build_transcriber_impl,
)
from video_summary_cli.settings import AppSettings
from video_summary_cli.storage import build_output_directory, save_summary_artifacts


def build_parser() -> argparse.ArgumentParser:
    """构建命令行解析器。"""

    parser = argparse.ArgumentParser(description="把视频转成 Markdown 总结。")
    parser.add_argument(
        "--version",
        action="version",
        version=f"%(prog)s {__version__}",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    summarize_parser = subparsers.add_parser("summarize", help="处理单个视频链接")
    summarize_parser.add_argument("--url", required=True, help="视频链接")
    summarize_parser.add_argument(
        "--output-dir",
        type=Path,
        default=AppSettings.default_output_dir(),
        help="产物输出目录",
    )
    summarize_parser.add_argument(
        "--cookies",
        type=Path,
        help="Netscape/Mozilla 格式 cookies 文件路径",
    )
    summarize_parser.add_argument(
        "--transcriber",
        choices=["auto", "none", "faster-whisper"],
        default="auto",
        help="缺字幕时使用的转写器",
    )
    summarize_parser.add_argument(
        "--whisper-model",
        default="tiny",
        help="faster-whisper 模型大小",
    )
    summarize_parser.add_argument(
        "--screenshot-mode",
        choices=["none", "quick", "smart"],
        default="none",
        help="是否生成截图插图",
    )
    summarize_parser.add_argument(
        "--screenshot-count",
        type=int,
        default=3,
        help="截图快速模式下的采样数量",
    )
    summarize_parser.add_argument(
        "--summary-style",
        choices=list(SUMMARY_STYLE_CHOICES),
        default="default",
        help="总结文档风格模板",
    )

    web_parser = subparsers.add_parser("web", help="启动本地 Web 控制台")
    web_parser.add_argument("--host", default="127.0.0.1", help="监听地址")
    web_parser.add_argument("--port", type=int, default=7860, help="监听端口")
    web_parser.add_argument(
        "--config-path",
        type=Path,
        help="Web 控制台配置文件路径",
    )
    return parser


def run_summarize_command(
    url: str,
    output_dir: Path,
    fetcher=None,
    transcriber=None,
    summarizer=None,
    cookies_path: Path | None = None,
    screenshot_sampler=None,
    transcriber_name: str = "auto",
    screenshot_mode: str = "none",
    screenshot_count: int = 0,
    whisper_model: str = "tiny",
    summary_style: str = "default",
) -> Path:
    """执行单视频总结命令。"""

    target_output_dir = Path(output_dir)
    target_output_dir.mkdir(parents=True, exist_ok=True)
    active_fetcher = fetcher or _build_fetcher_impl(cookies_path=cookies_path)
    metadata: VideoMetadata = active_fetcher.extract_metadata(url)
    video_output_dir = build_output_directory(
        target_output_dir,
        metadata.title,
        metadata.video_id,
    )
    video_output_dir.mkdir(parents=True, exist_ok=True)
    pipeline = VideoSummaryPipeline(
        fetcher=active_fetcher,
        transcriber=transcriber,
        summarizer=summarizer,
        screenshot_sampler=screenshot_sampler,
        summary_style=summary_style,
    )
    document = pipeline.run_with_metadata(metadata, video_output_dir)
    return save_summary_artifacts(
        document,
        target_output_dir,
        run_options={
            "transcriber": transcriber_name,
            "whisper_model": whisper_model,
            "screenshot_mode": screenshot_mode,
            "screenshot_count": screenshot_count,
            "summary_style": summary_style,
        },
    )


def main(argv: list[str] | None = None) -> int:
    """CLI 主入口。"""

    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

    parser = build_parser()
    args = parser.parse_args(argv)

    try:
        if args.command == "summarize":
            active_transcriber = _build_transcriber(args.transcriber, args.whisper_model)
            screenshot_sampler = _build_screenshot_sampler(args.screenshot_mode, args.screenshot_count)
            output_directory = run_summarize_command(
                args.url,
                args.output_dir,
                transcriber=active_transcriber,
                cookies_path=args.cookies,
                screenshot_sampler=screenshot_sampler,
                transcriber_name=args.transcriber,
                screenshot_mode=args.screenshot_mode,
                screenshot_count=args.screenshot_count,
                whisper_model=args.whisper_model,
                summary_style=args.summary_style,
            )
            print(f"已生成输出目录：{output_directory}")
            return 0
        if args.command == "web":
            run_web_command(args.host, args.port, args.config_path)
            return 0
    except Exception as exc:  # pragma: no cover - CLI 兜底分支
        print(f"执行失败：{exc}", file=sys.stderr)
        return 1

    parser.error("未知命令")
    return 2


def _build_transcriber(name: str, whisper_model: str):
    return _build_transcriber_impl(name, whisper_model)


def _build_screenshot_sampler(mode: str, screenshot_count: int):
    return _build_screenshot_sampler_impl(mode, screenshot_count)


def run_web_command(host: str, port: int, config_path: Path | None = None) -> None:
    """启动本地 Web UI 服务。"""

    from uvicorn import run as run_uvicorn

    from video_summary_cli.web_app import create_app

    app = create_app(config_path=config_path)
    run_uvicorn(app, host=host, port=port)


if __name__ == "__main__":
    raise SystemExit(main())

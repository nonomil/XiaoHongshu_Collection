from __future__ import annotations

from pathlib import Path

from video_summary_cli.fetcher import YtDlpVideoFetcher
from video_summary_cli.frame_sampler import SmartVideoFrameSampler, VideoFrameSampler
from video_summary_cli.models import VideoPlatform
from video_summary_cli.multi_platform_fetcher import MultiPlatformVideoFetcher
from video_summary_cli.screenshot_selector import (
    OpenCvBlurBackend,
    OpenCvContentBackend,
    ScreenshotSelector,
    build_default_ocr_backend,
)
from video_summary_cli.transcriber import FasterWhisperTranscriber
from video_summary_cli.xiaohongshu_fetcher import XiaohongshuVideoFetcher


def build_fetcher(cookies_path: Path | None = None) -> MultiPlatformVideoFetcher:
    """构建统一抓取器。"""

    normalized_cookies_path = Path(cookies_path) if cookies_path else None
    return MultiPlatformVideoFetcher(
        default_fetcher=YtDlpVideoFetcher(cookies_path=normalized_cookies_path),
        platform_fetchers={
            VideoPlatform.XIAOHONGSHU: XiaohongshuVideoFetcher(cookies_path=normalized_cookies_path),
        },
    )


def build_transcriber(name: str, whisper_model: str):
    """按名称构建转写器。"""

    if name == "none":
        return None
    if name in {"auto", "faster-whisper"}:
        return FasterWhisperTranscriber(model_size=whisper_model)
    raise ValueError(f"未知转写器：{name}")


def build_screenshot_sampler(mode: str, screenshot_count: int):
    """按模式构建截图采样器。"""

    if mode == "none":
        return None
    if mode == "quick":
        return VideoFrameSampler(
            screenshot_count=screenshot_count,
            relative_directory=Path("img"),
        )
    if mode == "smart":
        return SmartVideoFrameSampler(
            screenshot_count=screenshot_count,
            selector=ScreenshotSelector(
                ocr_backend=build_default_ocr_backend(),
                blur_backend=OpenCvBlurBackend(),
                content_backend=OpenCvContentBackend(),
            ),
            relative_directory=Path("img"),
        )
    raise ValueError(f"未知截图模式：{mode}")

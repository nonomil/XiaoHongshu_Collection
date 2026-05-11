from __future__ import annotations

import json
import re
import shutil
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Callable

from video_summary_cli.cli import _build_transcriber
from video_summary_cli.frame_sampler import SmartVideoFrameSampler, VideoFrameSampler
from video_summary_cli.models import VideoMetadata
from video_summary_cli.openai_compatible import OpenAICompatibleConfig, OpenAICompatibleSummarizer
from video_summary_cli.paths import (
    build_document_assets_directory,
    build_document_basename,
    build_output_directory,
    build_summary_markdown_filename,
    relative_to_output,
)
from video_summary_cli.pipeline import VideoSummaryPipeline
from video_summary_cli.runtime_factory import build_fetcher
from video_summary_cli.screenshot_selector import (
    OpenCvBlurBackend,
    OpenCvContentBackend,
    ScreenshotSelector,
    build_default_ocr_backend,
)
from video_summary_cli.storage import save_summary_artifacts
from video_summary_cli.summarizer import ExtractiveSummarizer


URL_PATTERN = re.compile(r"https?://[^\s，,]+", flags=re.IGNORECASE)


@dataclass(slots=True)
class BatchRequest:
    """批量任务的运行参数。"""

    urls: list[str]
    output_root: Path
    batch_name: str = ""
    cookies_path: Path | None = None
    transcriber_name: str = "auto"
    whisper_model: str = "tiny"
    screenshot_mode: str = "smart"
    screenshot_count: int = 8
    summary_style: str = "tutorial-note"
    openai_compatible: OpenAICompatibleConfig = field(default_factory=OpenAICompatibleConfig)


@dataclass(slots=True)
class BatchItemResult:
    """批量任务中的单条结果。"""

    url: str
    title: str = ""
    summary_path: Path | None = None
    assets_directory: Path | None = None
    record_directory: Path | None = None
    summary_source: str = "extractive"
    status: str = "queued"
    error: str = ""


@dataclass(slots=True)
class BatchRunResult:
    """批量任务总结果。"""

    batch_directory: Path
    items: list[BatchItemResult]
    status: str = "succeeded"


@dataclass(slots=True)
class SingleRunResult:
    """单视频流水线的最小返回值。"""

    record_directory: Path
    summary_source: str = "extractive"


class WebBatchRunner:
    """面向前端的批量导出执行器。"""

    def __init__(self, single_run_callable: Callable[..., Path | SingleRunResult] | None = None) -> None:
        self.single_run_callable = single_run_callable or run_single_summary_for_web

    def run_batch(
        self,
        request: BatchRequest,
        progress_callback: Callable[[dict[str, Any]], None] | None = None,
    ) -> BatchRunResult:
        batch_directory = build_batch_directory(request.output_root, request.batch_name)
        batch_directory.mkdir(parents=True, exist_ok=False)
        (batch_directory / "img").mkdir(exist_ok=True)
        records_root = batch_directory / ".runs"
        records_root.mkdir(exist_ok=True)

        item_results: list[BatchItemResult] = []
        for index, url in enumerate(request.urls):
            if progress_callback is not None:
                progress_callback(
                    {
                        "type": "item_started",
                        "index": index,
                        "url": url,
                        "message": "开始抓取和整理视频。",
                    }
                )
            try:
                single_run_result = self.single_run_callable(
                    url=url,
                    output_root=records_root,
                    cookies_path=request.cookies_path,
                    transcriber_name=request.transcriber_name,
                    whisper_model=request.whisper_model,
                    screenshot_mode=request.screenshot_mode,
                    screenshot_count=request.screenshot_count,
                    summary_style=request.summary_style,
                    openai_compatible=request.openai_compatible,
                )
                normalized_run_result = _normalize_single_run_result(single_run_result)
                item_result = export_record_directory_to_batch(
                    record_directory=normalized_run_result.record_directory,
                    batch_directory=batch_directory,
                    source_url=url,
                    summary_source=normalized_run_result.summary_source,
                )
                item_results.append(item_result)
                if progress_callback is not None:
                    progress_callback(
                        {
                            "type": "item_succeeded",
                            "index": index,
                            "url": url,
                            "title": item_result.title,
                            "summary_path": str(item_result.summary_path),
                            "assets_directory": str(item_result.assets_directory),
                            "record_directory": str(item_result.record_directory),
                            "summary_source": item_result.summary_source,
                            "message": "已导出 Markdown、图片和版本记录。",
                        }
                    )
            except Exception as exc:
                failed_item = BatchItemResult(
                    url=url,
                    status="failed",
                    error=str(exc),
                )
                item_results.append(failed_item)
                if progress_callback is not None:
                    progress_callback(
                        {
                            "type": "item_failed",
                            "index": index,
                            "url": url,
                            "error": str(exc),
                            "message": "当前视频处理失败。",
                        }
                    )

        batch_status = determine_batch_status(item_results)
        write_batch_manifest(
            batch_directory=batch_directory,
            request=request,
            item_results=item_results,
            batch_status=batch_status,
        )
        return BatchRunResult(
            batch_directory=batch_directory,
            items=item_results,
            status=batch_status,
        )


def parse_batch_urls(raw_text: str) -> list[str]:
    """解析并去重批量链接。"""

    seen_urls: set[str] = set()
    normalized_urls: list[str] = []
    for raw_match in URL_PATTERN.findall(raw_text or ""):
        candidate_url = raw_match.strip()
        if not candidate_url or candidate_url in seen_urls:
            continue
        seen_urls.add(candidate_url)
        normalized_urls.append(candidate_url)
    return normalized_urls


def build_batch_directory(
    output_root: Path,
    batch_name: str = "",
    generated_at: datetime | None = None,
) -> Path:
    """构建批量导出目录。"""

    timestamp = generated_at or datetime.now().astimezone()
    default_name = f"视频总结批次-{timestamp.strftime('%Y%m%d-%H%M%S')}"
    base_name = build_document_basename(batch_name or default_name)
    candidate_path = output_root / base_name
    suffix = 2
    while candidate_path.exists():
        candidate_path = output_root / f"{base_name}-{suffix:02d}"
        suffix += 1
    return candidate_path


def run_single_summary_for_web(
    *,
    url: str,
    output_root: Path,
    cookies_path: Path | None = None,
    transcriber_name: str = "auto",
    whisper_model: str = "tiny",
    screenshot_mode: str = "smart",
    screenshot_count: int = 8,
    summary_style: str = "tutorial-note",
    openai_compatible: OpenAICompatibleConfig | None = None,
) -> SingleRunResult:
    """执行一次单视频总结，供 Web 批量导出复用。"""

    active_fetcher = build_fetcher(cookies_path=cookies_path)
    metadata: VideoMetadata = active_fetcher.extract_metadata(url)
    record_directory = build_output_directory(output_root, metadata.title, metadata.video_id)
    record_directory.mkdir(parents=True, exist_ok=True)

    summarizer = build_web_summarizer(openai_compatible or OpenAICompatibleConfig())
    pipeline = VideoSummaryPipeline(
        fetcher=active_fetcher,
        transcriber=_build_transcriber(transcriber_name, whisper_model),
        summarizer=summarizer,
        screenshot_sampler=build_web_screenshot_sampler(screenshot_mode, screenshot_count),
        summary_style=summary_style,
    )
    document = pipeline.run_with_metadata(metadata, record_directory)
    save_summary_artifacts(
        document,
        output_root,
        run_options={
            "transcriber": transcriber_name,
            "whisper_model": whisper_model,
            "screenshot_mode": screenshot_mode,
            "screenshot_count": screenshot_count,
            "summary_style": summary_style,
        },
    )
    return SingleRunResult(
        record_directory=record_directory,
        summary_source=getattr(summarizer, "last_result_source", "extractive"),
    )


def build_web_summarizer(openai_compatible: OpenAICompatibleConfig):
    """根据配置构建摘要器。"""

    if openai_compatible.enabled:
        return OpenAICompatibleSummarizer(config=openai_compatible)
    return ExtractiveSummarizer()


def build_web_screenshot_sampler(screenshot_mode: str, screenshot_count: int):
    """构建前端专用截图采样器。"""

    if screenshot_mode == "none":
        return None
    if screenshot_mode == "quick":
        return VideoFrameSampler(
            screenshot_count=screenshot_count,
            relative_directory=Path("img"),
        )
    if screenshot_mode == "smart":
        return SmartVideoFrameSampler(
            screenshot_count=screenshot_count,
            chapter_probe_count=max(screenshot_count, 6),
            selector=ScreenshotSelector(
                ocr_backend=build_default_ocr_backend(),
                blur_backend=OpenCvBlurBackend(),
                content_backend=OpenCvContentBackend(),
            ),
            relative_directory=Path("img"),
        )
    raise ValueError(f"未知截图模式：{screenshot_mode}")


def export_record_directory_to_batch(
    *,
    record_directory: Path,
    batch_directory: Path,
    source_url: str,
    summary_source: str,
) -> BatchItemResult:
    """把单视频输出目录导出到批量目录根部。"""

    metadata_payload = json.loads((record_directory / "metadata.json").read_text(encoding="utf-8"))
    title = str(metadata_payload.get("title") or record_directory.name)
    video_id = str(metadata_payload.get("video_id") or record_directory.name)
    original_basename = build_document_basename(title)
    export_basename = allocate_export_basename(batch_directory, original_basename, video_id)

    source_summary_path = record_directory / build_summary_markdown_filename(title)
    target_summary_path = batch_directory / f"{export_basename}.md"
    source_assets_directory = record_directory / build_document_assets_directory(title)
    target_assets_directory = batch_directory / "img" / f"{export_basename}.assets"

    summary_markdown = source_summary_path.read_text(encoding="utf-8")
    if export_basename != original_basename:
        summary_markdown = summary_markdown.replace(
            f"img/{original_basename}.assets/",
            f"img/{export_basename}.assets/",
        )
    target_summary_path.write_text(summary_markdown, encoding="utf-8")

    if source_assets_directory.exists():
        copy_directory_tree(source_assets_directory, target_assets_directory)

    return BatchItemResult(
        url=source_url,
        title=title,
        summary_path=target_summary_path,
        assets_directory=target_assets_directory,
        record_directory=record_directory,
        summary_source=summary_source,
        status="succeeded",
    )


def allocate_export_basename(batch_directory: Path, base_name: str, video_id: str) -> str:
    """为同批次中的重名标题分配稳定文件名。"""

    summary_path = batch_directory / f"{base_name}.md"
    assets_directory = batch_directory / "img" / f"{base_name}.assets"
    if not summary_path.exists() and not assets_directory.exists():
        return base_name
    return f"{base_name} - {video_id}"


def copy_directory_tree(source_directory: Path, target_directory: Path) -> None:
    """复制目录树，不删除目标已有内容。"""

    for source_path in source_directory.rglob("*"):
        if source_path.is_dir():
            continue
        relative_path = source_path.relative_to(source_directory)
        target_path = target_directory / relative_path
        target_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source_path, target_path)


def determine_batch_status(item_results: list[BatchItemResult]) -> str:
    """汇总批次状态。"""

    if not item_results:
        return "failed"
    succeeded_count = sum(item.status == "succeeded" for item in item_results)
    if succeeded_count == len(item_results):
        return "succeeded"
    if succeeded_count == 0:
        return "failed"
    return "partial"


def write_batch_manifest(
    *,
    batch_directory: Path,
    request: BatchRequest,
    item_results: list[BatchItemResult],
    batch_status: str,
) -> None:
    """写入批量导出清单。"""

    manifest_payload = {
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "status": batch_status,
        "batch_name": batch_directory.name,
        "run_options": {
            "transcriber": request.transcriber_name,
            "whisper_model": request.whisper_model,
            "screenshot_mode": request.screenshot_mode,
            "screenshot_count": request.screenshot_count,
            "summary_style": request.summary_style,
            "openai_compatible_enabled": request.openai_compatible.enabled,
        },
        "items": [
            {
                "url": item.url,
                "title": item.title,
                "status": item.status,
                "error": item.error,
                "summary_source": item.summary_source,
                "summary_path": _relative_or_empty(batch_directory, item.summary_path),
                "assets_directory": _relative_or_empty(batch_directory, item.assets_directory),
                "record_directory": _relative_or_empty(batch_directory, item.record_directory),
            }
            for item in item_results
        ],
    }
    (batch_directory / "batch_manifest.json").write_text(
        json.dumps(manifest_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def _relative_or_empty(batch_directory: Path, target_path: Path | None) -> str:
    if target_path is None:
        return ""
    return relative_to_output(batch_directory, target_path)


def _normalize_single_run_result(single_run_result: Path | SingleRunResult) -> SingleRunResult:
    if isinstance(single_run_result, SingleRunResult):
        return single_run_result
    return SingleRunResult(record_directory=single_run_result)

from __future__ import annotations

import shutil
import json
from dataclasses import replace
from datetime import datetime
from pathlib import Path
from typing import Callable

from video_summary_cli.openai_compatible import OpenAICompatibleSummarizer
from video_summary_cli.paths import build_document_assets_directory
from video_summary_cli.paths import build_output_directory
from video_summary_cli.paths import build_summary_markdown_filename
from video_summary_cli.pipeline import VideoSummaryPipeline
from video_summary_cli.runtime_factory import build_fetcher, build_screenshot_sampler, build_transcriber
from video_summary_cli.storage import save_summary_artifacts
from video_summary_cli.web_models import BatchItemResult, BatchRunRequest, BatchRunResult


ProgressCallback = Callable[[int, BatchItemResult], None]


def run_batch(
    request: BatchRunRequest,
    fetcher=None,
    transcriber=None,
    screenshot_sampler=None,
    summarizer=None,
    progress_callback: ProgressCallback | None = None,
) -> BatchRunResult:
    """执行共享输出目录下的批量视频总结。"""

    batch_output_dir = Path(request.settings.output_dir).expanduser()
    batch_output_dir.mkdir(parents=True, exist_ok=True)
    active_fetcher = fetcher or build_fetcher(
        Path(request.settings.cookies_path) if request.settings.cookies_path else None
    )
    active_transcriber = (
        transcriber
        if transcriber is not None
        else build_transcriber(request.settings.transcriber, request.settings.whisper_model)
    )
    active_sampler = (
        screenshot_sampler
        if screenshot_sampler is not None
        else build_screenshot_sampler(request.settings.screenshot_mode, request.settings.screenshot_count)
    )
    active_summarizer = summarizer or OpenAICompatibleSummarizer(request.settings.openai)
    pipeline = VideoSummaryPipeline(
        fetcher=active_fetcher,
        transcriber=active_transcriber,
        summarizer=active_summarizer,
        screenshot_sampler=active_sampler,
        summary_style=request.settings.summary_style,
    )

    items: list[BatchItemResult] = []
    used_titles: set[str] = set()
    run_options = _build_run_options(request)

    for item_index, url in enumerate(request.urls):
        metadata = _ensure_unique_title(active_fetcher.extract_metadata(url), used_titles)
        running_item = BatchItemResult(url=url, title=metadata.title, status="running")
        _notify_progress(progress_callback, item_index, running_item)
        record_output_root = batch_output_dir / ".runs"
        record_working_directory = build_output_directory(
            record_output_root,
            metadata.title,
            metadata.video_id,
        )
        record_working_directory.mkdir(parents=True, exist_ok=True)

        try:
            document = pipeline.run_with_metadata(metadata, record_working_directory)
            artifacts_directory = save_summary_artifacts(
                document=document,
                output_root=record_output_root,
                run_options=run_options,
            )
            summary_filename = build_summary_markdown_filename(document.metadata.title)
            summary_path = batch_output_dir / summary_filename
            shutil.copy2(artifacts_directory / summary_filename, summary_path)
            source_assets_directory = artifacts_directory / build_document_assets_directory(document.metadata.title)
            target_assets_directory = batch_output_dir / build_document_assets_directory(document.metadata.title)
            if source_assets_directory.exists():
                target_assets_directory.parent.mkdir(parents=True, exist_ok=True)
                shutil.copytree(source_assets_directory, target_assets_directory, dirs_exist_ok=True)
            result_item = BatchItemResult(
                url=url,
                title=document.metadata.title,
                status="completed",
                summary_markdown_path=str(summary_path),
                artifacts_directory=str(artifacts_directory),
            )
        except Exception as exc:
            result_item = BatchItemResult(
                url=url,
                title=metadata.title,
                status="failed",
                error_message=str(exc),
            )

        items.append(result_item)
        _notify_progress(progress_callback, item_index, result_item)

    completed_count = sum(1 for item in items if item.status == "completed")
    failed_count = sum(1 for item in items if item.status == "failed")
    batch_manifest_path = batch_output_dir / "batch_manifest.json"
    batch_manifest_path.write_text(
        json.dumps(
            {
                "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
                "output_dir": str(batch_output_dir),
                "completed_count": completed_count,
                "failed_count": failed_count,
                "settings": request.settings.to_dict(include_api_key=False),
                "items": [item.to_dict() for item in items],
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    return BatchRunResult(
        output_dir=str(batch_output_dir),
        completed_count=completed_count,
        failed_count=failed_count,
        items=items,
        batch_manifest_path=str(batch_manifest_path),
    )


def _notify_progress(
    progress_callback: ProgressCallback | None,
    index: int,
    item: BatchItemResult,
) -> None:
    if progress_callback is None:
        return
    progress_callback(index, item)


def _ensure_unique_title(metadata, used_titles: set[str]):
    if metadata.title not in used_titles:
        used_titles.add(metadata.title)
        return metadata

    candidate_title = f"{metadata.title}（{metadata.video_id}）"
    suffix_index = 2
    while candidate_title in used_titles:
        candidate_title = f"{metadata.title}（{metadata.video_id}-{suffix_index}）"
        suffix_index += 1
    used_titles.add(candidate_title)
    return replace(metadata, title=candidate_title)


def _build_run_options(request: BatchRunRequest) -> dict[str, object]:
    return {
        "transcriber": request.settings.transcriber,
        "whisper_model": request.settings.whisper_model,
        "screenshot_mode": request.settings.screenshot_mode,
        "screenshot_count": request.settings.screenshot_count,
        "summary_style": request.settings.summary_style,
        "summary_backend": "openai-compatible" if request.settings.openai.enabled else "local-extractive",
        "summary_model": request.settings.openai.model if request.settings.openai.enabled else "extractive",
    }

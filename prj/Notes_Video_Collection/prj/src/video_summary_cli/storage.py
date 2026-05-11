from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any

from video_summary_cli.artifact_writer import build_artifact_payloads, write_root_artifacts
from video_summary_cli.models import SummaryDocument
from video_summary_cli.paths import build_output_directory, slugify_text
from video_summary_cli.version_store import update_version_manifest, write_version_snapshot


def save_summary_artifacts(
    document: SummaryDocument,
    output_root: Path,
    run_options: dict[str, Any] | None = None,
    generated_at: datetime | None = None,
) -> Path:
    """把元数据、全文转写和 Markdown 写入磁盘。"""

    output_directory = build_output_directory(output_root, document.metadata.title, document.metadata.video_id)
    output_directory.mkdir(parents=True, exist_ok=True)
    (output_directory / "img").mkdir(exist_ok=True)
    (output_directory / "versions").mkdir(exist_ok=True)

    normalized_run_options = _normalize_run_options(run_options)
    payloads = build_artifact_payloads(
        document=document,
        summary_style=normalized_run_options.get("summary_style", "default"),
    )
    write_root_artifacts(output_directory, payloads, title=document.metadata.title)
    version_record = write_version_snapshot(
        document=document,
        output_directory=output_directory,
        payloads=payloads,
        run_options=normalized_run_options,
        generated_at=generated_at,
    )
    update_version_manifest(
        versions_root=output_directory / "versions",
        metadata=document.metadata,
        version_record=version_record,
    )
    return output_directory


def _normalize_run_options(run_options: dict[str, Any] | None) -> dict[str, Any]:
    normalized = {
        "transcriber": "auto",
        "whisper_model": "tiny",
        "screenshot_mode": "none",
        "screenshot_count": 0,
        "summary_style": "default",
    }
    if run_options:
        normalized.update(run_options)
    return normalized

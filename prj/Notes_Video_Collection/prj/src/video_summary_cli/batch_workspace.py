from __future__ import annotations

import re
import shutil
from dataclasses import dataclass
from pathlib import Path

from video_summary_cli.paths import (
    build_document_assets_directory,
    build_document_basename,
    build_summary_markdown_filename,
)


URL_PATTERN = re.compile(r"https?://[^\s]+", flags=re.IGNORECASE)


@dataclass(slots=True)
class PublishedBatchArtifacts:
    """批次根目录下对用户可见的产物路径。"""

    summary_path: Path
    assets_directory: Path


def parse_batch_urls(urls_text: str) -> list[str]:
    """从多行文本中提取 URL，并保持顺序去重。"""

    seen_urls: set[str] = set()
    ordered_urls: list[str] = []
    for matched_url in URL_PATTERN.findall(urls_text or ""):
        normalized_url = matched_url.strip()
        if normalized_url in seen_urls:
            continue
        seen_urls.add(normalized_url)
        ordered_urls.append(normalized_url)
    return ordered_urls


def build_batch_directory(output_root: Path, batch_name: str | None = None) -> Path:
    """为一次批处理构建批次目录。"""

    normalized_name = build_document_basename(batch_name or "").strip()
    if not normalized_name or normalized_name == "视频总结":
        normalized_name = "视频总结批次"
    return output_root / normalized_name


def publish_batch_artifacts(
    source_output_dir: Path,
    batch_directory: Path,
    title: str,
) -> PublishedBatchArtifacts:
    """把单视频结果发布到批次根目录。"""

    batch_directory.mkdir(parents=True, exist_ok=True)
    summary_filename = build_summary_markdown_filename(title)
    source_summary_path = source_output_dir / summary_filename
    target_summary_path = batch_directory / summary_filename
    target_summary_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source_summary_path, target_summary_path)

    assets_directory = build_document_assets_directory(title)
    source_assets_directory = source_output_dir / assets_directory
    target_assets_directory = batch_directory / assets_directory
    if source_assets_directory.exists():
        target_assets_directory.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(source_assets_directory, target_assets_directory, dirs_exist_ok=True)
    else:
        target_assets_directory.mkdir(parents=True, exist_ok=True)

    return PublishedBatchArtifacts(
        summary_path=target_summary_path,
        assets_directory=target_assets_directory,
    )

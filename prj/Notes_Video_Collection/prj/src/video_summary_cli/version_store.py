from __future__ import annotations

import json
import shutil
from datetime import datetime
from pathlib import Path
from typing import Any

from video_summary_cli.artifact_writer import SummaryArtifactPayloads, write_version_artifacts
from video_summary_cli.models import SummaryDocument, VideoMetadata
from video_summary_cli.paths import build_summary_markdown_filename, relative_to_output


def write_version_snapshot(
    document: SummaryDocument,
    output_directory: Path,
    payloads: SummaryArtifactPayloads,
    run_options: dict[str, Any],
    generated_at: datetime | None,
) -> dict[str, Any]:
    """写入版本快照并返回 manifest 记录。"""

    versions_root = output_directory / "versions"
    version_timestamp = normalize_generated_at(generated_at)
    version_id = allocate_version_id(versions_root, version_timestamp.strftime("%Y%m%d-%H%M%S"))
    version_directory = versions_root / version_id
    version_directory.mkdir(parents=True, exist_ok=False)

    summary_filename = build_summary_markdown_filename(document.metadata.title)
    write_version_artifacts(version_directory, payloads, title=document.metadata.title)
    screenshot_paths = copy_screenshots_to_version(document, output_directory, version_directory)
    has_chapters = bool(document.chapters)

    version_record = {
        "version_id": version_id,
        "generated_at": version_timestamp.isoformat(timespec="seconds"),
        "run_options": run_options,
        "summary_quality_mode": "chaptered-tutorial" if has_chapters else "extractive",
        "chapter_count": len(document.chapters),
        "scene_card_count": payloads.quality_report_payload.get("scene_card_count", 0),
        "key_segment_strategy": "per-chapter" if has_chapters else "leading-merged",
        "screenshot_binding": "per-chapter" if has_chapters else "global",
        "duplicate_caption_path_count": payloads.quality_report_payload.get("duplicate_caption_path_count", 0),
        "files": {
            "metadata_json": relative_to_output(output_directory, version_directory / "metadata.json"),
            "transcript_txt": relative_to_output(output_directory, version_directory / "transcript.txt"),
            "summary_md": relative_to_output(output_directory, version_directory / summary_filename),
            "chapters_json": relative_to_output(output_directory, version_directory / "chapters.json"),
            "screenshot_caption_blocks_json": relative_to_output(
                output_directory,
                version_directory / "screenshot_caption_blocks.json",
            ),
            "scene_cards_json": relative_to_output(output_directory, version_directory / "scene_cards.json"),
            "quality_report_json": relative_to_output(output_directory, version_directory / "quality_report.json"),
            "screenshots": screenshot_paths,
        },
    }
    (version_directory / "version.json").write_text(
        json.dumps(version_record, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return version_record


def copy_screenshots_to_version(
    document: SummaryDocument,
    output_directory: Path,
    version_directory: Path,
) -> list[str]:
    """把当前运行引用的截图复制到版本目录。"""

    copied_paths: list[str] = []
    for screenshot in document.screenshots:
        source_path = output_directory / Path(screenshot.relative_path)
        if not source_path.exists():
            continue
        target_path = version_directory / Path(screenshot.relative_path)
        target_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source_path, target_path)
        copied_paths.append(relative_to_output(output_directory, target_path))
    return copied_paths


def update_version_manifest(
    versions_root: Path,
    metadata: VideoMetadata,
    version_record: dict[str, Any],
) -> None:
    """更新版本清单并维护最新版本索引。"""

    manifest_path = versions_root / "manifest.json"
    if manifest_path.exists():
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    else:
        manifest = {
            "video_id": metadata.video_id,
            "title": metadata.title,
            "versions": [],
        }

    manifest["video_id"] = metadata.video_id
    manifest["title"] = metadata.title
    manifest["versions"] = sort_manifest_versions([version_record, *manifest.get("versions", [])])
    latest_version_record = manifest["versions"][0]
    manifest["latest_version"] = latest_version_record["version_id"]
    manifest["latest_generated_at"] = latest_version_record["generated_at"]
    manifest["latest_run_options"] = latest_version_record.get("run_options", {})
    manifest["summary_quality_mode"] = latest_version_record.get("summary_quality_mode")
    manifest["chapter_count"] = latest_version_record.get("chapter_count")
    manifest["scene_card_count"] = latest_version_record.get("scene_card_count")
    manifest["key_segment_strategy"] = latest_version_record.get("key_segment_strategy")
    manifest["screenshot_binding"] = latest_version_record.get("screenshot_binding")
    manifest["duplicate_caption_path_count"] = latest_version_record.get("duplicate_caption_path_count")
    manifest["latest_screenshot_count"] = len(
        latest_version_record.get("files", {}).get("screenshots", [])
    )
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def sort_manifest_versions(versions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """去重并按真实版本时间倒序排列。"""

    deduplicated_versions: dict[str, dict[str, Any]] = {}
    for version in versions:
        version_id = version.get("version_id")
        if not version_id:
            continue
        deduplicated_versions[version_id] = version
    return sorted(
        deduplicated_versions.values(),
        key=manifest_version_sort_key,
        reverse=True,
    )


def manifest_version_sort_key(version_record: dict[str, Any]) -> tuple[str, int]:
    """为 manifest 排序生成稳定键。"""

    version_id = str(version_record.get("version_id", ""))
    parts = version_id.split("-")
    if len(parts) >= 2:
        base_version_id = "-".join(parts[:2])
        suffix = parse_version_suffix(parts[2]) if len(parts) >= 3 else 1
        return (base_version_id, suffix)
    return (version_id, 0)


def parse_version_suffix(raw_suffix: str) -> int:
    """把版本后缀转换为排序用整数。"""

    return int(raw_suffix) if raw_suffix.isdigit() else 1


def normalize_generated_at(generated_at: datetime | None) -> datetime:
    """统一生成时间的时区信息。"""

    if generated_at is None:
        return datetime.now().astimezone()
    if generated_at.tzinfo is None:
        return generated_at.replace(tzinfo=datetime.now().astimezone().tzinfo)
    return generated_at


def allocate_version_id(versions_root: Path, base_version_id: str) -> str:
    """为相同秒级时间戳分配唯一版本号。"""

    candidate = base_version_id
    suffix = 2
    while (versions_root / candidate).exists():
        candidate = f"{base_version_id}-{suffix:02d}"
        suffix += 1
    return candidate

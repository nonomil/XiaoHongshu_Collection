from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

from video_summary_cli.markdown_renderer import render_summary_markdown
from video_summary_cli.models import SummaryDocument
from video_summary_cli.paths import build_summary_markdown_filename
from video_summary_cli.quality_report_builder import build_quality_report
from video_summary_cli.scene_card_builder import build_scene_cards
from video_summary_cli.transcript import transcript_to_text


@dataclass(slots=True)
class SummaryArtifactPayloads:
    """根目录与版本快照共用的文本产物。"""

    metadata_payload: dict[str, Any]
    transcript_text: str
    summary_markdown: str
    chapters_payload: list[dict[str, Any]]
    screenshot_caption_blocks_payload: list[dict[str, Any]]
    scene_cards_payload: list[dict[str, Any]]
    quality_report_payload: dict[str, Any]


def build_artifact_payloads(
    document: SummaryDocument,
    summary_style: str = "default",
) -> SummaryArtifactPayloads:
    """构建写盘前的文本与 JSON 载荷。"""

    metadata_payload = asdict(document.metadata)
    metadata_payload["platform"] = document.metadata.platform.value
    transcript_text = transcript_to_text(document.transcript_segments)
    summary_markdown = render_summary_markdown(document, summary_style=summary_style)
    chapters_payload = [asdict(chapter) for chapter in document.chapters]
    screenshot_caption_blocks_payload = [
        asdict(screenshot_caption_block)
        for screenshot_caption_block in document.screenshot_caption_blocks
    ]
    scene_cards = document.scene_cards or build_scene_cards(document.screenshot_caption_blocks)
    quality_report = document.quality_report or build_quality_report(
        document=document,
        scene_cards=scene_cards,
        summary_markdown=summary_markdown,
    )
    return SummaryArtifactPayloads(
        metadata_payload=metadata_payload,
        transcript_text=transcript_text,
        summary_markdown=summary_markdown,
        chapters_payload=chapters_payload,
        screenshot_caption_blocks_payload=screenshot_caption_blocks_payload,
        scene_cards_payload=[asdict(scene_card) for scene_card in scene_cards],
        quality_report_payload=asdict(quality_report),
    )


def write_root_artifacts(output_directory: Path, payloads: SummaryArtifactPayloads, title: str) -> None:
    """写入根目录下的主产物。"""

    (output_directory / "metadata.json").write_text(
        json.dumps(payloads.metadata_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (output_directory / "transcript.txt").write_text(payloads.transcript_text, encoding="utf-8")
    (output_directory / build_summary_markdown_filename(title)).write_text(
        payloads.summary_markdown,
        encoding="utf-8",
    )
    (output_directory / "scene_cards.json").write_text(
        json.dumps(payloads.scene_cards_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (output_directory / "quality_report.json").write_text(
        json.dumps(payloads.quality_report_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def write_version_artifacts(version_directory: Path, payloads: SummaryArtifactPayloads, title: str) -> None:
    """写入单个版本快照的文本产物。"""

    (version_directory / "metadata.json").write_text(
        json.dumps(payloads.metadata_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (version_directory / "transcript.txt").write_text(payloads.transcript_text, encoding="utf-8")
    (version_directory / build_summary_markdown_filename(title)).write_text(
        payloads.summary_markdown,
        encoding="utf-8",
    )
    (version_directory / "chapters.json").write_text(
        json.dumps(payloads.chapters_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (version_directory / "screenshot_caption_blocks.json").write_text(
        json.dumps(payloads.screenshot_caption_blocks_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (version_directory / "scene_cards.json").write_text(
        json.dumps(payloads.scene_cards_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (version_directory / "quality_report.json").write_text(
        json.dumps(payloads.quality_report_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

from __future__ import annotations

import re
from collections import Counter

from video_summary_cli.models import SceneCard, SummaryDocument, SummaryQualityReport

IMAGE_REF_PATTERN = re.compile(r"!\[[^\]]*\]\(([^)]+)\)")


def build_quality_report(
    document: SummaryDocument,
    scene_cards: list[SceneCard],
    summary_markdown: str,
) -> SummaryQualityReport:
    """基于当前文档和渲染结果生成质量指标。"""

    caption_paths = [block.screenshot_relative_path for block in document.screenshot_caption_blocks]
    duplicate_caption_paths = [
        path
        for path, count in Counter(caption_paths).items()
        if count > 1
    ]
    rendered_destinations = [
        match.strip("<>")
        for match in IMAGE_REF_PATTERN.findall(summary_markdown)
    ]
    narration_line_counts = [len(scene_card.narration_lines) for scene_card in scene_cards]
    if narration_line_counts:
        average_narration_lines = round(sum(narration_line_counts) / len(narration_line_counts), 2)
        min_narration_lines = min(narration_line_counts)
        max_narration_lines = max(narration_line_counts)
    else:
        average_narration_lines = 0.0
        min_narration_lines = 0
        max_narration_lines = 0

    warnings: list[str] = []
    if duplicate_caption_paths:
        warnings.append("duplicate-caption-paths")
    if scene_cards and average_narration_lines < 5.0:
        warnings.append("scene-narration-too-short")
    if len(set(rendered_destinations)) != len(scene_cards):
        warnings.append("scene-card-markdown-mismatch")
    if not rendered_destinations and document.screenshots:
        warnings.append("markdown-missing-images")

    return SummaryQualityReport(
        raw_screenshot_count=len(document.screenshots),
        raw_caption_block_count=len(document.screenshot_caption_blocks),
        unique_caption_path_count=len(set(caption_paths)),
        scene_card_count=len(scene_cards),
        rendered_markdown_image_count=len(rendered_destinations),
        rendered_unique_image_count=len(set(rendered_destinations)),
        average_narration_lines_per_scene=average_narration_lines,
        min_narration_lines_per_scene=min_narration_lines,
        max_narration_lines_per_scene=max_narration_lines,
        duplicate_caption_path_count=len(duplicate_caption_paths),
        duplicate_caption_paths=duplicate_caption_paths,
        warnings=warnings,
    )

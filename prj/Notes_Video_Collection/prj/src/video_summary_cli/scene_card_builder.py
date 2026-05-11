from __future__ import annotations

from typing import Callable

from video_summary_cli.models import SceneCard, ScreenshotCaptionBlock

SCENE_CARD_MERGE_GAP_SECONDS = 4.0


def build_scene_cards(
    caption_blocks: list[ScreenshotCaptionBlock],
    title_resolver: Callable[[ScreenshotCaptionBlock], str] | None = None,
) -> list[SceneCard]:
    """把原始截图字幕块折叠成更稳定的场景卡片。"""

    if not caption_blocks:
        return []

    resolve_title = title_resolver or _default_scene_title
    scene_cards: list[SceneCard] = []
    for caption_block in sorted(caption_blocks, key=lambda item: item.screenshot_timestamp_seconds):
        resolved_title = resolve_title(caption_block).strip() or caption_block.screenshot_alt_text
        if not scene_cards:
            scene_cards.append(_build_scene_card(caption_block, resolved_title))
            continue

        previous_card = scene_cards[-1]
        if not _should_merge_scene_card(previous_card, caption_block, resolved_title):
            scene_cards.append(_build_scene_card(caption_block, resolved_title))
            continue

        previous_score = _score_scene_card(previous_card)
        current_score = _score_caption_block(caption_block)
        previous_card.window_start_seconds = min(previous_card.window_start_seconds, caption_block.window_start_seconds)
        previous_card.window_end_seconds = max(previous_card.window_end_seconds, caption_block.window_end_seconds)
        for narration_line in caption_block.narration_lines:
            if narration_line not in previous_card.narration_lines:
                previous_card.narration_lines.append(narration_line)
        if caption_block.screenshot_relative_path not in previous_card.source_screenshot_paths:
            previous_card.source_screenshot_paths.append(caption_block.screenshot_relative_path)
        if current_score >= previous_score:
            previous_card.title = resolved_title
            previous_card.screenshot_relative_path = caption_block.screenshot_relative_path
            previous_card.screenshot_alt_text = caption_block.screenshot_alt_text
            previous_card.screenshot_timestamp_seconds = caption_block.screenshot_timestamp_seconds
            previous_card.ocr_text = caption_block.ocr_text or previous_card.ocr_text

    return scene_cards


def _build_scene_card(caption_block: ScreenshotCaptionBlock, title: str) -> SceneCard:
    return SceneCard(
        title=title,
        chapter_title=caption_block.chapter_title,
        screenshot_relative_path=caption_block.screenshot_relative_path,
        screenshot_alt_text=caption_block.screenshot_alt_text,
        screenshot_timestamp_seconds=caption_block.screenshot_timestamp_seconds,
        window_start_seconds=caption_block.window_start_seconds,
        window_end_seconds=caption_block.window_end_seconds,
        narration_lines=list(caption_block.narration_lines),
        ocr_text=caption_block.ocr_text,
        source_screenshot_paths=[caption_block.screenshot_relative_path],
    )


def _should_merge_scene_card(
    scene_card: SceneCard,
    caption_block: ScreenshotCaptionBlock,
    resolved_title: str,
) -> bool:
    if scene_card.chapter_title != caption_block.chapter_title:
        return False
    if scene_card.screenshot_relative_path == caption_block.screenshot_relative_path:
        return True
    if resolved_title != scene_card.title:
        return False
    return (
        caption_block.screenshot_timestamp_seconds - scene_card.screenshot_timestamp_seconds
        <= SCENE_CARD_MERGE_GAP_SECONDS
    )


def _default_scene_title(caption_block: ScreenshotCaptionBlock) -> str:
    return caption_block.screenshot_alt_text or caption_block.chapter_title or "场景卡片"


def _score_scene_card(scene_card: SceneCard) -> tuple[int, int]:
    return (len(scene_card.narration_lines), len(scene_card.ocr_text.strip()))


def _score_caption_block(caption_block: ScreenshotCaptionBlock) -> tuple[int, int]:
    return (len(caption_block.narration_lines), len(caption_block.ocr_text.strip()))

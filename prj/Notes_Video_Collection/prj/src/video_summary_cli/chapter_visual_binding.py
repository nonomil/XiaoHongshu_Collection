from __future__ import annotations

from dataclasses import replace

from video_summary_cli.models import ScreenshotAsset, SummaryChapter


def bind_screenshots_to_chapters(
    chapters: list[SummaryChapter],
    screenshots: list[ScreenshotAsset],
) -> list[SummaryChapter]:
    """把截图按时间归属到章节，每章保留一张代表性画面。"""

    if not chapters:
        return []

    bound_chapters = [replace(chapter, screenshot_paths=[]) for chapter in chapters]
    remaining_screenshots = sorted(screenshots, key=lambda item: item.timestamp_seconds)

    for index, chapter in enumerate(bound_chapters):
        chapter_candidates = [
            screenshot
            for screenshot in remaining_screenshots
            if chapter.anchor_start_seconds <= screenshot.timestamp_seconds <= chapter.anchor_end_seconds
        ]
        if not chapter_candidates:
            continue

        selected_screenshot = max(
            chapter_candidates,
            key=lambda item: _score_screenshot_for_chapter(chapter, item),
        )
        bound_chapters[index] = replace(chapter, screenshot_paths=[selected_screenshot.relative_path])
        remaining_screenshots.remove(selected_screenshot)

    return bound_chapters


def _score_screenshot_for_chapter(chapter: SummaryChapter, screenshot: ScreenshotAsset) -> float:
    chapter_midpoint = (chapter.anchor_start_seconds + chapter.anchor_end_seconds) / 2
    chapter_span = max(chapter.anchor_end_seconds - chapter.anchor_start_seconds, 1.0)
    time_distance = abs(screenshot.timestamp_seconds - chapter_midpoint)
    time_score = max(0.0, 1.0 - (time_distance / (chapter_span / 2)))
    content_score = max(screenshot.content_score, screenshot.information_density_score)
    blur_score = _normalize_blur_score(screenshot.blur_score)

    if screenshot.ocr_text:
        return (
            time_score * 0.36
            + content_score * 0.24
            + screenshot.visual_difference_score * 0.14
            + screenshot.text_difference_score * 0.14
            + blur_score * 0.12
        )
    return (
        time_score * 0.42
        + content_score * 0.30
        + screenshot.visual_difference_score * 0.16
        + blur_score * 0.12
    )


def _normalize_blur_score(blur_score: float) -> float:
    if blur_score <= 0:
        return 0.0
    return blur_score / (blur_score + 800.0)

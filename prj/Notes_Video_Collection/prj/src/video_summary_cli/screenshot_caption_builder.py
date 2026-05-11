from __future__ import annotations

from video_summary_cli.models import ScreenshotAsset, ScreenshotCaptionBlock, SummaryChapter, TranscriptSegment
from video_summary_cli.transcript import clean_segment_text

DEFAULT_MAX_NARRATION_LINES: int | None = None
MIN_NARRATION_LINES = 3
MIN_NARRATION_CHARACTERS = 18
MAX_EXPANSION_DISTANCE_SECONDS = 6.0
LOW_SIGNAL_NARRATION_LINES = {
    "这样",
    "这样呢",
    "一个",
    "这个NotebookLM呢",
    "你新来的文字",
    "然后并且能够帮助我们",
    "第二点我是觉得说",
    "然后第二点我是觉得说",
    "你会发现他的回答会更为的",
}


def build_screenshot_caption_blocks(
    transcript_segments: list[TranscriptSegment],
    screenshots: list[ScreenshotAsset],
    chapters: list[SummaryChapter],
    max_lines_per_block: int | None = None,
) -> list[ScreenshotCaptionBlock]:
    """为每张截图绑定一个局部字幕时间窗与讲解行。"""

    if not screenshots or not transcript_segments:
        return []

    ordered_screenshots = _deduplicate_screenshots(
        sorted(screenshots, key=lambda item: item.timestamp_seconds)
    )
    blocks: list[ScreenshotCaptionBlock] = []

    for chapter, chapter_screenshots in _group_screenshots_by_chapter(ordered_screenshots, chapters):
        for index, screenshot in enumerate(chapter_screenshots):
            window_start_seconds, window_end_seconds = _build_caption_window(
                chapter=chapter,
                chapter_screenshots=chapter_screenshots,
                screenshot_index=index,
            )
            narration_lines, resolved_start_seconds, resolved_end_seconds = _select_narration_lines(
                transcript_segments=transcript_segments,
                window_start_seconds=window_start_seconds,
                window_end_seconds=window_end_seconds,
                fallback_timestamp_seconds=screenshot.timestamp_seconds,
                max_lines=max_lines_per_block,
                chapter=chapter,
            )
            blocks.append(
                ScreenshotCaptionBlock(
                    screenshot_relative_path=screenshot.relative_path,
                    screenshot_alt_text=screenshot.alt_text,
                    screenshot_timestamp_seconds=screenshot.timestamp_seconds,
                    chapter_title=chapter.title if chapter is not None else "",
                    window_start_seconds=resolved_start_seconds,
                    window_end_seconds=resolved_end_seconds,
                    narration_lines=narration_lines,
                    ocr_text=screenshot.ocr_text,
                )
            )

    return _merge_duplicate_caption_blocks(blocks)


def _group_screenshots_by_chapter(
    screenshots: list[ScreenshotAsset],
    chapters: list[SummaryChapter],
) -> list[tuple[SummaryChapter | None, list[ScreenshotAsset]]]:
    if not chapters:
        return [(None, screenshots)]

    grouped: list[tuple[SummaryChapter | None, list[ScreenshotAsset]]] = []
    assigned_paths: set[str] = set()

    for chapter in chapters:
        chapter_screenshots = [
            screenshot
            for screenshot in screenshots
            if chapter.anchor_start_seconds <= screenshot.timestamp_seconds <= chapter.anchor_end_seconds
        ]
        if chapter_screenshots:
            chapter_screenshots.sort(key=lambda item: item.timestamp_seconds)
            grouped.append((chapter, chapter_screenshots))
            assigned_paths.update(screenshot.relative_path for screenshot in chapter_screenshots)

    orphan_screenshots = [screenshot for screenshot in screenshots if screenshot.relative_path not in assigned_paths]
    if orphan_screenshots:
        grouped.append((None, orphan_screenshots))

    return grouped


def _deduplicate_screenshots(screenshots: list[ScreenshotAsset]) -> list[ScreenshotAsset]:
    deduplicated_screenshots: list[ScreenshotAsset] = []
    seen_paths: set[str] = set()
    for screenshot in screenshots:
        if screenshot.relative_path in seen_paths:
            continue
        deduplicated_screenshots.append(screenshot)
        seen_paths.add(screenshot.relative_path)
    return deduplicated_screenshots


def _build_caption_window(
    chapter: SummaryChapter | None,
    chapter_screenshots: list[ScreenshotAsset],
    screenshot_index: int,
) -> tuple[float, float]:
    screenshot = chapter_screenshots[screenshot_index]
    previous_screenshot = chapter_screenshots[screenshot_index - 1] if screenshot_index > 0 else None
    next_screenshot = (
        chapter_screenshots[screenshot_index + 1]
        if screenshot_index < len(chapter_screenshots) - 1
        else None
    )

    if previous_screenshot is not None:
        window_start_seconds = (previous_screenshot.timestamp_seconds + screenshot.timestamp_seconds) / 2
    elif chapter is not None:
        # 章节首图需要承接章节开头的讲解，避免只截到截图附近的几秒字幕。
        window_start_seconds = chapter.anchor_start_seconds
    elif next_screenshot is not None:
        gap = next_screenshot.timestamp_seconds - screenshot.timestamp_seconds
        window_start_seconds = screenshot.timestamp_seconds - gap / 2
    else:
        window_start_seconds = screenshot.timestamp_seconds - 8.0

    if next_screenshot is not None:
        window_end_seconds = (screenshot.timestamp_seconds + next_screenshot.timestamp_seconds) / 2
    elif chapter is not None:
        # 章节尾图需要覆盖章节收尾内容，避免出现“最后一句没说完就结束”的情况。
        window_end_seconds = chapter.anchor_end_seconds
    elif previous_screenshot is not None:
        gap = screenshot.timestamp_seconds - previous_screenshot.timestamp_seconds
        window_end_seconds = screenshot.timestamp_seconds + gap / 2
    else:
        window_end_seconds = screenshot.timestamp_seconds + 8.0

    if chapter is not None:
        window_start_seconds = max(window_start_seconds, chapter.anchor_start_seconds)
        window_end_seconds = min(window_end_seconds, chapter.anchor_end_seconds)

    if window_end_seconds <= window_start_seconds:
        window_start_seconds = max(0.0, screenshot.timestamp_seconds - 4.0)
        window_end_seconds = screenshot.timestamp_seconds + 4.0

    return round(window_start_seconds, 2), round(window_end_seconds, 2)


def _select_narration_lines(
    transcript_segments: list[TranscriptSegment],
    window_start_seconds: float,
    window_end_seconds: float,
    fallback_timestamp_seconds: float,
    max_lines: int | None,
    chapter: SummaryChapter | None,
) -> tuple[list[str], float, float]:
    ordered_segments = sorted(transcript_segments, key=_segment_midpoint)
    overlapping_indices = [
        index
        for index, segment in enumerate(ordered_segments)
        if segment.end_seconds > window_start_seconds and segment.start_seconds < window_end_seconds
    ]
    had_overlapping_segments = bool(overlapping_indices)
    if not overlapping_indices:
        overlapping_indices = [
            min(
                range(len(ordered_segments)),
                key=lambda index: abs(_segment_midpoint(ordered_segments[index]) - fallback_timestamp_seconds),
            )
        ]

    target_max_lines = _resolve_target_max_lines(max_lines)
    initial_segments = [ordered_segments[index] for index in overlapping_indices]
    initial_lines = _materialize_narration_lines(selected_segments=initial_segments, max_lines=None)
    has_low_signal_overlap = any(_is_low_signal_narration_line(segment.text) for segment in initial_segments)
    if not initial_segments or not had_overlapping_segments:
        min_required_lines = 1
    elif has_low_signal_overlap:
        min_required_lines = min(3, target_max_lines) if target_max_lines is not None else 3
    elif len(ordered_segments) <= 1 or not initial_lines:
        min_required_lines = 1
    else:
        min_required_lines = min(MIN_NARRATION_LINES, target_max_lines) if target_max_lines is not None else MIN_NARRATION_LINES
    selected_indices = list(overlapping_indices)

    while _needs_more_context(
        ordered_segments=ordered_segments,
        selected_indices=selected_indices,
        min_required_lines=min_required_lines,
    ):
        next_index = _pick_expansion_index(
            ordered_segments=ordered_segments,
            selected_indices=selected_indices,
            fallback_timestamp_seconds=fallback_timestamp_seconds,
            chapter=chapter,
        )
        if next_index is None:
            break
        selected_indices.append(next_index)
        selected_indices.sort()
        if target_max_lines is not None and len(selected_indices) >= target_max_lines + 2:
            break

    selected_segments = [ordered_segments[index] for index in selected_indices]
    narration_lines = _materialize_narration_lines(selected_segments=selected_segments, max_lines=target_max_lines)
    if not selected_segments:
        return narration_lines, round(window_start_seconds, 2), round(window_end_seconds, 2)

    return (
        narration_lines,
        round(min(segment.start_seconds for segment in selected_segments), 2),
        round(max(segment.end_seconds for segment in selected_segments), 2),
    )


def _resolve_target_max_lines(max_lines: int | None) -> int | None:
    if max_lines is None:
        return DEFAULT_MAX_NARRATION_LINES
    return max(1, max_lines)


def _merge_duplicate_caption_blocks(
    caption_blocks: list[ScreenshotCaptionBlock],
) -> list[ScreenshotCaptionBlock]:
    if len(caption_blocks) <= 1:
        return caption_blocks

    merged_blocks_by_path: dict[str, ScreenshotCaptionBlock] = {}
    ordered_paths: list[str] = []
    for caption_block in sorted(
        caption_blocks,
        key=lambda item: (
            item.screenshot_timestamp_seconds,
            item.window_start_seconds,
            item.window_end_seconds,
        ),
    ):
        existing_block = merged_blocks_by_path.get(caption_block.screenshot_relative_path)
        if existing_block is None:
            merged_blocks_by_path[caption_block.screenshot_relative_path] = ScreenshotCaptionBlock(
                screenshot_relative_path=caption_block.screenshot_relative_path,
                screenshot_alt_text=caption_block.screenshot_alt_text,
                screenshot_timestamp_seconds=caption_block.screenshot_timestamp_seconds,
                chapter_title=caption_block.chapter_title,
                window_start_seconds=caption_block.window_start_seconds,
                window_end_seconds=caption_block.window_end_seconds,
                narration_lines=list(caption_block.narration_lines),
                ocr_text=caption_block.ocr_text,
            )
            ordered_paths.append(caption_block.screenshot_relative_path)
            continue

        previous_score = _score_caption_block(existing_block)
        current_score = _score_caption_block(caption_block)
        existing_block.window_start_seconds = min(
            existing_block.window_start_seconds,
            caption_block.window_start_seconds,
        )
        existing_block.window_end_seconds = max(
            existing_block.window_end_seconds,
            caption_block.window_end_seconds,
        )
        if not existing_block.chapter_title and caption_block.chapter_title:
            existing_block.chapter_title = caption_block.chapter_title
        if caption_block.ocr_text and not existing_block.ocr_text:
            existing_block.ocr_text = caption_block.ocr_text
        for narration_line in caption_block.narration_lines:
            if narration_line not in existing_block.narration_lines:
                existing_block.narration_lines.append(narration_line)
        if current_score > previous_score:
            existing_block.screenshot_alt_text = caption_block.screenshot_alt_text
            existing_block.screenshot_timestamp_seconds = caption_block.screenshot_timestamp_seconds
            if caption_block.chapter_title:
                existing_block.chapter_title = caption_block.chapter_title
            if caption_block.ocr_text:
                existing_block.ocr_text = caption_block.ocr_text

    return [merged_blocks_by_path[path] for path in ordered_paths]


def _score_caption_block(caption_block: ScreenshotCaptionBlock) -> tuple[int, int]:
    return (
        len(caption_block.narration_lines),
        len(caption_block.ocr_text.strip()),
    )


def _needs_more_context(
    ordered_segments: list[TranscriptSegment],
    selected_indices: list[int],
    min_required_lines: int,
) -> bool:
    selected_segments = [ordered_segments[index] for index in selected_indices]
    narration_lines = _materialize_narration_lines(selected_segments=selected_segments, max_lines=None)
    if not narration_lines:
        return True
    return (
        len(narration_lines) < min_required_lines
        or sum(len(line) for line in narration_lines) < MIN_NARRATION_CHARACTERS
    )


def _pick_expansion_index(
    ordered_segments: list[TranscriptSegment],
    selected_indices: list[int],
    fallback_timestamp_seconds: float,
    chapter: SummaryChapter | None,
) -> int | None:
    left_index = min(selected_indices) - 1
    right_index = max(selected_indices) + 1
    candidate_indices: list[int] = []
    for candidate_index in (left_index, right_index):
        if candidate_index < 0 or candidate_index >= len(ordered_segments):
            continue
        segment_midpoint = _segment_midpoint(ordered_segments[candidate_index])
        if chapter is not None and not (
            chapter.anchor_start_seconds <= segment_midpoint <= chapter.anchor_end_seconds
        ):
            continue
        if abs(segment_midpoint - fallback_timestamp_seconds) > MAX_EXPANSION_DISTANCE_SECONDS:
            continue
        candidate_indices.append(candidate_index)

    if not candidate_indices:
        return None

    return min(
        candidate_indices,
        key=lambda index: abs(_segment_midpoint(ordered_segments[index]) - fallback_timestamp_seconds),
    )


def _materialize_narration_lines(
    selected_segments: list[TranscriptSegment],
    max_lines: int | None,
) -> list[str]:
    narration_lines: list[str] = []
    for segment in selected_segments:
        line = clean_segment_text(segment.text)
        if line and line not in narration_lines:
            narration_lines.append(line)

    if len(narration_lines) > 1:
        filtered_lines = [
            line
            for line in narration_lines
            if not _is_low_signal_narration_line(line)
        ]
        if filtered_lines:
            narration_lines = filtered_lines

    if max_lines is not None:
        return narration_lines[:max_lines]
    return narration_lines


def _is_low_signal_narration_line(text: str) -> bool:
    normalized_text = clean_segment_text(text).strip("，。！？；;、 ")
    if not normalized_text:
        return True
    if normalized_text in LOW_SIGNAL_NARRATION_LINES:
        return True
    if len(normalized_text) <= 3:
        return True
    if normalized_text.startswith(("这样呢", "然后第二点", "然后并且", "这个NotebookLM呢")):
        return True
    if normalized_text.startswith(("你新来的文字", "你会发现他的回答会更为的")):
        return True
    if normalized_text.endswith(("这个", "这样")) and len(normalized_text) <= 10:
        return True
    return False


def _segment_midpoint(segment: TranscriptSegment) -> float:
    return (segment.start_seconds + segment.end_seconds) / 2

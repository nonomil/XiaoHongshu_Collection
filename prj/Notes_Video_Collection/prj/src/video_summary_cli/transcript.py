from __future__ import annotations

import re

from video_summary_cli.models import TranscriptSegment


def transcript_to_text(segments: list[TranscriptSegment]) -> str:
    """将转写片段合并为可阅读全文。"""

    merged_segments = merge_adjacent_segments(segments)
    return "\n".join(segment.text.strip() for segment in merged_segments if segment.text.strip())


def select_key_segments(segments: list[TranscriptSegment], limit: int = 3) -> list[TranscriptSegment]:
    """挑选用于展示的关键片段。"""

    return merge_adjacent_segments(segments)[:limit]


def merge_adjacent_segments(
    segments: list[TranscriptSegment],
    target_characters: int = 80,
    max_segments: int = 8,
) -> list[TranscriptSegment]:
    """把过短的片段合并成更适合阅读的段落块。"""

    merged_segments: list[TranscriptSegment] = []
    buffer: list[TranscriptSegment] = []
    buffer_length = 0

    for segment in segments:
        cleaned_text = clean_segment_text(segment.text)
        if not cleaned_text:
            continue

        cloned_segment = TranscriptSegment(
            start_seconds=segment.start_seconds,
            end_seconds=segment.end_seconds,
            text=cleaned_text,
        )
        buffer.append(cloned_segment)
        buffer_length += len(cleaned_text)

        if buffer_length >= target_characters or len(buffer) >= max_segments or _looks_complete_sentence(cleaned_text):
            merged_segments.append(_combine_segments(buffer))
            buffer = []
            buffer_length = 0

    if buffer:
        merged_segments.append(_combine_segments(buffer))

    return merged_segments


def _combine_segments(segments: list[TranscriptSegment]) -> TranscriptSegment:
    text = " ".join(segment.text.strip() for segment in segments if segment.text.strip())
    return TranscriptSegment(
        start_seconds=segments[0].start_seconds,
        end_seconds=segments[-1].end_seconds,
        text=text,
    )


def _looks_complete_sentence(text: str) -> bool:
    return text.endswith(("。", "！", "？", ".", "!", "?"))


def clean_segment_text(text: str) -> str:
    """清理字幕中的口语填充词和多余空白。"""

    cleaned_text = text.strip()
    cleaned_text = re.sub(r"^(?:呃|嗯|额|啊)+", "", cleaned_text)
    cleaned_text = re.sub(r"(?:呃|嗯|额)(?=[\u4e00-\u9fffA-Za-z0-9])", "", cleaned_text)
    cleaned_text = re.sub(r"(?<=[\u4e00-\u9fffA-Za-z0-9])(?:呃|嗯|额)(?=\s)", "", cleaned_text)
    cleaned_text = re.sub(r"(?<=[\u4e00-\u9fffA-Za-z0-9])(?:呃|嗯|额|啊)+$", "", cleaned_text)
    cleaned_text = re.sub(r"\s+", " ", cleaned_text).strip()
    return cleaned_text

from __future__ import annotations

import json
from typing import Iterable

from video_summary_cli.models import TranscriptSegment


def parse_subtitle_content(content: str, extension: str) -> list[TranscriptSegment]:
    """按字幕扩展名选择解析器。"""

    normalized_extension = extension.lower().lstrip(".")
    if normalized_extension in {"vtt", "srt"}:
        return _parse_text_timeline(content)
    if normalized_extension == "json3":
        return _parse_youtube_json3(content)
    if normalized_extension == "json":
        return _parse_bilibili_json(content)
    raise ValueError(f"暂不支持的字幕格式: {extension}")


def _parse_text_timeline(content: str) -> list[TranscriptSegment]:
    segments: list[TranscriptSegment] = []
    blocks = [block.strip() for block in content.replace("\r\n", "\n").split("\n\n")]
    for block in blocks:
        lines = [line.strip() for line in block.splitlines() if line.strip()]
        if not lines or lines[0] == "WEBVTT":
            continue
        if "-->" not in "\n".join(lines):
            continue

        if "-->" in lines[0]:
            time_line = lines[0]
            text_lines = lines[1:]
        else:
            time_line = lines[1]
            text_lines = lines[2:]

        start_text, end_text = [part.strip() for part in time_line.split("-->", maxsplit=1)]
        cleaned_text = " ".join(text_lines).strip()
        if not cleaned_text:
            continue
        segments.append(
            TranscriptSegment(
                start_seconds=_parse_timestamp(start_text),
                end_seconds=_parse_timestamp(end_text.split(" ")[0]),
                text=cleaned_text,
            )
        )
    return segments


def _parse_youtube_json3(content: str) -> list[TranscriptSegment]:
    payload = json.loads(content)
    segments: list[TranscriptSegment] = []
    for event in payload.get("events", []):
        segs: Iterable[dict[str, str]] = event.get("segs", [])
        text = "".join(segment.get("utf8", "") for segment in segs).replace("\n", " ").strip()
        if not text:
            continue
        start_seconds = event.get("tStartMs", 0) / 1000
        duration_seconds = event.get("dDurationMs", 0) / 1000
        segments.append(
            TranscriptSegment(
                start_seconds=start_seconds,
                end_seconds=start_seconds + duration_seconds,
                text=text,
            )
        )
    return segments


def _parse_bilibili_json(content: str) -> list[TranscriptSegment]:
    payload = json.loads(content)
    if "events" in payload:
        return _parse_youtube_json3(content)

    segments: list[TranscriptSegment] = []
    for item in payload.get("body", []):
        text = str(item.get("content", "")).strip()
        if not text:
            continue
        segments.append(
            TranscriptSegment(
                start_seconds=float(item.get("from", 0.0)),
                end_seconds=float(item.get("to", item.get("from", 0.0))),
                text=text,
            )
        )
    return segments


def _parse_timestamp(raw_timestamp: str) -> float:
    cleaned = raw_timestamp.replace(",", ".").strip()
    parts = cleaned.split(":")
    total = 0.0
    for part in parts:
        total = total * 60 + float(part)
    return total


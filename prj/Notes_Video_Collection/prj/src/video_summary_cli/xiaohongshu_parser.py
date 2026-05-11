from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from urllib.parse import urlparse


INITIAL_STATE_PATTERN = re.compile(
    r"window\.__INITIAL_STATE__\s*=\s*(\{.*?\})\s*;?\s*</script>",
    flags=re.DOTALL,
)
TITLE_PATTERN = re.compile(r"<title>(.*?)</title>", flags=re.IGNORECASE | re.DOTALL)


class XiaohongshuParserError(RuntimeError):
    """小红书页面状态解析失败。"""


@dataclass(slots=True)
class XiaohongshuVideoPage:
    """小红书视频笔记的最小结构化结果。"""

    note_id: str
    title: str
    description: str
    uploader: str
    canonical_url: str
    video_url: str
    published_at: str | None = None
    tags: list[str] = field(default_factory=list)


def parse_xiaohongshu_video_page(html: str, source_url: str) -> XiaohongshuVideoPage:
    """从小红书笔记 HTML 中解析视频页关键信息。"""

    state = _extract_initial_state(html)
    note_id, note = _extract_note(state)
    if not note:
        raise XiaohongshuParserError("页面详情为空，当前请求可能缺少 cookies 或被网页端限制。")
    if not _is_video_note(note):
        raise XiaohongshuParserError("当前页面不是视频笔记。")

    video_url = _extract_video_url(note)
    if not video_url:
        raise XiaohongshuParserError("未找到可用的视频媒体地址。")

    title = str(note.get("title") or _extract_html_title(html) or note_id).strip()
    description = str(note.get("desc") or "").strip()
    uploader = _extract_uploader(note)
    canonical_url = _build_canonical_url(source_url, note_id)
    published_at = _normalize_published_at(
        note.get("time")
        or note.get("publishTime")
        or note.get("publish_time")
        or note.get("lastUpdateTime")
    )
    tags = _extract_tags(note)

    return XiaohongshuVideoPage(
        note_id=note_id,
        title=title or note_id,
        description=description,
        uploader=uploader or "unknown",
        canonical_url=canonical_url,
        video_url=video_url,
        published_at=published_at,
        tags=tags,
    )


def _extract_initial_state(html: str) -> dict:
    match = INITIAL_STATE_PATTERN.search(html or "")
    if match is None:
        raise XiaohongshuParserError("页面中缺少 window.__INITIAL_STATE__。")

    state_text = match.group(1).strip()
    sanitized_state_text = re.sub(r"\bundefined\b", "null", state_text)
    try:
        return json.loads(sanitized_state_text)
    except json.JSONDecodeError as exc:  # pragma: no cover - 解析失败保护
        raise XiaohongshuParserError("window.__INITIAL_STATE__ 不是可解析的 JSON。") from exc


def _extract_note(state: dict) -> tuple[str, dict]:
    note_map = state.get("note", {}).get("noteDetailMap", {})
    if not isinstance(note_map, dict) or not note_map:
        raise XiaohongshuParserError("页面状态中缺少 noteDetailMap。")

    for note_id, payload in note_map.items():
        note = payload.get("note") if isinstance(payload, dict) else None
        if isinstance(note, dict):
            return str(note_id), note
    raise XiaohongshuParserError("页面状态中未找到有效笔记详情。")


def _is_video_note(note: dict) -> bool:
    note_type = str(note.get("type") or "").strip().lower()
    if note_type:
        return note_type == "video"
    return isinstance(note.get("video"), dict)


def _extract_video_url(note: dict) -> str:
    video_info = note.get("video") or {}
    stream_info = video_info.get("media", {}).get("stream", {})
    for codec_name in ("h264", "h265"):
        codec_items = stream_info.get(codec_name) or []
        for item in codec_items:
            master_url = _normalize_url(item.get("masterUrl") if isinstance(item, dict) else "")
            if master_url:
                return master_url
    return ""


def _extract_uploader(note: dict) -> str:
    user_info = note.get("user") or note.get("author") or {}
    if not isinstance(user_info, dict):
        return ""
    return str(
        user_info.get("nickname")
        or user_info.get("name")
        or user_info.get("nickName")
        or ""
    ).strip()


def _build_canonical_url(source_url: str, note_id: str) -> str:
    return f"https://www.xiaohongshu.com/explore/{note_id}"


def _normalize_published_at(raw_value) -> str | None:
    if raw_value in {None, ""}:
        return None

    if isinstance(raw_value, str) and raw_value.strip():
        stripped_value = raw_value.strip()
        if stripped_value.isdigit():
            raw_value = int(stripped_value)
        else:
            return stripped_value

    if isinstance(raw_value, (int, float)):
        timestamp = float(raw_value)
        if timestamp > 10_000_000_000:
            timestamp = timestamp / 1000
        return datetime.fromtimestamp(timestamp, tz=timezone.utc).date().isoformat()

    return str(raw_value).strip() or None


def _extract_tags(note: dict) -> list[str]:
    raw_tag_list = note.get("tagList") or note.get("tags") or []
    tags: list[str] = []
    for raw_item in raw_tag_list:
        if isinstance(raw_item, dict):
            tag_name = str(raw_item.get("name") or raw_item.get("text") or "").strip()
        else:
            tag_name = str(raw_item or "").strip()
        if tag_name and tag_name not in tags:
            tags.append(tag_name)
    return tags


def _extract_html_title(html: str) -> str:
    match = TITLE_PATTERN.search(html or "")
    if match is None:
        return ""
    return match.group(1).replace(" - 小红书", "").strip()


def _normalize_url(url: str) -> str:
    raw_url = str(url or "").strip()
    if not raw_url:
        return ""
    if raw_url.startswith("//"):
        return f"https:{raw_url}"
    return raw_url

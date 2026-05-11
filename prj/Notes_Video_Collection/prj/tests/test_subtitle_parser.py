import json

from video_summary_cli.subtitle_parser import parse_subtitle_content
from video_summary_cli.transcript import clean_segment_text, merge_adjacent_segments


def test_parse_vtt_subtitle_content() -> None:
    content = """WEBVTT

00:00:00.000 --> 00:00:01.500
第一句

00:00:01.500 --> 00:00:03.000
第二句
"""

    segments = parse_subtitle_content(content, "vtt")

    assert [segment.text for segment in segments] == ["第一句", "第二句"]


def test_parse_youtube_json3_subtitle_content() -> None:
    payload = {
        "events": [
            {
                "tStartMs": 0,
                "dDurationMs": 1200,
                "segs": [{"utf8": "Hello "}, {"utf8": "world"}],
            }
        ]
    }

    segments = parse_subtitle_content(json.dumps(payload), "json3")

    assert len(segments) == 1
    assert segments[0].text == "Hello world"


def test_parse_bilibili_json_subtitle_content() -> None:
    payload = {
        "body": [
            {"from": 0.0, "to": 1.5, "content": "第一段"},
            {"from": 1.5, "to": 3.0, "content": "第二段"},
        ]
    }

    segments = parse_subtitle_content(json.dumps(payload), "json")

    assert [segment.text for segment in segments] == ["第一段", "第二段"]


def test_merge_adjacent_segments_groups_short_phrases() -> None:
    segments = parse_subtitle_content(
        """WEBVTT

00:00:00.000 --> 00:00:01.000
第一句

00:00:01.000 --> 00:00:02.000
第二句

00:00:02.000 --> 00:00:03.000
第三句
""",
        "vtt",
    )

    merged = merge_adjacent_segments(segments, target_characters=10, max_segments=2)

    assert len(merged) == 2
    assert merged[0].text == "第一句 第二句"


def test_clean_segment_text_removes_common_fillers() -> None:
    cleaned = clean_segment_text("呃大家好 今天我们就花呃十来分钟的时间来介绍一下啊")

    assert cleaned == "大家好 今天我们就花十来分钟的时间来介绍一下"


def test_clean_segment_text_removes_standalone_fillers_in_middle() -> None:
    cleaned = clean_segment_text("那我肯定是要趁着这个热度来做一波呃 干货的介绍吧")

    assert cleaned == "那我肯定是要趁着这个热度来做一波 干货的介绍吧"


def test_clean_segment_text_removes_trailing_fillers() -> None:
    cleaned = clean_segment_text("我天天在群里面呃")

    assert cleaned == "我天天在群里面"

from pathlib import Path

from video_summary_cli.fetcher import build_video_download_format, build_ydl_options, pick_subtitle_candidate


def test_pick_subtitle_candidate_prefers_manual_subtitles() -> None:
    info = {
        "subtitles": {
            "zh-CN": [{"ext": "vtt", "url": "https://example.com/manual.vtt"}],
        },
        "automatic_captions": {
            "zh-CN": [{"ext": "json3", "url": "https://example.com/auto.json3"}],
        },
    }

    candidate = pick_subtitle_candidate(info, ["zh-CN", "en"])

    assert candidate is not None
    assert candidate.language == "zh-CN"
    assert candidate.url == "https://example.com/manual.vtt"
    assert candidate.extension == "vtt"
    assert candidate.is_automatic is False


def test_pick_subtitle_candidate_uses_automatic_when_manual_missing() -> None:
    info = {
        "subtitles": {},
        "automatic_captions": {
            "en": [{"ext": "json3", "url": "https://example.com/auto.json3"}],
        },
    }

    candidate = pick_subtitle_candidate(info, ["zh-CN", "en"])

    assert candidate is not None
    assert candidate.language == "en"
    assert candidate.extension == "json3"
    assert candidate.is_automatic is True


def test_build_ydl_options_includes_cookiefile_when_provided() -> None:
    options = build_ydl_options(
        skip_download=True,
        cookies_path=Path("ref/Data/www.bilibili.com_cookies.txt"),
    )

    assert options["skip_download"] is True
    assert options["cookiefile"].endswith("www.bilibili.com_cookies.txt")


def test_build_video_download_format_prefers_video_only_streams() -> None:
    assert build_video_download_format() == "bestvideo[ext=mp4]/bestvideo/best[ext=mp4]/best"

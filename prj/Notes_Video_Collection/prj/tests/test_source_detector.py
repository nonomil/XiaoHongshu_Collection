from video_summary_cli.models import VideoPlatform
from video_summary_cli.source_detector import detect_platform


def test_detect_platform_for_bilibili_short_link() -> None:
    assert detect_platform("https://b23.tv/1SzaT3c") is VideoPlatform.BILIBILI


def test_detect_platform_for_youtube_watch_url() -> None:
    assert (
        detect_platform("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
        is VideoPlatform.YOUTUBE
    )


def test_detect_platform_for_xiaohongshu_explore_url() -> None:
    assert (
        detect_platform("https://www.xiaohongshu.com/explore/680f14630000000021011b0e")
        is VideoPlatform.XIAOHONGSHU
    )


def test_detect_platform_for_xiaohongshu_short_link() -> None:
    assert detect_platform("https://xhslink.com/a/Example123") is VideoPlatform.XIAOHONGSHU


def test_detect_platform_for_unknown_url() -> None:
    assert detect_platform("https://example.com/video") is VideoPlatform.UNKNOWN

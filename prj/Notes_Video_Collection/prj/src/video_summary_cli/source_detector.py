from __future__ import annotations

from urllib.parse import urlparse

from video_summary_cli.models import VideoPlatform


def detect_platform(url: str) -> VideoPlatform:
    """根据 URL 主机名识别视频平台。"""

    hostname = urlparse(url).netloc.lower()
    if any(token in hostname for token in ("bilibili.com", "b23.tv")):
        return VideoPlatform.BILIBILI
    if any(token in hostname for token in ("youtube.com", "youtu.be")):
        return VideoPlatform.YOUTUBE
    if any(token in hostname for token in ("xiaohongshu.com", "xhslink.com")):
        return VideoPlatform.XIAOHONGSHU
    return VideoPlatform.UNKNOWN

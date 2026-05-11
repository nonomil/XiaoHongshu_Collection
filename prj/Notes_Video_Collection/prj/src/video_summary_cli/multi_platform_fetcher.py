from __future__ import annotations

from pathlib import Path

from video_summary_cli.models import TranscriptSegment, VideoMetadata, VideoPlatform
from video_summary_cli.source_detector import detect_platform


class MultiPlatformVideoFetcher:
    """按平台把请求分发到不同抓取器。"""

    def __init__(self, default_fetcher, platform_fetchers: dict[VideoPlatform, object] | None = None) -> None:
        self.default_fetcher = default_fetcher
        self.platform_fetchers = platform_fetchers or {}

    def extract_metadata(self, url: str) -> VideoMetadata:
        active_fetcher = self._resolve_fetcher_by_url(url)
        return active_fetcher.extract_metadata(url)

    def fetch_transcript_segments(self, metadata: VideoMetadata) -> list[TranscriptSegment]:
        return self._resolve_fetcher_by_metadata(metadata).fetch_transcript_segments(metadata)

    def download_audio(self, metadata: VideoMetadata, target_dir: Path) -> Path:
        return self._resolve_fetcher_by_metadata(metadata).download_audio(metadata, target_dir)

    def download_video(self, metadata: VideoMetadata, target_dir: Path) -> Path:
        return self._resolve_fetcher_by_metadata(metadata).download_video(metadata, target_dir)

    def _resolve_fetcher_by_url(self, url: str):
        return self.platform_fetchers.get(detect_platform(url), self.default_fetcher)

    def _resolve_fetcher_by_metadata(self, metadata: VideoMetadata):
        return self.platform_fetchers.get(metadata.platform, self.default_fetcher)

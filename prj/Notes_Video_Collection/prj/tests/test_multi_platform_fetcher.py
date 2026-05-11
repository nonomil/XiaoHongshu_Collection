from pathlib import Path

from video_summary_cli.models import TranscriptSegment, VideoMetadata, VideoPlatform
from video_summary_cli.multi_platform_fetcher import MultiPlatformVideoFetcher


class FakeFetcher:
    def __init__(self, platform: VideoPlatform) -> None:
        self.platform = platform
        self.calls: list[tuple[str, str]] = []

    def extract_metadata(self, url: str) -> VideoMetadata:
        self.calls.append(("extract_metadata", url))
        return VideoMetadata(
            source_url=url,
            canonical_url=url,
            title=f"{self.platform.value}-title",
            uploader="tester",
            description="demo",
            video_id=f"{self.platform.value}-001",
            platform=self.platform,
        )

    def fetch_transcript_segments(self, metadata: VideoMetadata) -> list[TranscriptSegment]:
        self.calls.append(("fetch_transcript_segments", metadata.video_id))
        return []

    def download_audio(self, metadata: VideoMetadata, target_dir: Path) -> Path:
        self.calls.append(("download_audio", metadata.video_id))
        return target_dir / f"{metadata.video_id}.audio"

    def download_video(self, metadata: VideoMetadata, target_dir: Path) -> Path:
        self.calls.append(("download_video", metadata.video_id))
        return target_dir / f"{metadata.video_id}.video"


def test_multi_platform_fetcher_routes_xiaohongshu_urls_to_xiaohongshu_fetcher(tmp_path: Path) -> None:
    xiaohongshu_fetcher = FakeFetcher(VideoPlatform.XIAOHONGSHU)
    default_fetcher = FakeFetcher(VideoPlatform.BILIBILI)
    fetcher = MultiPlatformVideoFetcher(
        default_fetcher=default_fetcher,
        platform_fetchers={VideoPlatform.XIAOHONGSHU: xiaohongshu_fetcher},
    )

    metadata = fetcher.extract_metadata("https://www.xiaohongshu.com/explore/680f14630000000021011b0e")
    fetcher.fetch_transcript_segments(metadata)
    fetcher.download_audio(metadata, tmp_path)
    fetcher.download_video(metadata, tmp_path)

    assert metadata.platform is VideoPlatform.XIAOHONGSHU
    assert [call[0] for call in xiaohongshu_fetcher.calls] == [
        "extract_metadata",
        "fetch_transcript_segments",
        "download_audio",
        "download_video",
    ]
    assert default_fetcher.calls == []


def test_multi_platform_fetcher_uses_default_fetcher_for_other_platforms() -> None:
    xiaohongshu_fetcher = FakeFetcher(VideoPlatform.XIAOHONGSHU)
    default_fetcher = FakeFetcher(VideoPlatform.YOUTUBE)
    fetcher = MultiPlatformVideoFetcher(
        default_fetcher=default_fetcher,
        platform_fetchers={VideoPlatform.XIAOHONGSHU: xiaohongshu_fetcher},
    )

    metadata = fetcher.extract_metadata("https://www.youtube.com/watch?v=demo123")

    assert metadata.platform is VideoPlatform.YOUTUBE
    assert default_fetcher.calls == [("extract_metadata", "https://www.youtube.com/watch?v=demo123")]
    assert xiaohongshu_fetcher.calls == []

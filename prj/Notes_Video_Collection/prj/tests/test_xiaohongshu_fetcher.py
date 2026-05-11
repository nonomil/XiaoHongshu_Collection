from pathlib import Path

from video_summary_cli.models import VideoPlatform
from video_summary_cli.xiaohongshu_fetcher import XiaohongshuVideoFetcher


SAMPLE_VIDEO_HTML = """
<html>
  <head>
    <script>
      window.__INITIAL_STATE__={"note":{"noteDetailMap":{"680f14630000000021011b0e":{"note":{
        "type":"video",
        "title":"小红书视频教程样例",
        "desc":"演示如何把小红书视频整理成文档",
        "time":1745212800000,
        "user":{"nickname":"小红书作者"},
        "tagList":[{"name":"AI工具"},{"name":"AI育儿"}],
        "video":{
          "media":{"stream":{
            "h264":[{"masterUrl":"https://sns-video-bd.xhscdn.com/demo-video.m3u8"}]
          }}
        }
      }}}}};
    </script>
  </head>
  <body></body>
</html>
"""


class FakeMediaDownloader:
    def __init__(self) -> None:
        self.calls: list[tuple[str, Path, str, str]] = []

    def download(self, *, media_url: str, target_dir: Path, file_stub: str, media_kind: str) -> Path:
        self.calls.append((media_url, target_dir, file_stub, media_kind))
        suffix = ".mp3" if media_kind == "audio" else ".mp4"
        output_path = target_dir / f"{file_stub}{suffix}"
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(b"fake-media")
        return output_path


def test_xiaohongshu_fetcher_extracts_metadata_from_html_loader() -> None:
    fetcher = XiaohongshuVideoFetcher(
        page_loader=lambda url: SAMPLE_VIDEO_HTML,
        media_downloader=FakeMediaDownloader(),
    )

    metadata = fetcher.extract_metadata("https://www.xiaohongshu.com/explore/680f14630000000021011b0e")

    assert metadata.title == "小红书视频教程样例"
    assert metadata.uploader == "小红书作者"
    assert metadata.video_id == "680f14630000000021011b0e"
    assert metadata.platform is VideoPlatform.XIAOHONGSHU
    assert metadata.canonical_url == "https://www.xiaohongshu.com/explore/680f14630000000021011b0e"
    assert metadata.tags == ["AI工具", "AI育儿"]


def test_xiaohongshu_fetcher_returns_empty_transcript_segments_by_default() -> None:
    fetcher = XiaohongshuVideoFetcher(
        page_loader=lambda url: SAMPLE_VIDEO_HTML,
        media_downloader=FakeMediaDownloader(),
    )
    metadata = fetcher.extract_metadata("https://www.xiaohongshu.com/explore/680f14630000000021011b0e")

    assert fetcher.fetch_transcript_segments(metadata) == []


def test_xiaohongshu_fetcher_delegates_audio_and_video_downloads(tmp_path: Path) -> None:
    downloader = FakeMediaDownloader()
    fetcher = XiaohongshuVideoFetcher(
        page_loader=lambda url: SAMPLE_VIDEO_HTML,
        media_downloader=downloader,
    )
    metadata = fetcher.extract_metadata("https://www.xiaohongshu.com/explore/680f14630000000021011b0e")

    audio_path = fetcher.download_audio(metadata, tmp_path)
    video_path = fetcher.download_video(metadata, tmp_path)

    assert audio_path.exists()
    assert video_path.exists()
    assert downloader.calls[0][0] == "https://sns-video-bd.xhscdn.com/demo-video.m3u8"
    assert downloader.calls[0][3] == "audio"
    assert downloader.calls[1][3] == "video"

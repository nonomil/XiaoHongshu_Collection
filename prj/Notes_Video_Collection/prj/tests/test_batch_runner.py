import json
from pathlib import Path

from video_summary_cli.batch_runner import BatchRunRequest, run_batch
from video_summary_cli.models import ScreenshotAsset, TranscriptSegment, VideoMetadata, VideoPlatform
from video_summary_cli.paths import build_document_assets_directory, build_summary_markdown_filename
from video_summary_cli.web_models import WebUiSettings


class FakeBatchFetcher:
    def __init__(self) -> None:
        self._titles = {
            "https://b23.tv/alpha": "批量视频一",
            "https://www.youtube.com/watch?v=beta": "批量视频二",
        }

    def extract_metadata(self, url: str) -> VideoMetadata:
        return VideoMetadata(
            source_url=url,
            canonical_url=url,
            title=self._titles[url],
            uploader="测试作者",
            description="测试简介",
            video_id=url.rsplit("/", maxsplit=1)[-1].replace("?", "-"),
            platform=VideoPlatform.YOUTUBE if "youtube" in url else VideoPlatform.BILIBILI,
        )

    def fetch_transcript_segments(self, metadata: VideoMetadata) -> list[TranscriptSegment]:
        return [
            TranscriptSegment(
                start_seconds=0.0,
                end_seconds=8.0,
                text=f"{metadata.title} 的开场介绍。",
            ),
            TranscriptSegment(
                start_seconds=8.0,
                end_seconds=16.0,
                text=f"{metadata.title} 的操作步骤讲解。",
            ),
        ]

    def download_audio(self, metadata: VideoMetadata, target_dir: Path) -> Path:
        audio_path = target_dir / f"{metadata.video_id}.m4a"
        audio_path.write_bytes(b"fake-audio")
        return audio_path

    def download_video(self, metadata: VideoMetadata, target_dir: Path) -> Path:
        video_path = target_dir / f"{metadata.video_id}.mp4"
        video_path.write_bytes(b"fake-video")
        return video_path


class FakeBatchScreenshotSampler:
    relative_directory = Path("img")

    def sample(self, video_path: Path, output_dir: Path, duration_seconds: float | None) -> list[ScreenshotAsset]:
        output_dir.mkdir(parents=True, exist_ok=True)
        frame_path = output_dir / "frame-001-000008.jpg"
        frame_path.write_bytes(b"fake-jpeg")
        return [
            ScreenshotAsset(
                timestamp_seconds=8.0,
                relative_path=(self.relative_directory / "frame-001-000008.jpg").as_posix(),
                alt_text="关键画面 1",
            )
        ]


def test_run_batch_writes_markdown_to_shared_output_directory(tmp_path: Path) -> None:
    batch_output_dir = tmp_path / "web-batch"
    request = BatchRunRequest(
        urls=[
            "https://b23.tv/alpha",
            "https://www.youtube.com/watch?v=beta",
        ],
        settings=WebUiSettings(
            output_dir=str(batch_output_dir),
            screenshot_mode="smart",
            screenshot_count=8,
            summary_style="tutorial-note",
        ),
    )

    result = run_batch(
        request=request,
        fetcher=FakeBatchFetcher(),
        screenshot_sampler=FakeBatchScreenshotSampler(),
    )

    first_markdown = batch_output_dir / build_summary_markdown_filename("批量视频一")
    second_markdown = batch_output_dir / build_summary_markdown_filename("批量视频二")
    first_assets = batch_output_dir / build_document_assets_directory("批量视频一") / "frame-001-000008.jpg"
    second_assets = batch_output_dir / build_document_assets_directory("批量视频二") / "frame-001-000008.jpg"
    batch_manifest = json.loads((batch_output_dir / "batch_manifest.json").read_text(encoding="utf-8"))

    assert result.completed_count == 2
    assert result.failed_count == 0
    assert first_markdown.exists()
    assert second_markdown.exists()
    assert first_assets.exists()
    assert second_assets.exists()
    assert (batch_output_dir / ".runs").is_dir()
    assert batch_manifest["completed_count"] == 2
    assert batch_manifest["items"][0]["summary_markdown_path"].endswith(first_markdown.name)
    assert batch_manifest["items"][1]["summary_markdown_path"].endswith(second_markdown.name)
    assert "img/批量视频一.assets/frame-001-000008.jpg" in first_markdown.read_text(encoding="utf-8")


def test_run_batch_keeps_downloaded_media_inside_hidden_runs_directory(tmp_path: Path) -> None:
    batch_output_dir = tmp_path / "web-batch"
    request = BatchRunRequest(
        urls=["https://b23.tv/alpha"],
        settings=WebUiSettings(
            output_dir=str(batch_output_dir),
            screenshot_mode="smart",
            screenshot_count=8,
            summary_style="tutorial-note",
        ),
    )

    run_batch(
        request=request,
        fetcher=FakeBatchFetcher(),
        screenshot_sampler=FakeBatchScreenshotSampler(),
    )

    root_file_names = {path.name for path in batch_output_dir.iterdir() if path.is_file()}

    assert "alpha.mp4" not in root_file_names
    assert any(path.suffix == ".mp4" for path in (batch_output_dir / ".runs").rglob("*.mp4"))

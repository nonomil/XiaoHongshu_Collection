import json
from pathlib import Path

import pytest

from video_summary_cli import __version__
from video_summary_cli.cli import (
    _build_screenshot_sampler,
    build_parser,
    run_summarize_command,
)
from video_summary_cli.models import ScreenshotAsset, TranscriptSegment, VideoMetadata, VideoPlatform
from video_summary_cli.paths import build_document_assets_directory, build_summary_markdown_filename


class FakeFetcher:
    def __init__(self) -> None:
        self.download_video_target_dir: Path | None = None

    def extract_metadata(self, url: str) -> VideoMetadata:
        return VideoMetadata(
            source_url=url,
            canonical_url=url,
            title="CLI 测试视频",
            uploader="测试作者",
            description="测试简介",
            video_id="cli-001",
            platform=VideoPlatform.BILIBILI,
        )

    def fetch_transcript_segments(self, metadata: VideoMetadata) -> list[TranscriptSegment]:
        return [
            TranscriptSegment(
                start_seconds=0.0,
                end_seconds=1.0,
                text="CLI 测试转写",
            )
        ]

    def download_audio(self, metadata: VideoMetadata, target_dir: Path) -> Path:
        raise AssertionError("有字幕时不应下载音频")

    def download_video(self, metadata: VideoMetadata, target_dir: Path) -> Path:
        self.download_video_target_dir = target_dir
        video_path = target_dir / "video.mp4"
        video_path.write_bytes(b"fake-video")
        return video_path


def test_run_summarize_command_creates_output_directory(tmp_path: Path) -> None:
    output_dir = run_summarize_command(
        url="https://b23.tv/1SzaT3c",
        output_dir=tmp_path,
        fetcher=FakeFetcher(),
    )

    assert output_dir.exists()
    summary_path = output_dir / build_summary_markdown_filename("CLI 测试视频")
    assert summary_path.exists()
    assert "CLI 测试视频" in summary_path.read_text(encoding="utf-8")


class FakeNoSubtitleFetcher(FakeFetcher):
    def __init__(self) -> None:
        self.download_target_dir: Path | None = None

    def fetch_transcript_segments(self, metadata: VideoMetadata) -> list[TranscriptSegment]:
        return []

    def download_audio(self, metadata: VideoMetadata, target_dir: Path) -> Path:
        self.download_target_dir = target_dir
        return target_dir / "audio.m4a"


class FakeTranscriber:
    def transcribe(self, audio_path: Path) -> list[TranscriptSegment]:
        return [
            TranscriptSegment(
                start_seconds=0.0,
                end_seconds=1.0,
                text="回退转写内容",
            )
        ]


def test_run_summarize_command_places_audio_in_video_output_directory(tmp_path: Path) -> None:
    fetcher = FakeNoSubtitleFetcher()
    output_dir = run_summarize_command(
        url="https://b23.tv/1SzaT3c",
        output_dir=tmp_path,
        fetcher=fetcher,
        transcriber=FakeTranscriber(),
    )

    assert fetcher.download_target_dir == output_dir


class FakeScreenshotSampler:
    relative_directory = Path("img")

    def sample(self, video_path: Path, output_dir: Path, duration_seconds: float | None) -> list[ScreenshotAsset]:
        output_dir.mkdir(parents=True, exist_ok=True)
        (output_dir / "frame-001-000000.jpg").write_bytes(b"fake-jpeg")
        return [
            ScreenshotAsset(
                timestamp_seconds=0.0,
                relative_path=(self.relative_directory / "frame-001-000000.jpg").as_posix(),
                alt_text="关键画面 1",
            )
        ]


def test_run_summarize_command_writes_screenshot_gallery(tmp_path: Path) -> None:
    fetcher = FakeFetcher()

    output_dir = run_summarize_command(
        url="https://b23.tv/1SzaT3c",
        output_dir=tmp_path,
        fetcher=fetcher,
        screenshot_sampler=FakeScreenshotSampler(),
    )

    summary_markdown = (output_dir / build_summary_markdown_filename("CLI 测试视频")).read_text(encoding="utf-8")
    assert fetcher.download_video_target_dir == output_dir
    assert "## 关键画面" in summary_markdown
    expected_assets_dir = build_document_assets_directory("CLI 测试视频").as_posix()
    assert f"{expected_assets_dir}/frame-001-000000.jpg" in summary_markdown


def test_build_screenshot_sampler_assigns_mode_specific_relative_directory() -> None:
    quick_sampler = _build_screenshot_sampler("quick", 3)
    smart_sampler = _build_screenshot_sampler("smart", 3)

    assert quick_sampler is not None
    assert smart_sampler is not None
    assert quick_sampler.relative_directory.as_posix() == "img"
    assert smart_sampler.relative_directory.as_posix() == "img"


def test_run_summarize_command_records_run_options_in_manifest(tmp_path: Path) -> None:
    output_dir = run_summarize_command(
        url="https://b23.tv/1SzaT3c",
        output_dir=tmp_path,
        fetcher=FakeFetcher(),
        screenshot_sampler=FakeScreenshotSampler(),
        transcriber=FakeTranscriber(),
        screenshot_mode="smart",
        screenshot_count=5,
        whisper_model="small",
    )

    manifest_path = output_dir / "versions" / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    assert manifest["versions"][0]["run_options"]["screenshot_mode"] == "smart"
    assert manifest["versions"][0]["run_options"]["screenshot_count"] == 5
    assert manifest["versions"][0]["run_options"]["whisper_model"] == "small"


def test_build_parser_supports_version_flag(capsys) -> None:
    parser = build_parser()

    with pytest.raises(SystemExit) as exc_info:
        parser.parse_args(["--version"])

    captured = capsys.readouterr()

    assert exc_info.value.code == 0
    assert __version__ in captured.out


def test_build_parser_supports_web_command() -> None:
    parser = build_parser()

    args = parser.parse_args(["web", "--host", "127.0.0.1", "--port", "7860"])

    assert args.command == "web"
    assert args.host == "127.0.0.1"
    assert args.port == 7860

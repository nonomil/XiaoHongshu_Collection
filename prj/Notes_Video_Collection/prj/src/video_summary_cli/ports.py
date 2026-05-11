from __future__ import annotations

from pathlib import Path
from typing import Protocol, runtime_checkable

from video_summary_cli.models import ScreenshotAsset, SummaryChapter, TranscriptSegment, VideoMetadata


@runtime_checkable
class VideoFetcherPort(Protocol):
    """视频抓取端口。"""

    def extract_metadata(self, url: str) -> VideoMetadata:
        """从 URL 提取视频元数据。"""

    def fetch_transcript_segments(self, metadata: VideoMetadata) -> list[TranscriptSegment]:
        """优先读取现成字幕。"""

    def download_audio(self, metadata: VideoMetadata, target_dir: Path) -> Path:
        """下载音频供 ASR 使用。"""

    def download_video(self, metadata: VideoMetadata, target_dir: Path) -> Path:
        """下载视频供截图采样使用。"""


@runtime_checkable
class VideoTranscriberPort(Protocol):
    """ASR 转写端口。"""

    def transcribe(self, audio_path: Path) -> list[TranscriptSegment]:
        """把音频转成统一字幕片段。"""


@runtime_checkable
class ScreenshotSamplerPort(Protocol):
    """截图采样端口。"""

    relative_directory: Path

    def sample(
        self,
        video_path: Path,
        output_dir: Path,
        duration_seconds: float | None,
    ) -> list[ScreenshotAsset]:
        """按全局时间轴采样截图。"""


@runtime_checkable
class ChapterAwareScreenshotSamplerPort(ScreenshotSamplerPort, Protocol):
    """支持章节锚点采样的截图端口。"""

    def sample_for_chapters(
        self,
        video_path: Path,
        output_dir: Path,
        chapters: list[SummaryChapter],
        duration_seconds: float | None = None,
    ) -> list[ScreenshotAsset]:
        """围绕章节锚点采样截图。"""

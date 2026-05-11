from __future__ import annotations

from pathlib import Path

from video_summary_cli.chapter_visual_binding import bind_screenshots_to_chapters
from video_summary_cli.chaptering import build_chapters
from video_summary_cli.models import SummaryDocument
from video_summary_cli.paths import build_document_assets_directory
from video_summary_cli.ports import (
    ChapterAwareScreenshotSamplerPort,
    ScreenshotSamplerPort,
    VideoFetcherPort,
    VideoTranscriberPort,
)
from video_summary_cli.screenshot_caption_builder import build_screenshot_caption_blocks
from video_summary_cli.summarizer import ExtractiveSummarizer


class VideoSummaryPipeline:
    """串联抓取、转写与总结。"""

    def __init__(
        self,
        fetcher: VideoFetcherPort,
        transcriber: VideoTranscriberPort | None = None,
        summarizer=None,
        screenshot_sampler: ScreenshotSamplerPort | None = None,
        summary_style: str | None = None,
    ) -> None:
        self.fetcher = fetcher
        self.transcriber = transcriber
        self.summarizer = summarizer or ExtractiveSummarizer()
        self.screenshot_sampler = screenshot_sampler
        self.summary_style = summary_style or "default"

    def run(self, url: str, working_directory: Path) -> SummaryDocument:
        metadata = self.fetcher.extract_metadata(url)
        return self.run_with_metadata(metadata, working_directory)

    def run_with_metadata(self, metadata, working_directory: Path) -> SummaryDocument:
        transcript_segments = self.fetcher.fetch_transcript_segments(metadata)

        if not transcript_segments:
            if self.transcriber is None:
                raise RuntimeError("当前视频缺少字幕，且未配置 ASR 转写器。")
            audio_path = self.fetcher.download_audio(metadata, working_directory)
            transcript_segments = self.transcriber.transcribe(audio_path)

        abstract, bullets = self.summarizer.summarize(metadata, transcript_segments)
        chapters = build_chapters(transcript_segments)
        screenshots = self._collect_screenshots(metadata, working_directory, transcript_segments, chapters)
        if chapters:
            chapters = bind_screenshots_to_chapters(chapters=chapters, screenshots=screenshots)
        screenshot_caption_blocks = build_screenshot_caption_blocks(
            transcript_segments=transcript_segments,
            screenshots=screenshots,
            chapters=chapters,
        )
        return SummaryDocument(
            metadata=metadata,
            abstract=abstract,
            bullets=bullets,
            transcript_segments=transcript_segments,
            screenshots=screenshots,
            screenshot_caption_blocks=screenshot_caption_blocks,
            chapters=chapters,
        )

    def _collect_screenshots(
        self,
        metadata,
        working_directory: Path,
        transcript_segments,
        chapters,
    ) -> list:
        if self.screenshot_sampler is None:
            return []

        duration_seconds = metadata.duration_seconds
        if duration_seconds is None and transcript_segments:
            duration_seconds = max(segment.end_seconds for segment in transcript_segments)

        relative_directory = build_document_assets_directory(metadata.title)
        self.screenshot_sampler.relative_directory = relative_directory
        video_path = self.fetcher.download_video(metadata, working_directory)
        if chapters and isinstance(self.screenshot_sampler, ChapterAwareScreenshotSamplerPort):
            return self.screenshot_sampler.sample_for_chapters(
                video_path=video_path,
                output_dir=working_directory / relative_directory,
                chapters=chapters,
                duration_seconds=duration_seconds,
            )
        return self.screenshot_sampler.sample(
            video_path=video_path,
            output_dir=working_directory / relative_directory,
            duration_seconds=duration_seconds,
        )

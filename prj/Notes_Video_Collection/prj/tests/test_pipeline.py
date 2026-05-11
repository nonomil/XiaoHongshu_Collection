from pathlib import Path

from video_summary_cli.models import ScreenshotAsset, TranscriptSegment, VideoMetadata, VideoPlatform
from video_summary_cli.paths import build_document_assets_directory
from video_summary_cli.pipeline import VideoSummaryPipeline
from video_summary_cli.ports import (
    ChapterAwareScreenshotSamplerPort,
    ScreenshotSamplerPort,
    VideoFetcherPort,
    VideoTranscriberPort,
)


class FakeFetcher(VideoFetcherPort):
    def __init__(self, with_subtitles: bool, transcript_segments: list[TranscriptSegment] | None = None) -> None:
        self.with_subtitles = with_subtitles
        self.transcript_segments = transcript_segments or [
            TranscriptSegment(
                start_seconds=0.0,
                end_seconds=2.0,
                text="字幕内容",
            )
        ]
        self.download_audio_called = False
        self.download_video_called = False

    def extract_metadata(self, url: str) -> VideoMetadata:
        return VideoMetadata(
            source_url=url,
            canonical_url=url,
            title="示例视频",
            uploader="示例作者",
            description="示例简介",
            video_id="video-001",
            platform=VideoPlatform.BILIBILI,
        )

    def fetch_transcript_segments(self, metadata: VideoMetadata) -> list[TranscriptSegment]:
        if not self.with_subtitles:
            return []
        return self.transcript_segments

    def download_audio(self, metadata: VideoMetadata, target_dir: Path) -> Path:
        self.download_audio_called = True
        return target_dir / "audio.m4a"

    def download_video(self, metadata: VideoMetadata, target_dir: Path) -> Path:
        self.download_video_called = True
        video_path = target_dir / "video.mp4"
        video_path.write_bytes(b"fake-video")
        return video_path


class FakeTranscriber(VideoTranscriberPort):
    def __init__(self) -> None:
        self.called = False

    def transcribe(self, audio_path: Path) -> list[TranscriptSegment]:
        self.called = True
        return [
            TranscriptSegment(
                start_seconds=0.0,
                end_seconds=2.0,
                text=f"来自 {audio_path.name} 的转写",
            )
        ]


def test_pipeline_prefers_subtitles_over_audio_download(tmp_path: Path) -> None:
    fetcher = FakeFetcher(with_subtitles=True)
    transcriber = FakeTranscriber()
    pipeline = VideoSummaryPipeline(fetcher=fetcher, transcriber=transcriber)

    document = pipeline.run("https://b23.tv/1SzaT3c", tmp_path)

    assert document.metadata.title == "示例视频"
    assert not fetcher.download_audio_called
    assert not transcriber.called


def test_pipeline_falls_back_to_transcriber_when_subtitles_missing(tmp_path: Path) -> None:
    fetcher = FakeFetcher(with_subtitles=False)
    transcriber = FakeTranscriber()
    pipeline = VideoSummaryPipeline(fetcher=fetcher, transcriber=transcriber)

    document = pipeline.run("https://b23.tv/1SzaT3c", tmp_path)

    assert fetcher.download_audio_called
    assert transcriber.called
    assert document.transcript_segments[0].text.startswith("来自 audio.m4a")


class FakeScreenshotSampler(ScreenshotSamplerPort):
    relative_directory = Path("img")

    def __init__(self) -> None:
        self.called = False
        self.video_path: Path | None = None
        self.output_dir: Path | None = None
        self.duration_seconds: float | None = None

    def sample(self, video_path: Path, output_dir: Path, duration_seconds: float | None) -> list[ScreenshotAsset]:
        self.called = True
        self.video_path = video_path
        self.output_dir = output_dir
        self.duration_seconds = duration_seconds
        return [
            ScreenshotAsset(
                timestamp_seconds=10.0,
                relative_path=(self.relative_directory / "frame-001-000010.jpg").as_posix(),
                alt_text="关键画面 1",
            )
        ]


class FakeChapterAwareScreenshotSampler(ChapterAwareScreenshotSamplerPort):
    relative_directory = Path("img")

    def __init__(self) -> None:
        self.called = False
        self.sample_for_chapters_called = False
        self.video_path: Path | None = None
        self.output_dir: Path | None = None
        self.duration_seconds: float | None = None
        self.chapter_count = 0

    def sample(self, video_path: Path, output_dir: Path, duration_seconds: float | None) -> list[ScreenshotAsset]:
        self.called = True
        self.video_path = video_path
        self.output_dir = output_dir
        self.duration_seconds = duration_seconds
        return []

    def sample_for_chapters(
        self,
        video_path: Path,
        output_dir: Path,
        chapters,
        duration_seconds: float | None = None,
    ) -> list[ScreenshotAsset]:
        self.sample_for_chapters_called = True
        self.video_path = video_path
        self.output_dir = output_dir
        self.duration_seconds = duration_seconds
        self.chapter_count = len(chapters)
        return [
            ScreenshotAsset(
                timestamp_seconds=(chapter.anchor_start_seconds + chapter.anchor_end_seconds) / 2,
                relative_path=(self.relative_directory / f"frame-{index:03d}.jpg").as_posix(),
                alt_text=f"关键画面 {index}",
                content_score=0.8,
            )
            for index, chapter in enumerate(chapters, 1)
        ]


class ChapterAwareFakeScreenshotSampler(FakeScreenshotSampler):
    def __init__(self) -> None:
        super().__init__()
        self.sample_called = False
        self.sample_for_chapters_called = False
        self.chapters = []
        self.relative_directory = Path("img")

    def sample(self, video_path: Path, output_dir: Path, duration_seconds: float | None) -> list[ScreenshotAsset]:
        self.sample_called = True
        return super().sample(video_path, output_dir, duration_seconds)

    def sample_for_chapters(
        self,
        video_path: Path,
        output_dir: Path,
        chapters,
        duration_seconds: float | None = None,
    ) -> list[ScreenshotAsset]:
        self.sample_for_chapters_called = True
        self.video_path = video_path
        self.output_dir = output_dir
        self.chapters = chapters
        self.duration_seconds = duration_seconds
        screenshots = []
        for index, chapter in enumerate(chapters, 1):
            midpoint = (chapter.anchor_start_seconds + chapter.anchor_end_seconds) / 2
            screenshots.append(
                ScreenshotAsset(
                    timestamp_seconds=midpoint,
                    relative_path=(self.relative_directory / f"chapter-{index:03d}.jpg").as_posix(),
                    alt_text=f"章节画面 {index}",
                )
            )
        return screenshots


def test_pipeline_fakes_align_with_explicit_ports() -> None:
    assert isinstance(FakeFetcher(with_subtitles=True), VideoFetcherPort)
    assert isinstance(FakeTranscriber(), VideoTranscriberPort)
    assert isinstance(FakeScreenshotSampler(), ScreenshotSamplerPort)
    assert isinstance(FakeChapterAwareScreenshotSampler(), ChapterAwareScreenshotSamplerPort)
    assert isinstance(ChapterAwareFakeScreenshotSampler(), ChapterAwareScreenshotSamplerPort)


def test_pipeline_collects_screenshots_when_sampler_is_configured(tmp_path: Path) -> None:
    fetcher = FakeFetcher(with_subtitles=True)
    sampler = FakeScreenshotSampler()
    pipeline = VideoSummaryPipeline(fetcher=fetcher, screenshot_sampler=sampler)

    document = pipeline.run("https://b23.tv/1SzaT3c", tmp_path)

    assert fetcher.download_video_called
    assert sampler.called
    expected_assets_dir = build_document_assets_directory("示例视频")
    assert sampler.output_dir == tmp_path / expected_assets_dir
    assert document.screenshots[0].relative_path == f"{expected_assets_dir.as_posix()}/frame-001-000010.jpg"


def test_pipeline_builds_chapters_and_binds_screenshots(tmp_path: Path) -> None:
    transcript_segments = [
        TranscriptSegment(start_seconds=index * 60.0, end_seconds=index * 60.0 + 45.0, text=text)
        for index, text in enumerate(
            [
                "开场先说明今天为什么要重新理解学习方法。",
                "这一段的目标是建立判断标准，避免只追求做题速度。",
                "案例：作者对比了旧时代和现在信息爆炸时代的差异。",
                "注意：如果只背技巧，不建立方法论，很快会忘。",
                "接着讲输入环节，要主动拆问题而不是被动记笔记。",
                "这里举了看教程时先列问题清单的案例。",
                "注意不要一边放视频一边机械抄字幕。",
                "然后进入输出环节，要把知识变成可以复现的动作。",
                "案例：通过写总结、做项目和复盘来固化理解。",
                "注意如果没有输出，学习成果很难迁移。",
                "最后总结如何把方法迁移到嵌入式学习路径里。",
                "结尾提醒要持续迭代自己的学习系统。",
            ]
        )
    ]
    fetcher = FakeFetcher(with_subtitles=True, transcript_segments=transcript_segments)
    sampler = FakeScreenshotSampler()
    sampler.sample = lambda video_path, output_dir, duration_seconds: [  # type: ignore[method-assign]
        ScreenshotAsset(
            timestamp_seconds=30.0,
            relative_path="img/frame-001-000030.jpg",
            alt_text="关键画面 1",
        ),
        ScreenshotAsset(
            timestamp_seconds=330.0,
            relative_path="img/frame-002-000330.jpg",
            alt_text="关键画面 2",
        ),
        ScreenshotAsset(
            timestamp_seconds=630.0,
            relative_path="img/frame-003-000630.jpg",
            alt_text="关键画面 3",
        ),
    ]
    pipeline = VideoSummaryPipeline(fetcher=fetcher, screenshot_sampler=sampler)

    document = pipeline.run("https://b23.tv/1SzaT3c", tmp_path)

    assert len(document.chapters) >= 3
    assert len({chapter.title for chapter in document.chapters}) == len(document.chapters)
    assert document.chapters[0].anchor_start_seconds < 180.0
    assert any(180.0 <= chapter.anchor_start_seconds < 420.0 for chapter in document.chapters)
    assert document.chapters[-1].anchor_start_seconds >= 420.0
    assert all(len(chapter.screenshot_paths) <= 1 for chapter in document.chapters)
    assert any(chapter.screenshot_paths for chapter in document.chapters)
    assert document.screenshot_caption_blocks


def test_pipeline_uses_chapter_aware_sampling_for_tutorial_note(tmp_path: Path) -> None:
    transcript_segments = [
        TranscriptSegment(start_seconds=index * 60.0, end_seconds=index * 60.0 + 45.0, text=text)
        for index, text in enumerate(
            [
                "开场先说明今天为什么要重新理解学习方法。",
                "这一段的目标是建立判断标准，避免只追求做题速度。",
                "案例：作者对比了旧时代和现在信息爆炸时代的差异。",
                "注意：如果只背技巧，不建立方法论，很快会忘。",
                "接着讲输入环节，要主动拆问题而不是被动记笔记。",
                "这里举了看教程时先列问题清单的案例。",
                "注意不要一边放视频一边机械抄字幕。",
                "然后进入输出环节，要把知识变成可以复现的动作。",
                "案例：通过写总结、做项目和复盘来固化理解。",
                "注意如果没有输出，学习成果很难迁移。",
                "最后总结如何把方法迁移到嵌入式学习路径里。",
                "结尾提醒要持续迭代自己的学习系统。",
            ]
        )
    ]
    fetcher = FakeFetcher(with_subtitles=True, transcript_segments=transcript_segments)
    sampler = FakeChapterAwareScreenshotSampler()
    pipeline = VideoSummaryPipeline(
        fetcher=fetcher,
        screenshot_sampler=sampler,
        summary_style="tutorial-note",
    )

    document = pipeline.run("https://b23.tv/1SzaT3c", tmp_path)

    assert fetcher.download_video_called
    assert sampler.sample_for_chapters_called
    assert not sampler.called
    assert sampler.chapter_count == len(document.chapters)
    assert len(document.screenshots) >= len(document.chapters)
    assert all(chapter.screenshot_paths for chapter in document.chapters)
    assert document.screenshot_caption_blocks


def test_pipeline_prefers_chapter_aware_sampling_when_available(tmp_path: Path) -> None:
    transcript_segments = [
        TranscriptSegment(start_seconds=index * 60.0, end_seconds=index * 60.0 + 45.0, text=text)
        for index, text in enumerate(
            [
                "开场先说明今天为什么要重新理解学习方法。",
                "这一段的目标是建立判断标准，避免只追求做题速度。",
                "案例：作者对比了旧时代和现在信息爆炸时代的差异。",
                "注意：如果只背技巧，不建立方法论，很快会忘。",
                "接着讲输入环节，要主动拆问题而不是被动记笔记。",
                "这里举了看教程时先列问题清单的案例。",
                "注意不要一边放视频一边机械抄字幕。",
                "然后进入输出环节，要把知识变成可以复现的动作。",
                "案例：通过写总结、做项目和复盘来固化理解。",
                "注意如果没有输出，学习成果很难迁移。",
                "最后总结如何把方法迁移到嵌入式学习路径里。",
                "结尾提醒要持续迭代自己的学习系统。",
            ]
        )
    ]
    fetcher = FakeFetcher(with_subtitles=True, transcript_segments=transcript_segments)
    sampler = ChapterAwareFakeScreenshotSampler()
    pipeline = VideoSummaryPipeline(fetcher=fetcher, screenshot_sampler=sampler)

    document = pipeline.run("https://b23.tv/1SzaT3c", tmp_path)

    assert sampler.sample_for_chapters_called
    assert not sampler.sample_called
    assert len(document.screenshots) >= len(document.chapters)
    assert all(chapter.screenshot_paths for chapter in document.chapters)
    assert document.chapters[0].anchor_start_seconds < 180.0
    assert any(180.0 <= chapter.anchor_start_seconds < 420.0 for chapter in document.chapters)
    assert document.chapters[-1].anchor_start_seconds >= 420.0

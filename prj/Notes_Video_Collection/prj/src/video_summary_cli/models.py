from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class VideoPlatform(Enum):
    """支持的平台枚举。"""

    BILIBILI = "bilibili"
    YOUTUBE = "youtube"
    XIAOHONGSHU = "xiaohongshu"
    UNKNOWN = "unknown"


@dataclass(slots=True)
class TranscriptSegment:
    """统一的转写片段表示。"""

    start_seconds: float
    end_seconds: float
    text: str


@dataclass(slots=True)
class CapturedFrame:
    """内存中的候选截图。"""

    timestamp_seconds: float
    frame_payload: object
    ocr_text: str = ""
    visual_difference_score: float = 0.0
    text_difference_score: float = 0.0
    blur_score: float = 0.0
    content_score: float = 0.0
    information_density_score: float = 0.0


@dataclass(slots=True)
class VideoMetadata:
    """视频基础元数据。"""

    source_url: str
    canonical_url: str
    title: str
    uploader: str
    description: str
    video_id: str
    platform: VideoPlatform
    published_at: str | None = None
    duration_seconds: float | None = None
    tags: list[str] = field(default_factory=list)


@dataclass(slots=True)
class ScreenshotAsset:
    """单张截图产物。"""

    timestamp_seconds: float
    relative_path: str
    alt_text: str
    ocr_text: str = ""
    visual_difference_score: float = 0.0
    text_difference_score: float = 0.0
    blur_score: float = 0.0
    content_score: float = 0.0
    information_density_score: float = 0.0


@dataclass(slots=True)
class SummaryChapter:
    """章节化教程笔记的结构化节点。"""

    title: str
    goal: str
    key_points: list[str]
    example_or_case: str
    caution: str
    anchor_start_seconds: float
    anchor_end_seconds: float
    screenshot_paths: list[str] = field(default_factory=list)


@dataclass(slots=True)
class ScreenshotCaptionBlock:
    """截图与对应讲解字幕的绑定块。"""

    screenshot_relative_path: str
    screenshot_alt_text: str
    screenshot_timestamp_seconds: float
    chapter_title: str
    window_start_seconds: float
    window_end_seconds: float
    narration_lines: list[str] = field(default_factory=list)
    ocr_text: str = ""


@dataclass(slots=True)
class SceneCard:
    """最终展示层使用的场景卡片。"""

    title: str
    chapter_title: str
    screenshot_relative_path: str
    screenshot_alt_text: str
    screenshot_timestamp_seconds: float
    window_start_seconds: float
    window_end_seconds: float
    narration_lines: list[str] = field(default_factory=list)
    ocr_text: str = ""
    source_screenshot_paths: list[str] = field(default_factory=list)


@dataclass(slots=True)
class SummaryQualityReport:
    """用于质量门和版本追踪的指标汇总。"""

    raw_screenshot_count: int
    raw_caption_block_count: int
    unique_caption_path_count: int
    scene_card_count: int
    rendered_markdown_image_count: int
    rendered_unique_image_count: int
    average_narration_lines_per_scene: float
    min_narration_lines_per_scene: int
    max_narration_lines_per_scene: int
    duplicate_caption_path_count: int
    duplicate_caption_paths: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


@dataclass(slots=True)
class SummaryDocument:
    """最终用于渲染 Markdown 的结构化结果。"""

    metadata: VideoMetadata
    abstract: str
    bullets: list[str]
    transcript_segments: list[TranscriptSegment]
    screenshots: list[ScreenshotAsset] = field(default_factory=list)
    screenshot_caption_blocks: list[ScreenshotCaptionBlock] = field(default_factory=list)
    chapters: list[SummaryChapter] = field(default_factory=list)
    scene_cards: list[SceneCard] = field(default_factory=list)
    quality_report: SummaryQualityReport | None = None


@dataclass(slots=True)
class PresentationSection:
    """展示层的单个逻辑章节。"""

    heading: str
    lines: list[str] = field(default_factory=list)
    level: int = 2


@dataclass(slots=True)
class SummaryPresentation:
    """Markdown 渲染前的结构化展示模型。"""

    title: str
    sections: list[PresentationSection] = field(default_factory=list)

from datetime import datetime
import json
from pathlib import Path

from video_summary_cli.models import (
    ScreenshotAsset,
    ScreenshotCaptionBlock,
    SummaryChapter,
    SummaryDocument,
    TranscriptSegment,
    VideoMetadata,
    VideoPlatform,
)
from video_summary_cli.paths import build_document_assets_directory, build_summary_markdown_filename
from video_summary_cli.storage import build_output_directory, save_summary_artifacts


def test_save_summary_artifacts_writes_expected_files(tmp_path: Path) -> None:
    metadata = VideoMetadata(
        source_url="https://b23.tv/1SzaT3c",
        canonical_url="https://www.bilibili.com/video/BV1xx411c7mD",
        title="测试标题",
        uploader="测试作者",
        description="测试简介",
        video_id="BV1xx411c7mD",
        platform=VideoPlatform.BILIBILI,
    )
    document = SummaryDocument(
        metadata=metadata,
        abstract="这是摘要。",
        bullets=["要点一"],
        transcript_segments=[
            TranscriptSegment(start_seconds=0.0, end_seconds=1.0, text="第一句")
        ],
    )

    output_dir = save_summary_artifacts(document, tmp_path)

    metadata_path = output_dir / "metadata.json"
    transcript_path = output_dir / "transcript.txt"
    summary_path = output_dir / build_summary_markdown_filename(metadata.title)
    quality_report_path = output_dir / "quality_report.json"
    scene_cards_path = output_dir / "scene_cards.json"
    image_dir = output_dir / "img"
    versions_dir = output_dir / "versions"

    assert metadata_path.exists()
    assert transcript_path.exists()
    assert summary_path.exists()
    assert quality_report_path.exists()
    assert scene_cards_path.exists()
    assert image_dir.is_dir()
    assert versions_dir.is_dir()
    assert "第一句" in transcript_path.read_text(encoding="utf-8")
    saved_metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    assert saved_metadata["title"] == "测试标题"
    assert "# 测试标题" in summary_path.read_text(encoding="utf-8")


def test_save_summary_artifacts_keeps_version_history_and_manifest(tmp_path: Path) -> None:
    metadata = VideoMetadata(
        source_url="https://b23.tv/1SzaT3c",
        canonical_url="https://www.bilibili.com/video/BV1xx411c7mD?p=1",
        title="测试标题",
        uploader="测试作者",
        description="测试简介",
        video_id="BV1xx411c7mD",
        platform=VideoPlatform.BILIBILI,
    )
    document = SummaryDocument(
        metadata=metadata,
        abstract="这是摘要。",
        bullets=["要点一"],
        transcript_segments=[
            TranscriptSegment(start_seconds=0.0, end_seconds=1.0, text="第一句")
        ],
        chapters=[
            SummaryChapter(
                title="章节一",
                goal="理解重点。",
                key_points=["要点一"],
                example_or_case="案例：第一句。",
                caution="注意：不要漏记时间。",
                anchor_start_seconds=0.0,
                anchor_end_seconds=60.0,
                screenshot_paths=[],
            )
        ],
    )

    first_output_dir = save_summary_artifacts(
        document,
        tmp_path,
        run_options={
            "transcriber": "none",
            "whisper_model": "tiny",
            "screenshot_mode": "quick",
            "screenshot_count": 3,
            "summary_style": "default",
        },
        generated_at=datetime.fromisoformat("2026-03-21T10:00:00+08:00"),
    )
    second_output_dir = save_summary_artifacts(
        document,
        tmp_path,
        run_options={
            "transcriber": "faster-whisper",
            "whisper_model": "small",
            "screenshot_mode": "smart",
            "screenshot_count": 3,
            "summary_style": "default",
        },
        generated_at=datetime.fromisoformat("2026-03-21T10:00:00+08:00"),
    )

    assert first_output_dir == second_output_dir

    versions_root = second_output_dir / "versions"
    version_directories = sorted(path for path in versions_root.iterdir() if path.is_dir())
    manifest_path = versions_root / "manifest.json"
    chapters_path = versions_root / "20260321-100000" / "chapters.json"
    screenshot_caption_blocks_path = versions_root / "20260321-100000" / "screenshot_caption_blocks.json"
    scene_cards_path = versions_root / "20260321-100000" / "scene_cards.json"
    quality_report_path = versions_root / "20260321-100000" / "quality_report.json"

    assert len(version_directories) == 2
    assert (version_directories[0] / build_summary_markdown_filename(metadata.title)).exists()
    assert (version_directories[0] / "metadata.json").exists()
    assert (version_directories[0] / "transcript.txt").exists()
    assert chapters_path.exists()
    assert screenshot_caption_blocks_path.exists()
    assert scene_cards_path.exists()
    assert quality_report_path.exists()
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert len(manifest["versions"]) == 2
    assert manifest["latest_version"] == "20260321-100000-02"
    assert manifest["latest_generated_at"] == "2026-03-21T10:00:00+08:00"
    assert manifest["latest_run_options"]["screenshot_mode"] == "smart"
    assert manifest["summary_quality_mode"] == "chaptered-tutorial"
    assert manifest["chapter_count"] == 1
    assert manifest["scene_card_count"] == 0
    assert manifest["key_segment_strategy"] == "per-chapter"
    assert manifest["screenshot_binding"] == "per-chapter"
    assert manifest["latest_screenshot_count"] == 0
    assert manifest["duplicate_caption_path_count"] == 0
    assert manifest["versions"][0]["summary_quality_mode"] == "chaptered-tutorial"
    assert manifest["versions"][0]["chapter_count"] == 1
    assert manifest["versions"][0]["scene_card_count"] == 0
    assert manifest["versions"][0]["key_segment_strategy"] == "per-chapter"
    assert manifest["versions"][0]["screenshot_binding"] == "per-chapter"
    assert manifest["versions"][0]["run_options"]["screenshot_mode"] == "smart"
    assert manifest["versions"][1]["run_options"]["screenshot_mode"] == "quick"
    assert manifest["versions"][0]["version_id"] != manifest["versions"][1]["version_id"]
    assert (
        manifest["versions"][0]["files"]["screenshot_caption_blocks_json"]
        == "versions/20260321-100000-02/screenshot_caption_blocks.json"
    )
    assert manifest["versions"][0]["files"]["scene_cards_json"] == "versions/20260321-100000-02/scene_cards.json"
    assert manifest["versions"][0]["files"]["quality_report_json"] == "versions/20260321-100000-02/quality_report.json"
    assert manifest["versions"][0]["files"]["summary_md"].endswith(f"/{build_summary_markdown_filename(metadata.title)}")


def test_save_summary_artifacts_copies_referenced_screenshots_into_version_snapshot(tmp_path: Path) -> None:
    metadata = VideoMetadata(
        source_url="https://b23.tv/1SzaT3c",
        canonical_url="https://www.bilibili.com/video/BV1xx411c7mD?p=1",
        title="测试标题",
        uploader="测试作者",
        description="测试简介",
        video_id="BV1xx411c7mD",
        platform=VideoPlatform.BILIBILI,
    )
    output_dir = build_output_directory(tmp_path, metadata.title, metadata.video_id)
    assets_dir = build_document_assets_directory(metadata.title)
    screenshot_path = output_dir / assets_dir / "frame-001-000010.jpg"
    screenshot_path.parent.mkdir(parents=True, exist_ok=True)
    screenshot_path.write_bytes(b"fake-jpeg")
    document = SummaryDocument(
        metadata=metadata,
        abstract="这是摘要。",
        bullets=["要点一"],
        transcript_segments=[
            TranscriptSegment(start_seconds=10.0, end_seconds=11.0, text="第一句")
        ],
        screenshots=[
            ScreenshotAsset(
                timestamp_seconds=10.0,
                relative_path=(assets_dir / "frame-001-000010.jpg").as_posix(),
                alt_text="关键画面 1",
            )
        ],
    )

    save_summary_artifacts(
        document,
        tmp_path,
        run_options={"screenshot_mode": "smart", "screenshot_count": 1},
        generated_at=datetime.fromisoformat("2026-03-21T10:05:00+08:00"),
    )

    copied_screenshot = output_dir / "versions" / "20260321-100500" / assets_dir / "frame-001-000010.jpg"
    manifest = json.loads((output_dir / "versions" / "manifest.json").read_text(encoding="utf-8"))

    assert copied_screenshot.exists()
    assert manifest["versions"][0]["files"]["screenshots"] == [
        f"versions/20260321-100500/{assets_dir.as_posix()}/frame-001-000010.jpg"
    ]


def test_save_summary_artifacts_writes_screenshot_caption_blocks_snapshot(tmp_path: Path) -> None:
    metadata = VideoMetadata(
        source_url="https://b23.tv/1SzaT3c",
        canonical_url="https://www.bilibili.com/video/BV1xx411c7mD?p=1",
        title="测试标题",
        uploader="测试作者",
        description="测试简介",
        video_id="BV1xx411c7mD",
        platform=VideoPlatform.BILIBILI,
    )
    document = SummaryDocument(
        metadata=metadata,
        abstract="这是摘要。",
        bullets=["要点一"],
        transcript_segments=[
            TranscriptSegment(start_seconds=10.0, end_seconds=12.0, text="第一句"),
        ],
        screenshot_caption_blocks=[
            ScreenshotCaptionBlock(
                screenshot_relative_path="img/smart/frame-001-000010.jpg",
                screenshot_alt_text="关键画面 1",
                screenshot_timestamp_seconds=10.0,
                chapter_title="章节一",
                window_start_seconds=8.0,
                window_end_seconds=18.0,
                narration_lines=["第一句", "第二句"],
            )
        ],
    )

    output_dir = save_summary_artifacts(
        document,
        tmp_path,
        run_options={"screenshot_mode": "smart", "screenshot_count": 1},
        generated_at=datetime.fromisoformat("2026-03-21T10:10:00+08:00"),
    )

    blocks_path = output_dir / "versions" / "20260321-101000" / "screenshot_caption_blocks.json"
    scene_cards_path = output_dir / "versions" / "20260321-101000" / "scene_cards.json"
    quality_report_path = output_dir / "versions" / "20260321-101000" / "quality_report.json"
    manifest = json.loads((output_dir / "versions" / "manifest.json").read_text(encoding="utf-8"))
    blocks_payload = json.loads(blocks_path.read_text(encoding="utf-8"))
    scene_cards_payload = json.loads(scene_cards_path.read_text(encoding="utf-8"))
    quality_report_payload = json.loads(quality_report_path.read_text(encoding="utf-8"))

    assert blocks_path.exists()
    assert scene_cards_path.exists()
    assert quality_report_path.exists()
    assert blocks_payload[0]["chapter_title"] == "章节一"
    assert blocks_payload[0]["narration_lines"] == ["第一句", "第二句"]
    assert scene_cards_payload[0]["chapter_title"] == "章节一"
    assert quality_report_payload["scene_card_count"] == 1
    assert manifest["versions"][0]["files"]["screenshot_caption_blocks_json"] == (
        "versions/20260321-101000/screenshot_caption_blocks.json"
    )
    assert manifest["versions"][0]["files"]["scene_cards_json"] == "versions/20260321-101000/scene_cards.json"
    assert manifest["versions"][0]["files"]["quality_report_json"] == "versions/20260321-101000/quality_report.json"


def test_save_summary_artifacts_sorts_manifest_versions_by_real_latest_time(tmp_path: Path) -> None:
    metadata = VideoMetadata(
        source_url="https://b23.tv/1SzaT3c",
        canonical_url="https://www.bilibili.com/video/BV1xx411c7mD?p=1",
        title="测试标题",
        uploader="测试作者",
        description="测试简介",
        video_id="BV1xx411c7mD",
        platform=VideoPlatform.BILIBILI,
    )
    document = SummaryDocument(
        metadata=metadata,
        abstract="这是摘要。",
        bullets=["要点一"],
        transcript_segments=[
            TranscriptSegment(start_seconds=0.0, end_seconds=1.0, text="第一句")
        ],
    )

    save_summary_artifacts(
        document,
        tmp_path,
        run_options={"screenshot_mode": "smart"},
        generated_at=datetime.fromisoformat("2026-03-21T10:05:00+08:00"),
    )
    save_summary_artifacts(
        document,
        tmp_path,
        run_options={"screenshot_mode": "quick"},
        generated_at=datetime.fromisoformat("2026-03-21T10:00:00+08:00"),
    )

    output_dir = build_output_directory(tmp_path, metadata.title, metadata.video_id)
    manifest = json.loads((output_dir / "versions" / "manifest.json").read_text(encoding="utf-8"))

    assert manifest["latest_version"] == "20260321-100500"
    assert manifest["latest_run_options"]["screenshot_mode"] == "smart"
    assert manifest["versions"][0]["version_id"] == "20260321-100500"
    assert manifest["versions"][1]["version_id"] == "20260321-100000"

from video_summary_cli.artifact_writer import build_artifact_payloads
from video_summary_cli.models import (
    ScreenshotCaptionBlock,
    SummaryChapter,
    SummaryDocument,
    TranscriptSegment,
    VideoMetadata,
    VideoPlatform,
)


def test_build_artifact_payloads_collects_root_and_version_content() -> None:
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
            TranscriptSegment(start_seconds=10.0, end_seconds=12.0, text="第一句。"),
        ],
        screenshot_caption_blocks=[
            ScreenshotCaptionBlock(
                screenshot_relative_path="img/smart/frame-001-000010.jpg",
                screenshot_alt_text="关键画面",
                screenshot_timestamp_seconds=10.0,
                chapter_title="章节一",
                window_start_seconds=8.0,
                window_end_seconds=18.0,
                narration_lines=["第一句。"],
            ),
            ScreenshotCaptionBlock(
                screenshot_relative_path="img/smart/frame-002-000012.jpg",
                screenshot_alt_text="关键画面",
                screenshot_timestamp_seconds=12.0,
                chapter_title="章节一",
                window_start_seconds=11.0,
                window_end_seconds=19.0,
                narration_lines=["第一句。", "第二句。"],
            )
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

    payloads = build_artifact_payloads(document, summary_style="tutorial-note")

    assert payloads.metadata_payload["platform"] == "bilibili"
    assert payloads.transcript_text == "第一句。"
    assert payloads.summary_markdown.startswith("# 测试标题\n")
    assert payloads.chapters_payload[0]["title"] == "章节一"
    assert payloads.screenshot_caption_blocks_payload[0]["chapter_title"] == "章节一"
    assert len(payloads.scene_cards_payload) == 1
    assert payloads.scene_cards_payload[0]["source_screenshot_paths"] == [
        "img/smart/frame-001-000010.jpg",
        "img/smart/frame-002-000012.jpg",
    ]
    assert payloads.quality_report_payload["raw_screenshot_count"] == 0
    assert payloads.quality_report_payload["raw_caption_block_count"] == 2
    assert payloads.quality_report_payload["scene_card_count"] == 1
    assert payloads.quality_report_payload["duplicate_caption_path_count"] == 0

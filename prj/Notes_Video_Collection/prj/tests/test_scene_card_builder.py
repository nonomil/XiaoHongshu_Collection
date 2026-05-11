from video_summary_cli.models import ScreenshotCaptionBlock
from video_summary_cli.scene_card_builder import build_scene_cards


def test_build_scene_cards_merges_neighbor_blocks_into_single_scene() -> None:
    blocks = [
        ScreenshotCaptionBlock(
            screenshot_relative_path="img/a.jpg",
            screenshot_alt_text="关键画面 1",
            screenshot_timestamp_seconds=10.0,
            chapter_title="章节一",
            window_start_seconds=8.0,
            window_end_seconds=12.0,
            narration_lines=["先展示目标。"],
        ),
        ScreenshotCaptionBlock(
            screenshot_relative_path="img/b.jpg",
            screenshot_alt_text="关键画面 2",
            screenshot_timestamp_seconds=12.5,
            chapter_title="章节一",
            window_start_seconds=11.0,
            window_end_seconds=18.0,
            narration_lines=["先展示目标。", "再解释为什么要这样做。"],
            ocr_text="步骤说明",
        ),
        ScreenshotCaptionBlock(
            screenshot_relative_path="img/c.jpg",
            screenshot_alt_text="关键画面 3",
            screenshot_timestamp_seconds=30.0,
            chapter_title="章节一",
            window_start_seconds=28.0,
            window_end_seconds=35.0,
            narration_lines=["切换到下一个界面。"],
        ),
    ]

    scene_cards = build_scene_cards(
        blocks,
        title_resolver=lambda block: "场景一" if block.screenshot_timestamp_seconds < 20.0 else "场景二",
    )

    assert len(scene_cards) == 2
    assert scene_cards[0].title == "场景一"
    assert scene_cards[0].screenshot_relative_path == "img/b.jpg"
    assert scene_cards[0].source_screenshot_paths == ["img/a.jpg", "img/b.jpg"]
    assert scene_cards[0].narration_lines == ["先展示目标。", "再解释为什么要这样做。"]
    assert scene_cards[1].title == "场景二"
    assert scene_cards[1].source_screenshot_paths == ["img/c.jpg"]

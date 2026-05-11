from video_summary_cli.models import ScreenshotAsset, SummaryChapter, TranscriptSegment
from video_summary_cli.screenshot_caption_builder import build_screenshot_caption_blocks


def test_build_screenshot_caption_blocks_binds_neighbor_transcript_lines() -> None:
    chapters = [
        SummaryChapter(
            title="章节一",
            goal="目标一",
            key_points=["要点一", "要点二"],
            example_or_case="案例一",
            caution="注意一",
            anchor_start_seconds=0.0,
            anchor_end_seconds=100.0,
            screenshot_paths=["img/smart/frame-001.jpg"],
        )
    ]
    screenshots = [
        ScreenshotAsset(timestamp_seconds=20.0, relative_path="img/smart/frame-001.jpg", alt_text="关键画面 1"),
        ScreenshotAsset(timestamp_seconds=40.0, relative_path="img/smart/frame-002.jpg", alt_text="关键画面 2"),
        ScreenshotAsset(timestamp_seconds=60.0, relative_path="img/smart/frame-003.jpg", alt_text="关键画面 3"),
    ]
    transcript_segments = [
        TranscriptSegment(start_seconds=12.0, end_seconds=18.0, text="第一张图前后的讲解。"),
        TranscriptSegment(start_seconds=19.0, end_seconds=27.0, text="这里解释第一张图里的阶段划分。"),
        TranscriptSegment(start_seconds=24.0, end_seconds=29.0, text="这一句也属于第一张图的字幕。"),
        TranscriptSegment(start_seconds=31.0, end_seconds=45.0, text="这里解释第二张图里的结构变化。"),
        TranscriptSegment(start_seconds=50.0, end_seconds=68.0, text="这里解释第三张图里的落地建议。"),
    ]

    blocks = build_screenshot_caption_blocks(
        transcript_segments=transcript_segments,
        screenshots=screenshots,
        chapters=chapters,
    )

    assert len(blocks) == 3
    assert blocks[0].chapter_title == "章节一"
    assert "第一张图前后的讲解。" in blocks[0].narration_lines
    assert "这里解释第一张图里的阶段划分。" in blocks[0].narration_lines
    assert "这一句也属于第一张图的字幕。" in blocks[0].narration_lines
    assert blocks[1].window_start_seconds < blocks[1].screenshot_timestamp_seconds < blocks[1].window_end_seconds
    assert "这里解释第二张图里的结构变化。" in blocks[1].narration_lines


def test_build_screenshot_caption_blocks_falls_back_to_nearest_segment_when_window_is_empty() -> None:
    screenshots = [
        ScreenshotAsset(timestamp_seconds=80.0, relative_path="img/smart/frame-001.jpg", alt_text="关键画面 1"),
    ]
    transcript_segments = [
        TranscriptSegment(start_seconds=60.0, end_seconds=66.0, text="这一段离截图最近。"),
        TranscriptSegment(start_seconds=10.0, end_seconds=16.0, text="这一段离截图很远。"),
    ]

    blocks = build_screenshot_caption_blocks(
        transcript_segments=transcript_segments,
        screenshots=screenshots,
        chapters=[],
    )

    assert len(blocks) == 1
    assert blocks[0].narration_lines == ["这一段离截图最近。"]


def test_build_screenshot_caption_blocks_expands_short_fragments_and_keeps_ocr_text() -> None:
    chapters = [
        SummaryChapter(
            title="新手父母为什么要系统学习",
            goal="目标一",
            key_points=["要点一", "要点二"],
            example_or_case="",
            caution="",
            anchor_start_seconds=0.0,
            anchor_end_seconds=100.0,
            screenshot_paths=["img/smart/frame-001.jpg"],
        )
    ]
    screenshots = [
        ScreenshotAsset(
            timestamp_seconds=32.0,
            relative_path="img/smart/frame-001.jpg",
            alt_text="关键画面 1",
            ocr_text="新手父母应该系统学习育儿知识",
        ),
        ScreenshotAsset(
            timestamp_seconds=40.0,
            relative_path="img/smart/frame-002.jpg",
            alt_text="关键画面 2",
        ),
    ]
    transcript_segments = [
        TranscriptSegment(start_seconds=26.0, end_seconds=30.0, text="并且他的回答是没有那么成体系的。"),
        TranscriptSegment(start_seconds=30.0, end_seconds=31.0, text="这样呢。"),
        TranscriptSegment(start_seconds=31.0, end_seconds=33.0, text="然后第二点呢，我是觉得说。"),
        TranscriptSegment(start_seconds=33.0, end_seconds=37.0, text="就是作为现在的新手家长。"),
        TranscriptSegment(start_seconds=37.0, end_seconds=43.0, text="我们去搭建这么一套婴儿体系。"),
    ]

    blocks = build_screenshot_caption_blocks(
        transcript_segments=transcript_segments,
        screenshots=screenshots,
        chapters=chapters,
    )

    assert len(blocks) == 2
    assert blocks[0].ocr_text == "新手父母应该系统学习育儿知识"
    assert "并且他的回答是没有那么成体系的。" in blocks[0].narration_lines
    assert "就是作为现在的新手家长。" in blocks[0].narration_lines
    assert "这样呢。" not in blocks[0].narration_lines


def test_build_screenshot_caption_blocks_expands_low_signal_lines_toward_meaningful_context() -> None:
    chapters = [
        SummaryChapter(
            title="新手父母为什么要系统学习",
            goal="目标",
            key_points=["要点一", "要点二"],
            example_or_case="",
            caution="",
            anchor_start_seconds=208.0,
            anchor_end_seconds=220.0,
            screenshot_paths=["img/smart/frame-023.jpg"],
        )
    ]
    screenshots = [
        ScreenshotAsset(timestamp_seconds=210.0, relative_path="img/smart/frame-021.jpg", alt_text="关键画面 21"),
        ScreenshotAsset(timestamp_seconds=213.0, relative_path="img/smart/frame-022.jpg", alt_text="关键画面 22"),
        ScreenshotAsset(timestamp_seconds=216.0, relative_path="img/smart/frame-023.jpg", alt_text="关键画面 23"),
    ]
    transcript_segments = [
        TranscriptSegment(start_seconds=209.0, end_seconds=211.0, text="并且他的回答是没有那么成体系的。"),
        TranscriptSegment(start_seconds=211.2, end_seconds=212.0, text="这样呢。"),
        TranscriptSegment(start_seconds=212.2, end_seconds=213.0, text="然后第二点我是觉得说。"),
        TranscriptSegment(start_seconds=214.6, end_seconds=216.1, text="就是作为现在的新手家长。"),
        TranscriptSegment(start_seconds=216.2, end_seconds=219.0, text="如果没有权威来源，你是不能够完全信任的。"),
    ]

    blocks = build_screenshot_caption_blocks(
        transcript_segments=transcript_segments,
        screenshots=screenshots,
        chapters=chapters,
    )

    assert len(blocks) == 3
    assert blocks[1].chapter_title == "新手父母为什么要系统学习"
    assert len(blocks[1].narration_lines) >= 3
    assert "并且他的回答是没有那么成体系的。" in blocks[1].narration_lines
    assert "就是作为现在的新手家长。" in blocks[1].narration_lines
    assert "如果没有权威来源，你是不能够完全信任的。" in blocks[1].narration_lines


def test_build_screenshot_caption_blocks_keeps_segments_that_overlap_window_edges() -> None:
    screenshots = [
        ScreenshotAsset(timestamp_seconds=15.0, relative_path="img/smart/frame-001.jpg", alt_text="关键画面 1"),
        ScreenshotAsset(timestamp_seconds=25.0, relative_path="img/smart/frame-002.jpg", alt_text="关键画面 2"),
    ]
    transcript_segments = [
        TranscriptSegment(
            start_seconds=8.0,
            end_seconds=12.0,
            text="这一句虽然中点在窗口外，但和第一张截图的时间窗有重叠。",
        ),
        TranscriptSegment(
            start_seconds=12.2,
            end_seconds=17.0,
            text="这一句完整解释第一张截图里的关键动作。",
        ),
        TranscriptSegment(
            start_seconds=21.0,
            end_seconds=28.0,
            text="第二张截图对应后续界面变化。",
        ),
    ]

    blocks = build_screenshot_caption_blocks(
        transcript_segments=transcript_segments,
        screenshots=screenshots,
        chapters=[],
    )

    assert len(blocks) == 2
    assert "这一句虽然中点在窗口外，但和第一张截图的时间窗有重叠。" in blocks[0].narration_lines
    assert "这一句完整解释第一张截图里的关键动作。" in blocks[0].narration_lines


def test_build_screenshot_caption_blocks_keeps_full_window_narration_by_default() -> None:
    screenshots = [
        ScreenshotAsset(timestamp_seconds=30.0, relative_path="img/smart/frame-001.jpg", alt_text="关键画面 1"),
        ScreenshotAsset(timestamp_seconds=60.0, relative_path="img/smart/frame-002.jpg", alt_text="关键画面 2"),
    ]
    transcript_segments = [
        TranscriptSegment(start_seconds=16.0, end_seconds=18.0, text="先展示为什么要建立这个育儿知识库。"),
        TranscriptSegment(start_seconds=18.0, end_seconds=20.0, text="接着解释资料必须来自权威来源。"),
        TranscriptSegment(start_seconds=20.0, end_seconds=23.0, text="然后说明导入后的知识库可以持续追问。"),
        TranscriptSegment(start_seconds=23.0, end_seconds=27.0, text="这一段继续介绍提问时可以围绕真实育儿场景。"),
        TranscriptSegment(start_seconds=27.0, end_seconds=34.0, text="接着补充为什么回答需要能看到出处和引用。"),
        TranscriptSegment(start_seconds=34.0, end_seconds=42.0, text="最后强调如果没有来源就不要直接照着执行。"),
    ]

    blocks = build_screenshot_caption_blocks(
        transcript_segments=transcript_segments,
        screenshots=screenshots,
        chapters=[],
    )

    assert len(blocks) == 2
    assert blocks[0].narration_lines == [
        "先展示为什么要建立这个育儿知识库。",
        "接着解释资料必须来自权威来源。",
        "然后说明导入后的知识库可以持续追问。",
        "这一段继续介绍提问时可以围绕真实育儿场景。",
        "接着补充为什么回答需要能看到出处和引用。",
        "最后强调如果没有来源就不要直接照着执行。",
    ]


def test_build_screenshot_caption_blocks_uses_full_chapter_window_for_single_screenshot_chapter() -> None:
    chapters = [
        SummaryChapter(
            title="快速搭建体系并完成知识内化",
            goal="把方法和知识内化串起来。",
            key_points=["快速搭建体系", "帮助知识内化"],
            example_or_case="",
            caution="",
            anchor_start_seconds=230.0,
            anchor_end_seconds=260.0,
            screenshot_paths=["img/smart/frame-012.jpg"],
        )
    ]
    screenshots = [
        ScreenshotAsset(
            timestamp_seconds=242.0,
            relative_path="img/smart/frame-012.jpg",
            alt_text="关键画面 12",
        )
    ]
    transcript_segments = [
        TranscriptSegment(start_seconds=230.5, end_seconds=235.0, text="对于新手父母来说，系统学习其实非常困难。"),
        TranscriptSegment(start_seconds=236.0, end_seconds=241.0, text="NotebookLM 给我们提供了一套非常快速高效的体系搭建方法。"),
        TranscriptSegment(start_seconds=242.0, end_seconds=248.0, text="它还能帮助我们把这些内容更快地完成知识内化。"),
        TranscriptSegment(start_seconds=251.0, end_seconds=258.0, text="这套方法对我的帮助非常大，所以我想把它分享给大家。"),
    ]

    blocks = build_screenshot_caption_blocks(
        transcript_segments=transcript_segments,
        screenshots=screenshots,
        chapters=chapters,
    )

    assert len(blocks) == 1
    assert blocks[0].window_start_seconds == 230.5
    assert blocks[0].window_end_seconds == 258.0
    assert blocks[0].narration_lines == [
        "对于新手父母来说，系统学习其实非常困难。",
        "NotebookLM 给我们提供了一套非常快速高效的体系搭建方法。",
        "它还能帮助我们把这些内容更快地完成知识内化。",
        "这套方法对我的帮助非常大，所以我想把它分享给大家。",
    ]


def test_build_screenshot_caption_blocks_merges_duplicate_assignments_for_same_screenshot() -> None:
    chapters = [
        SummaryChapter(
            title="权威来源与回答可信度",
            goal="理解来源的重要性。",
            key_points=["查看来源"],
            example_or_case="",
            caution="",
            anchor_start_seconds=0.0,
            anchor_end_seconds=24.0,
            screenshot_paths=["img/smart/frame-001.jpg"],
        ),
        SummaryChapter(
            title="权威来源与回答可信度",
            goal="理解来源的重要性。",
            key_points=["查看来源"],
            example_or_case="",
            caution="",
            anchor_start_seconds=18.0,
            anchor_end_seconds=40.0,
            screenshot_paths=["img/smart/frame-001.jpg"],
        ),
    ]
    screenshots = [
        ScreenshotAsset(timestamp_seconds=24.0, relative_path="img/smart/frame-001.jpg", alt_text="关键画面 1"),
    ]
    transcript_segments = [
        TranscriptSegment(start_seconds=16.0, end_seconds=20.0, text="前一段先强调回答必须有权威来源。"),
        TranscriptSegment(start_seconds=24.0, end_seconds=30.0, text="后一段继续解释为什么要核对出处。"),
    ]

    blocks = build_screenshot_caption_blocks(
        transcript_segments=transcript_segments,
        screenshots=screenshots,
        chapters=chapters,
    )

    assert len(blocks) == 1
    assert blocks[0].chapter_title == "权威来源与回答可信度"
    assert blocks[0].narration_lines == [
        "前一段先强调回答必须有权威来源。",
        "后一段继续解释为什么要核对出处。",
    ]

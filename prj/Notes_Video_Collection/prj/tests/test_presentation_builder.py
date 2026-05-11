from video_summary_cli.models import (
    ScreenshotAsset,
    ScreenshotCaptionBlock,
    SummaryChapter,
    SummaryDocument,
    TranscriptSegment,
    VideoMetadata,
    VideoPlatform,
)
from video_summary_cli.presentation_builder import build_summary_presentation


def test_build_summary_presentation_groups_sections_for_tutorial_note() -> None:
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
        bullets=["步骤一", "步骤二"],
        transcript_segments=[
            TranscriptSegment(start_seconds=10.0, end_seconds=12.0, text="先判断学习目标。"),
            TranscriptSegment(start_seconds=15.0, end_seconds=18.0, text="再决定记录方式。"),
        ],
        screenshots=[
            ScreenshotAsset(
                timestamp_seconds=10.0,
                relative_path="img/smart/frame-001-000010.jpg",
                alt_text="关键画面 1",
            )
        ],
        screenshot_caption_blocks=[
            ScreenshotCaptionBlock(
                screenshot_relative_path="img/smart/frame-001-000010.jpg",
                screenshot_alt_text="关键画面 1",
                screenshot_timestamp_seconds=10.0,
                chapter_title="建立判断标准",
                window_start_seconds=8.0,
                window_end_seconds=20.0,
                narration_lines=["先判断学习目标。", "再决定记录方式。"],
            )
        ],
        chapters=[
            SummaryChapter(
                title="建立判断标准",
                goal="理解教程的主目标。",
                key_points=["先判断学习目标", "再决定记录方式"],
                example_or_case="案例：先列问题清单再看视频。",
                caution="注意不要机械抄字幕。",
                anchor_start_seconds=10.0,
                anchor_end_seconds=120.0,
                screenshot_paths=["img/smart/frame-001-000010.jpg"],
            )
        ],
    )

    presentation = build_summary_presentation(document, summary_style="tutorial-note")

    headings = [(section.level, section.heading) for section in presentation.sections]
    assert presentation.title == "测试标题"
    assert headings[:4] == [
        (2, "基础信息"),
        (2, "AI 总结"),
        (2, "关键信息"),
        (2, "标签"),
    ]
    assert headings[4:] == [
        (2, "学习目标"),
        (2, "关键片段"),
        (2, "章节拆解"),
    ]
    assert "- 平台：`bilibili`" in presentation.sections[0].lines
    chapter_lines = "\n".join(presentation.sections[-1].lines)
    assert "### 建立判断标准" in chapter_lines
    assert "#### 1.1 先判断学习目标" in chapter_lines


def test_build_summary_presentation_uses_neutral_preface_for_notebooklm_parenting_video() -> None:
    metadata = VideoMetadata(
        source_url="http://xhslink.com/o/AzAqWIsKgst",
        canonical_url="https://www.xiaohongshu.com/explore/69bbc03d00000000230109d9",
        title="notebooklm建立育儿知识库",
        uploader="高啃菜",
        description=(
            "我建议所有的父母都尝试用Notebooklm建立一个个人育儿知识库"
            "#AI工具[话题]# #AI育儿[话题]# #我的育儿理念[话题]#"
        ),
        video_id="69bbc03d00000000230109d9",
        platform=VideoPlatform.XIAOHONGSHU,
        tags=["AI工具", "AI育儿", "我的育儿理念"],
    )
    document = SummaryDocument(
        metadata=metadata,
        abstract="演示如何用 NotebookLM 搭建个人育儿知识库，并比较不同 AI 回答质量。",
        bullets=[
            "把权威资料导入 NotebookLM，搭建个人育儿知识库。",
            "通过真实问题测试回答是否有出处和来源。",
            "对比通用 AI 回答是否足够成体系。",
        ],
        transcript_segments=[
            TranscriptSegment(start_seconds=10.0, end_seconds=14.0, text="先用权威资料搭建个人育儿知识库。"),
            TranscriptSegment(start_seconds=80.0, end_seconds=86.0, text="再提问 0 到 1 岁婴儿照护问题。"),
        ],
        chapters=[
            SummaryChapter(
                title="NotebookLM 与育儿知识库搭建",
                goal="理解如何用 NotebookLM 搭建个人育儿知识库。",
                key_points=["导入权威资料", "先建立个人知识底座"],
                example_or_case="案例：把 WHO 和国家卫健委资料导入知识库。",
                caution="注意不要只依赖没有来源的回答。",
                anchor_start_seconds=0.0,
                anchor_end_seconds=60.0,
                screenshot_paths=[],
            ),
            SummaryChapter(
                title="权威来源与回答可信度",
                goal="理解为什么回答必须能追溯到权威来源。",
                key_points=["优先查看出处", "减少幻觉和编造"],
                example_or_case="案例：回答引用 WHO 与国家卫生健康委员会指南。",
                caution="注意区分有来源和无来源的内容。",
                anchor_start_seconds=60.0,
                anchor_end_seconds=120.0,
                screenshot_paths=[],
            ),
            SummaryChapter(
                title="对比通用 AI 的幻觉风险",
                goal="识别通用 AI 在体系化回答上的局限。",
                key_points=["回答可能不成体系", "数字未必可追溯"],
                example_or_case="案例：对比豆包与 DeepSeek 的回答。",
                caution="注意不要把看起来精准的数据直接当结论。",
                anchor_start_seconds=120.0,
                anchor_end_seconds=180.0,
                screenshot_paths=[],
            ),
        ],
    )

    presentation = build_summary_presentation(document, summary_style="tutorial-note")
    section_lookup = {section.heading: section.lines for section in presentation.sections}
    ai_summary = section_lookup["AI 总结"][0]
    key_info = "\n".join(section_lookup["关键信息"])
    tags = section_lookup["标签"][0]
    learning_goal = section_lookup["学习目标"][0]

    assert "NotebookLM 与育儿知识库搭建" in ai_summary
    assert "权威来源与回答可信度" in ai_summary
    assert "对比通用 AI 的幻觉风险" in ai_summary
    assert "把 AI 当成执行器" not in ai_summary
    assert "工作流和上下文资产" not in ai_summary
    assert "AI 时代的学习与开发框架" not in learning_goal
    assert "育儿知识库" in learning_goal
    assert "章节数：3" in key_info
    assert "`AI育儿`" in tags
    assert "`NotebookLM`" in tags
    assert "`育儿知识库`" in tags
    assert "`权威来源`" in tags
    assert "`xiaohongshu`" not in tags
    assert "`我的育儿理念`" not in tags
    assert "`Worktree`" not in tags


def test_build_summary_presentation_merges_nearby_duplicate_visual_cards() -> None:
    metadata = VideoMetadata(
        source_url="http://xhslink.com/o/AzAqWIsKgst",
        canonical_url="https://www.xiaohongshu.com/explore/69bbc03d00000000230109d9",
        title="notebooklm建立育儿知识库",
        uploader="高啃菜",
        description="",
        video_id="69bbc03d00000000230109d9",
        platform=VideoPlatform.XIAOHONGSHU,
    )
    chapter = SummaryChapter(
        title="新手父母为什么要系统学习",
        goal="理解为什么要系统学习。",
        key_points=["先识别问题", "再判断是否可信"],
        example_or_case="",
        caution="注意核对来源。",
        anchor_start_seconds=200.0,
        anchor_end_seconds=220.0,
        screenshot_paths=[],
    )
    document = SummaryDocument(
        metadata=metadata,
        abstract="",
        bullets=[],
        transcript_segments=[],
        screenshots=[
            ScreenshotAsset(timestamp_seconds=212.9, relative_path="img/a.jpg", alt_text="关键画面 1"),
            ScreenshotAsset(timestamp_seconds=215.4, relative_path="img/b.jpg", alt_text="关键画面 2"),
        ],
        screenshot_caption_blocks=[
            ScreenshotCaptionBlock(
                screenshot_relative_path="img/a.jpg",
                screenshot_alt_text="关键画面 1",
                screenshot_timestamp_seconds=212.9,
                chapter_title=chapter.title,
                window_start_seconds=211.0,
                window_end_seconds=213.0,
                narration_lines=["这样呢"],
            ),
            ScreenshotCaptionBlock(
                screenshot_relative_path="img/b.jpg",
                screenshot_alt_text="关键画面 2",
                screenshot_timestamp_seconds=215.4,
                chapter_title=chapter.title,
                window_start_seconds=214.0,
                window_end_seconds=216.0,
                narration_lines=["这样呢", "然后第二点我是觉得说"],
            ),
        ],
        chapters=[chapter],
    )

    presentation = build_summary_presentation(document, summary_style="tutorial-note")
    chapter_lines = "\n".join(presentation.sections[-1].lines)
    key_info_lines = "\n".join(presentation.sections[2].lines)

    assert chapter_lines.count("#### 1.1") == 1
    assert "#### 1.2" not in chapter_lines
    assert "### 未归类画面" not in chapter_lines
    assert "截图数：1" in key_info_lines


def test_build_summary_presentation_uses_visual_explanation_label_for_tutorial_note() -> None:
    metadata = VideoMetadata(
        source_url="http://xhslink.com/o/AzAqWIsKgst",
        canonical_url="https://www.xiaohongshu.com/explore/69bbc03d00000000230109d9",
        title="notebooklm建立育儿知识库",
        uploader="高啃菜",
        description="",
        video_id="69bbc03d00000000230109d9",
        platform=VideoPlatform.XIAOHONGSHU,
    )
    chapter = SummaryChapter(
        title="NotebookLM 与育儿知识库搭建",
        goal="理解如何搭建个人知识库。",
        key_points=["导入资料", "围绕真实问题追问"],
        example_or_case="",
        caution="注意核对来源。",
        anchor_start_seconds=20.0,
        anchor_end_seconds=60.0,
        screenshot_paths=["img/notebooklm建立育儿知识库.assets/frame-002-000027.jpg"],
    )
    document = SummaryDocument(
        metadata=metadata,
        abstract="",
        bullets=[],
        transcript_segments=[],
        screenshots=[
            ScreenshotAsset(
                timestamp_seconds=27.38,
                relative_path="img/notebooklm建立育儿知识库.assets/frame-002-000027.jpg",
                alt_text="关键画面 2",
            )
        ],
        screenshot_caption_blocks=[
            ScreenshotCaptionBlock(
                screenshot_relative_path="img/notebooklm建立育儿知识库.assets/frame-002-000027.jpg",
                screenshot_alt_text="关键画面 2",
                screenshot_timestamp_seconds=27.38,
                chapter_title=chapter.title,
                window_start_seconds=16.12,
                window_end_seconds=42.0,
                narration_lines=[
                    "这个 NotebookLM 上手会非常容易。",
                    "它可以把本地或网络上的权威资料导入到自己的知识库里。",
                    "后面还可以继续围绕这个知识库追问具体问题。",
                    "如果回答没有出处，就不要直接拿来照做。",
                ],
            )
        ],
        chapters=[chapter],
    )

    presentation = build_summary_presentation(document, summary_style="tutorial-note")
    chapter_lines = "\n".join(presentation.sections[-1].lines)

    assert "画面讲解：这个 NotebookLM 上手会非常容易，它可以把本地或网络上的权威资料导入到自己的知识库里。后面还可以继续围绕这个知识库追问具体问题，如果回答没有出处，就不要直接拿来照做。" in chapter_lines
    assert "内容摘要：" not in chapter_lines


def test_build_summary_presentation_bridges_cross_chapter_fragmented_notebooklm_sentence() -> None:
    metadata = VideoMetadata(
        source_url="http://xhslink.com/o/AzAqWIsKgst",
        canonical_url="https://www.xiaohongshu.com/explore/69bbc03d00000000230109d9",
        title="notebooklm建立育儿知识库",
        uploader="高啃菜",
        description="",
        video_id="69bbc03d00000000230109d9",
        platform=VideoPlatform.XIAOHONGSHU,
    )
    chapters = [
        SummaryChapter(
            title="新手父母为什么要系统学习",
            goal="理解新手父母为什么需要系统学习。",
            key_points=["建立体系", "避免零散学习"],
            example_or_case="",
            caution="注意核对来源。",
            anchor_start_seconds=214.0,
            anchor_end_seconds=235.3,
            screenshot_paths=["img/frame-010.jpg"],
        ),
        SummaryChapter(
            title="快速搭建体系并完成知识内化",
            goal="理解如何快速搭建知识体系并完成知识内化。",
            key_points=["快速搭建体系", "帮助知识内化"],
            example_or_case="",
            caution="",
            anchor_start_seconds=235.3,
            anchor_end_seconds=253.2,
            screenshot_paths=["img/frame-011.jpg"],
        ),
    ]
    document = SummaryDocument(
        metadata=metadata,
        abstract="",
        bullets=[],
        transcript_segments=[],
        screenshots=[
            ScreenshotAsset(timestamp_seconds=231.3, relative_path="img/frame-010.jpg", alt_text="关键画面 10"),
            ScreenshotAsset(timestamp_seconds=244.2, relative_path="img/frame-011.jpg", alt_text="关键画面 11"),
        ],
        screenshot_caption_blocks=[
            ScreenshotCaptionBlock(
                screenshot_relative_path="img/frame-010.jpg",
                screenshot_alt_text="关键画面 10",
                screenshot_timestamp_seconds=231.3,
                chapter_title=chapters[0].title,
                window_start_seconds=214.0,
                window_end_seconds=235.3,
                narration_lines=[
                    "就是作为现在的新手家长",
                    "我们去搭建这么一套婴儿体系",
                    "去成体系的去学习这个婴儿知识",
                    "非常有必要的",
                    "但是这种非常这么大范围的去学习婴儿",
                    "其实对于我们是非常困难的",
                    "那这个notebook lm",
                ],
            ),
            ScreenshotCaptionBlock(
                screenshot_relative_path="img/frame-011.jpg",
                screenshot_alt_text="关键画面 11",
                screenshot_timestamp_seconds=244.2,
                chapter_title=chapters[1].title,
                window_start_seconds=235.3,
                window_end_seconds=253.2,
                narration_lines=[
                    "我觉得是给我们提供了一个",
                    "非常快速高效的体系搭建的",
                    "这么一个方法",
                    "快速的进行知识内化",
                    "我是觉得这个对我的帮助非常大",
                    "所以呢就我分享给大家",
                ],
            ),
        ],
        chapters=chapters,
    )

    presentation = build_summary_presentation(document, summary_style="tutorial-note")
    chapter_lines = "\n".join(presentation.sections[-1].lines)

    assert "那这个notebook lm" not in chapter_lines
    assert (
        "画面讲解：这个 NotebookLM 给我们提供了一套非常快速高效的体系搭建方法，也能帮助我们快速进行知识内化。"
        "这对个人实践帮助很大，所以我也分享给大家。"
    ) in chapter_lines


def test_build_summary_presentation_does_not_mutate_original_caption_blocks_when_merging_visual_cards() -> None:
    metadata = VideoMetadata(
        source_url="https://b23.tv/1SzaT3c",
        canonical_url="https://www.bilibili.com/video/BV1xx411c7mD?p=1",
        title="测试标题",
        uploader="测试作者",
        description="测试简介",
        video_id="BV1xx411c7mD",
        platform=VideoPlatform.BILIBILI,
    )
    chapter = SummaryChapter(
        title="建立判断标准",
        goal="理解教程的主目标。",
        key_points=["先判断学习目标", "再决定记录方式"],
        example_or_case="",
        caution="",
        anchor_start_seconds=10.0,
        anchor_end_seconds=120.0,
        screenshot_paths=[],
    )
    original_blocks = [
        ScreenshotCaptionBlock(
            screenshot_relative_path="img/smart/frame-001-000010.jpg",
            screenshot_alt_text="关键画面 1",
            screenshot_timestamp_seconds=10.0,
            chapter_title=chapter.title,
            window_start_seconds=8.0,
            window_end_seconds=12.0,
            narration_lines=["先判断学习目标。"],
        ),
        ScreenshotCaptionBlock(
            screenshot_relative_path="img/smart/frame-002-000012.jpg",
            screenshot_alt_text="关键画面 2",
            screenshot_timestamp_seconds=12.0,
            chapter_title=chapter.title,
            window_start_seconds=11.0,
            window_end_seconds=16.0,
            narration_lines=["先判断学习目标。", "再决定记录方式。"],
        ),
    ]
    document = SummaryDocument(
        metadata=metadata,
        abstract="",
        bullets=[],
        transcript_segments=[],
        screenshots=[
            ScreenshotAsset(timestamp_seconds=10.0, relative_path="img/smart/frame-001-000010.jpg", alt_text="关键画面 1"),
            ScreenshotAsset(timestamp_seconds=12.0, relative_path="img/smart/frame-002-000012.jpg", alt_text="关键画面 2"),
        ],
        screenshot_caption_blocks=original_blocks,
        chapters=[chapter],
    )

    build_summary_presentation(document, summary_style="tutorial-note")

    assert [block.screenshot_relative_path for block in document.screenshot_caption_blocks] == [
        "img/smart/frame-001-000010.jpg",
        "img/smart/frame-002-000012.jpg",
    ]

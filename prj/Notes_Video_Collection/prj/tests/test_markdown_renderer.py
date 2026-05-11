from video_summary_cli.markdown_renderer import _build_visual_subsection_title, render_summary_markdown
from video_summary_cli.models import (
    ScreenshotAsset,
    ScreenshotCaptionBlock,
    SummaryChapter,
    SummaryDocument,
    TranscriptSegment,
    VideoMetadata,
    VideoPlatform,
)
from video_summary_cli.presentation_builder import _build_ai_summary, _build_learning_goal_summary, _build_tags


def test_render_summary_markdown_contains_key_sections() -> None:
    metadata = VideoMetadata(
        source_url="https://b23.tv/1SzaT3c",
        canonical_url="https://www.bilibili.com/video/BV1xx411c7mD",
        title="测试标题",
        uploader="测试作者",
        description="测试简介",
        video_id="BV1xx411c7mD",
        platform=VideoPlatform.BILIBILI,
    )
    transcript_segments = [
        TranscriptSegment(start_seconds=0.0, end_seconds=2.0, text="第一段内容"),
        TranscriptSegment(start_seconds=2.0, end_seconds=4.0, text="第二段内容"),
    ]
    summary_document = SummaryDocument(
        metadata=metadata,
        abstract="这是摘要。",
        bullets=["要点一", "要点二"],
        transcript_segments=transcript_segments,
    )

    markdown = render_summary_markdown(summary_document)

    assert "# 测试标题" in markdown
    assert "## AI 总结" in markdown
    assert "## 关键信息" in markdown
    assert "## 标签" in markdown
    assert "## 核心摘要" in markdown
    assert "要点一" in markdown
    assert "## 关键片段" in markdown
    assert "## 全文转写" in markdown
    assert "第一段内容" in markdown


def test_render_summary_markdown_adds_bilibili_timestamp_links() -> None:
    metadata = VideoMetadata(
        source_url="https://b23.tv/1SzaT3c",
        canonical_url="https://www.bilibili.com/video/BV1xx411c7mD?p=1&share_source=copy&spmid=demo",
        title="测试标题",
        uploader="测试作者",
        description="测试简介",
        video_id="BV1xx411c7mD",
        platform=VideoPlatform.BILIBILI,
    )
    summary_document = SummaryDocument(
        metadata=metadata,
        abstract="这是摘要。",
        bullets=["要点一"],
        transcript_segments=[
            TranscriptSegment(start_seconds=0.0, end_seconds=2.0, text="第一段内容。"),
            TranscriptSegment(start_seconds=2.0, end_seconds=4.0, text="第二段内容。"),
        ],
    )

    markdown = render_summary_markdown(summary_document)

    assert "- 规范链接：https://www.bilibili.com/video/BV1xx411c7mD?p=1" in markdown
    assert "[00:00:00](https://www.bilibili.com/video/BV1xx411c7mD?p=1&t=0)" in markdown
    assert "[00:00:02](https://www.bilibili.com/video/BV1xx411c7mD?p=1&t=2)" in markdown
    assert "- [00:00:00](https://www.bilibili.com/video/BV1xx411c7mD?p=1&t=0) 第一段内容。" in markdown


def test_render_summary_markdown_adds_youtube_timestamp_links() -> None:
    metadata = VideoMetadata(
        source_url="https://youtu.be/demo123",
        canonical_url="https://www.youtube.com/watch?v=demo123&list=PL123&utm_source=share",
        title="测试标题",
        uploader="测试作者",
        description="测试简介",
        video_id="demo123",
        platform=VideoPlatform.YOUTUBE,
    )
    summary_document = SummaryDocument(
        metadata=metadata,
        abstract="这是摘要。",
        bullets=["要点一"],
        transcript_segments=[
            TranscriptSegment(start_seconds=65.0, end_seconds=70.0, text="YouTube 片段。"),
        ],
    )

    markdown = render_summary_markdown(summary_document)

    assert "- 规范链接：https://www.youtube.com/watch?v=demo123&list=PL123" in markdown
    assert "[00:01:05](https://www.youtube.com/watch?v=demo123&list=PL123&t=65s)" in markdown


def test_render_summary_markdown_uses_clean_xiaohongshu_note_link() -> None:
    metadata = VideoMetadata(
        source_url="https://www.xiaohongshu.com/explore/680f14630000000021011b0e?xsec_token=demo&xsec_source=pc_feed",
        canonical_url="https://www.xiaohongshu.com/explore/680f14630000000021011b0e",
        title="测试标题",
        uploader="测试作者",
        description="测试简介",
        video_id="680f14630000000021011b0e",
        platform=VideoPlatform.XIAOHONGSHU,
    )
    summary_document = SummaryDocument(
        metadata=metadata,
        abstract="这是摘要。",
        bullets=["要点一"],
        transcript_segments=[
            TranscriptSegment(start_seconds=65.0, end_seconds=70.0, text="小红书片段。"),
        ],
    )

    markdown = render_summary_markdown(summary_document)

    assert "- 规范链接：https://www.xiaohongshu.com/explore/680f14630000000021011b0e" in markdown
    assert "[00:01:05](https://www.xiaohongshu.com/explore/680f14630000000021011b0e)" in markdown


def test_render_summary_markdown_includes_screenshot_gallery() -> None:
    metadata = VideoMetadata(
        source_url="https://b23.tv/1SzaT3c",
        canonical_url="https://www.bilibili.com/video/BV1xx411c7mD?p=1",
        title="测试标题",
        uploader="测试作者",
        description="测试简介",
        video_id="BV1xx411c7mD",
        platform=VideoPlatform.BILIBILI,
    )
    summary_document = SummaryDocument(
        metadata=metadata,
        abstract="这是摘要。",
        bullets=["要点一"],
        transcript_segments=[
            TranscriptSegment(start_seconds=10.0, end_seconds=12.0, text="第一段内容。"),
        ],
        screenshots=[
            ScreenshotAsset(
                timestamp_seconds=10.0,
                relative_path="img/frame-001-000010.jpg",
                alt_text="关键画面 1",
            )
        ],
    )

    markdown = render_summary_markdown(summary_document)

    assert "## 关键画面" in markdown
    assert "![关键画面 1](img/frame-001-000010.jpg)" in markdown
    assert "[00:00:10](https://www.bilibili.com/video/BV1xx411c7mD?p=1&t=10)" in markdown


def test_render_summary_markdown_wraps_unsafe_image_paths_in_default_style() -> None:
    metadata = VideoMetadata(
        source_url="https://b23.tv/1SzaT3c",
        canonical_url="https://www.bilibili.com/video/BV1unsafe0001?p=1",
        title="测试标题",
        uploader="测试作者",
        description="测试简介",
        video_id="BV1unsafe0001",
        platform=VideoPlatform.BILIBILI,
    )
    unsafe_image_path = (
        "img/Codex App 支持子代理（Subagents)，并行开发极大提升效率.assets/"
        "frame-001-000041.jpg"
    )
    summary_document = SummaryDocument(
        metadata=metadata,
        abstract="这是摘要。",
        bullets=["要点一"],
        transcript_segments=[
            TranscriptSegment(start_seconds=10.0, end_seconds=12.0, text="第一段内容。"),
        ],
        screenshots=[
            ScreenshotAsset(
                timestamp_seconds=10.0,
                relative_path=unsafe_image_path,
                alt_text="关键画面 1",
            )
        ],
    )

    markdown = render_summary_markdown(summary_document)

    assert f"![关键画面 1](<{unsafe_image_path}>)" in markdown


def test_render_summary_markdown_supports_tutorial_note_style() -> None:
    metadata = VideoMetadata(
        source_url="https://b23.tv/1SzaT3c",
        canonical_url="https://www.bilibili.com/video/BV1xx411c7mD?p=1",
        title="测试标题",
        uploader="测试作者",
        description="测试简介",
        video_id="BV1xx411c7mD",
        platform=VideoPlatform.BILIBILI,
    )
    summary_document = SummaryDocument(
        metadata=metadata,
        abstract="这是摘要。",
        bullets=["步骤一", "步骤二"],
        transcript_segments=[
            TranscriptSegment(start_seconds=10.0, end_seconds=12.0, text="第一段内容。"),
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
                narration_lines=["先判断学习目标。", "再决定记录方式。", "最后把字幕和画面绑在一起。"],
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

    markdown = render_summary_markdown(summary_document, summary_style="tutorial-note")

    assert "## AI 总结" in markdown
    assert "## 关键信息" in markdown
    assert "## 标签" in markdown
    assert "## 学习目标" in markdown
    assert "## 关键片段" in markdown
    assert "## 章节拆解" in markdown
    assert "### 建立判断标准" in markdown
    assert "#### 1.1 先判断学习目标" in markdown
    assert "视频节点：[00:00:10](https://www.bilibili.com/video/BV1xx411c7mD?p=1&t=10)" in markdown
    assert "画面讲解：先判断学习目标，再决定记录方式，最后把字幕和画面绑在一起。" in markdown
    assert "![先判断学习目标](img/smart/frame-001-000010.jpg)" in markdown
    assert "## 画面变化索引" not in markdown
    assert "## 逐段转写" not in markdown
    assert "- 画面讲解时间：" not in markdown
    assert "- 讲解时间：" not in markdown
    assert "#### 画面 1 ·" not in markdown
    assert "内容摘要：" not in markdown


def test_render_summary_markdown_wraps_unsafe_image_paths_in_tutorial_note_style() -> None:
    metadata = VideoMetadata(
        source_url="https://b23.tv/1SzaT3c",
        canonical_url="https://www.bilibili.com/video/BV1unsafe0002?p=1",
        title="测试标题",
        uploader="测试作者",
        description="测试简介",
        video_id="BV1unsafe0002",
        platform=VideoPlatform.BILIBILI,
    )
    unsafe_image_path = (
        "img/Codex App 支持子代理（Subagents)，并行开发极大提升效率.assets/"
        "frame-001-000041.jpg"
    )
    summary_document = SummaryDocument(
        metadata=metadata,
        abstract="这是摘要。",
        bullets=["步骤一"],
        transcript_segments=[
            TranscriptSegment(start_seconds=10.0, end_seconds=12.0, text="第一段内容。"),
        ],
        screenshots=[
            ScreenshotAsset(
                timestamp_seconds=10.0,
                relative_path=unsafe_image_path,
                alt_text="关键画面 1",
            )
        ],
        screenshot_caption_blocks=[
            ScreenshotCaptionBlock(
                screenshot_relative_path=unsafe_image_path,
                screenshot_alt_text="关键画面 1",
                screenshot_timestamp_seconds=10.0,
                chapter_title="章节一",
                window_start_seconds=8.0,
                window_end_seconds=20.0,
                narration_lines=[],
            )
        ],
        chapters=[
            SummaryChapter(
                title="章节一",
                goal="理解教程主目标。",
                key_points=["步骤一"],
                example_or_case="案例一",
                caution="注意一",
                anchor_start_seconds=10.0,
                anchor_end_seconds=120.0,
                screenshot_paths=[unsafe_image_path],
            )
        ],
    )

    markdown = render_summary_markdown(summary_document, summary_style="tutorial-note")

    assert f"![关键画面 1](<{unsafe_image_path}>)" in markdown


def test_render_summary_markdown_tutorial_note_renders_multiple_visual_subsections_per_chapter() -> None:
    metadata = VideoMetadata(
        source_url="https://b23.tv/1SzaT3c",
        canonical_url="https://www.bilibili.com/video/BV1xx411c7mD?p=1",
        title="测试标题",
        uploader="测试作者",
        description="测试简介",
        video_id="BV1xx411c7mD",
        platform=VideoPlatform.BILIBILI,
    )
    summary_document = SummaryDocument(
        metadata=metadata,
        abstract="这是摘要。",
        bullets=["步骤一", "步骤二"],
        transcript_segments=[
            TranscriptSegment(start_seconds=10.0, end_seconds=12.0, text="第一段内容。"),
            TranscriptSegment(start_seconds=90.0, end_seconds=92.0, text="第二段内容。"),
        ],
        screenshots=[
            ScreenshotAsset(
                timestamp_seconds=10.0,
                relative_path="img/smart/frame-001-000010.jpg",
                alt_text="关键画面 1",
            ),
            ScreenshotAsset(
                timestamp_seconds=90.0,
                relative_path="img/smart/frame-002-000090.jpg",
                alt_text="关键画面 2",
            ),
        ],
        screenshot_caption_blocks=[
            ScreenshotCaptionBlock(
                screenshot_relative_path="img/smart/frame-001-000010.jpg",
                screenshot_alt_text="关键画面 1",
                screenshot_timestamp_seconds=10.0,
                chapter_title="建立判断标准",
                window_start_seconds=8.0,
                window_end_seconds=40.0,
                narration_lines=["先判断学习目标。", "再决定记录方式。"],
            ),
            ScreenshotCaptionBlock(
                screenshot_relative_path="img/smart/frame-002-000090.jpg",
                screenshot_alt_text="关键画面 2",
                screenshot_timestamp_seconds=90.0,
                chapter_title="建立判断标准",
                window_start_seconds=60.0,
                window_end_seconds=120.0,
                narration_lines=["我们只需要去深入的是他用的框架是什么。", "它的方案是什么。"],
            ),
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
                screenshot_paths=[
                    "img/smart/frame-001-000010.jpg",
                    "img/smart/frame-002-000090.jpg",
                ],
            )
        ],
    )

    markdown = render_summary_markdown(summary_document, summary_style="tutorial-note")

    first_subsection = "#### 1.1 先判断学习目标"
    second_subsection = "#### 1.2 理解框架与方案"
    first_video_node = "视频节点：[00:00:10](https://www.bilibili.com/video/BV1xx411c7mD?p=1&t=10)"
    second_video_node = "视频节点：[00:01:30](https://www.bilibili.com/video/BV1xx411c7mD?p=1&t=90)"
    first_summary = "画面讲解：先判断学习目标，再决定记录方式。"
    second_summary = "画面讲解：我们只需要去深入的是他用的框架是什么，它的方案是什么。"
    first_image = "![先判断学习目标](img/smart/frame-001-000010.jpg)"
    second_image = "![理解框架与方案](img/smart/frame-002-000090.jpg)"

    assert first_subsection in markdown
    assert second_subsection in markdown
    assert markdown.index(first_subsection) < markdown.index(first_video_node) < markdown.index(first_summary) < markdown.index(first_image)
    assert markdown.index(second_subsection) < markdown.index(second_video_node) < markdown.index(second_summary) < markdown.index(second_image)


def test_build_visual_subsection_title_prefers_more_concise_tutorial_labels() -> None:
    frame_block = ScreenshotCaptionBlock(
        screenshot_relative_path="img/smart/frame-001-000010.jpg",
        screenshot_alt_text="关键画面 1",
        screenshot_timestamp_seconds=10.0,
        chapter_title="建立判断标准",
        window_start_seconds=8.0,
        window_end_seconds=20.0,
        narration_lines=["根据我们的框架去填充我们的代码。"],
    )
    warning_block = ScreenshotCaptionBlock(
        screenshot_relative_path="img/smart/frame-002-000020.jpg",
        screenshot_alt_text="关键画面 2",
        screenshot_timestamp_seconds=20.0,
        chapter_title="建立判断标准",
        window_start_seconds=18.0,
        window_end_seconds=30.0,
        narration_lines=["传统的方式AI只是投机取巧。", "大部分的人。"],
    )

    assert _build_visual_subsection_title(frame_block) == "按框架填充代码"
    assert _build_visual_subsection_title(warning_block) == "AI 学习误区"


def test_build_visual_subsection_title_normalizes_codex_subagent_terms() -> None:
    block = ScreenshotCaptionBlock(
        screenshot_relative_path="img/smart/frame-001-000010.jpg",
        screenshot_alt_text="关键画面 1",
        screenshot_timestamp_seconds=10.0,
        chapter_title="子代理基础与角色分工",
        window_start_seconds=8.0,
        window_end_seconds=20.0,
        narration_lines=[
            "那在这个对话里面明确要求开启这样的子弹，然后的话每一个子代理负责什么事情。",
        ],
    )

    assert _build_visual_subsection_title(block) == "子代理职责说明"


def test_build_visual_subsection_title_keeps_general_thread_scene_out_of_subagent_label() -> None:
    block = ScreenshotCaptionBlock(
        screenshot_relative_path="img/smart/frame-001-000010.jpg",
        screenshot_alt_text="关键画面 1",
        screenshot_timestamp_seconds=10.0,
        chapter_title="线程管理与运行调试",
        window_start_seconds=8.0,
        window_end_seconds=20.0,
        narration_lines=[
            "线程运行时可以归档，也可以在列表里查看当前状态。",
        ],
    )

    assert _build_visual_subsection_title(block) == "线程归档与查看"


def test_build_visual_subsection_title_prefers_notebooklm_parenting_labels() -> None:
    source_block = ScreenshotCaptionBlock(
        screenshot_relative_path="img/notebooklm/frame-001.jpg",
        screenshot_alt_text="关键画面 1",
        screenshot_timestamp_seconds=30.0,
        chapter_title="NotebookLM 与育儿知识库",
        window_start_seconds=28.0,
        window_end_seconds=34.0,
        narration_lines=[
            "它可以把这个知识库所有的内容，以文档、思维导图和音频等各种形式来呈现。",
        ],
    )
    compare_block = ScreenshotCaptionBlock(
        screenshot_relative_path="img/notebooklm/frame-002.jpg",
        screenshot_alt_text="关键画面 2",
        screenshot_timestamp_seconds=170.0,
        chapter_title="对比通用 AI 回答",
        window_start_seconds=168.0,
        window_end_seconds=174.0,
        narration_lines=[
            "如果用豆包或 DeepSeek 问同样的问题，回答往往不够成体系。",
        ],
    )

    assert _build_visual_subsection_title(source_block) == "生成多种内容形态"
    assert _build_visual_subsection_title(compare_block) in {"对比通用 AI 回答", "通用模型回答不成体系", "信息分散难以追溯", "回答不够成体系"}


def test_build_visual_subsection_title_rewrites_spoken_clauses_into_tutorial_labels() -> None:
    intro_block = ScreenshotCaptionBlock(
        screenshot_relative_path="img/smart/frame-001-000007.jpg",
        screenshot_alt_text="关键画面 1",
        screenshot_timestamp_seconds=7.0,
        chapter_title="基础设置与模型选择",
        window_start_seconds=7.0,
        window_end_seconds=40.0,
        narration_lines=[
            "大家好，OpenAI最近推出一款非常热门的AI编程工具。叫Codex App，这款编程工具借鉴了很多 AI 编程工具的优点。",
        ],
    )
    reply_block = ScreenshotCaptionBlock(
        screenshot_relative_path="img/smart/frame-002-000141.jpg",
        screenshot_alt_text="关键画面 2",
        screenshot_timestamp_seconds=141.0,
        chapter_title="基础设置与模型选择",
        window_start_seconds=141.0,
        window_end_seconds=176.0,
        narration_lines=[
            "他的对你的一些AI的回复，会采用这种风格来进行回复。你也可以在这里看到你的余量。",
        ],
    )
    finish_block = ScreenshotCaptionBlock(
        screenshot_relative_path="img/smart/frame-003-000167.jpg",
        screenshot_alt_text="关键画面 3",
        screenshot_timestamp_seconds=167.0,
        chapter_title="子代理提示词与线程查看",
        window_start_seconds=167.0,
        window_end_seconds=176.0,
        narration_lines=[
            "但其实这样是没必要的，就子代理完成之后，那就完成了这个事情就结束了。",
        ],
    )
    wait_block = ScreenshotCaptionBlock(
        screenshot_relative_path="img/smart/frame-004-000172.jpg",
        screenshot_alt_text="关键画面 4",
        screenshot_timestamp_seconds=172.0,
        chapter_title="子代理提示词与线程查看",
        window_start_seconds=172.0,
        window_end_seconds=180.0,
        narration_lines=[
            "主代理在这个子代理运行过程中，它是一个停止状态，就是你在这边是点不了的。",
        ],
    )
    map_block = ScreenshotCaptionBlock(
        screenshot_relative_path="img/smart/frame-005-000461.jpg",
        screenshot_alt_text="关键画面 5",
        screenshot_timestamp_seconds=461.0,
        chapter_title="自定义子代理与权限配置",
        window_start_seconds=461.0,
        window_end_seconds=470.0,
        narration_lines=[
            "用这个 JSD 的这个 macoo base，去了解这个代码库的时候。",
        ],
    )

    assert _build_visual_subsection_title(intro_block) == "Codex App 工具定位"
    assert _build_visual_subsection_title(reply_block) == "AI 回复风格与余量"
    assert _build_visual_subsection_title(finish_block) == "子代理执行结束即可"
    assert _build_visual_subsection_title(wait_block) == "主代理等待子代理返回"
    assert _build_visual_subsection_title(map_block) == "Map Codebase 扫描代码库"


def test_build_visual_subsection_title_rewrites_additional_real_sample_labels() -> None:
    cases = [
        (
            "去第一次去搭建这样的一个项目，不仅仅是第一次，你处理任何复杂的这个项目需求的时候。你都可以使用它的Plan 模式。",
            "Plan 模式适用场景",
        ),
        (
            "那么在输入需求的时候，我们可以使用它一个非常便捷的功能。就是语音输入了。",
            "语音输入描述需求",
        ),
        (
            "比如说它是通过这个命令来启动，那么你就可以在这边设置这个命令。你也可以去设置非常多别的命令。这边有一个这样的叫环境。",
            "启动命令与环境配置",
        ),
        (
            "然后这边有两个按钮，一个叫应用，一个叫覆盖。应用的意思就是把这个变更补到里面去。",
            "应用与覆盖的区别",
        ),
        (
            "这边都有明确的说明，那比如说第一个子代理是负责的，是安全性的问题。",
            "安全性子代理职责",
        ),
        (
            "第二个是负责代码质量，第三个是负责错误，那第四个是竞争条件。那么这六个子代理。",
            "代码质量与竞争条件",
        ),
        (
            "那这些创建的这个这六个子代理，它其实是个临时性的，可能你换了个项目之后。",
            "临时子代理的生命周期",
        ),
        (
            "第三个就是你要让它返回一个特定的结果。",
            "约束返回结果格式",
        ),
        (
            "那你定义好一些结构，第四个就是你的失败不影响整体，如果你运行失败。",
            "失败不影响主流程",
        ),
    ]

    for index, (line, expected_title) in enumerate(cases, 1):
        block = ScreenshotCaptionBlock(
            screenshot_relative_path=f"img/smart/extra-frame-{index:03d}.jpg",
            screenshot_alt_text=f"补充画面 {index}",
            screenshot_timestamp_seconds=float(index * 12),
            chapter_title="补充测试章节",
            window_start_seconds=float(index * 12),
            window_end_seconds=float(index * 12 + 8),
            narration_lines=[line],
        )
        assert _build_visual_subsection_title(block) == expected_title


def test_build_tags_adds_tutorial_specific_topics_for_codex_app_and_subagents() -> None:
    codex_app_document = SummaryDocument(
        metadata=VideoMetadata(
            source_url="https://www.bilibili.com/video/BV1oJAoz2Emf",
            canonical_url="https://www.bilibili.com/video/BV1oJAoz2Emf",
            title="Codex APP 保姆级使用教程，实战项目全流程讲解，覆盖 Codex APP十一个特性",
            uploader="测试作者",
            description="测试简介",
            video_id="BV1oJAoz2Emf",
            platform=VideoPlatform.BILIBILI,
        ),
        abstract="这是摘要。",
        bullets=["打开 Plan 模式，配置技能，使用 Worktree，并安装 MCP 测试网站。"],
        transcript_segments=[TranscriptSegment(start_seconds=0.0, end_seconds=1.0, text="第一段内容。")],
        chapters=[
            SummaryChapter(
                title="基础设置与模型选择",
                goal="目标一",
                key_points=["要点一", "要点二"],
                example_or_case="案例一",
                caution="注意一",
                anchor_start_seconds=0.0,
                anchor_end_seconds=1.0,
            ),
            SummaryChapter(
                title="项目初始化与 Plan 模式",
                goal="目标二",
                key_points=["要点一", "要点二"],
                example_or_case="案例二",
                caution="注意二",
                anchor_start_seconds=1.0,
                anchor_end_seconds=2.0,
            ),
            SummaryChapter(
                title="技能安装与界面优化",
                goal="目标三",
                key_points=["要点一", "要点二"],
                example_or_case="案例三",
                caution="注意三",
                anchor_start_seconds=2.0,
                anchor_end_seconds=3.0,
            ),
            SummaryChapter(
                title="Worktree 并行开发",
                goal="目标四",
                key_points=["要点一", "要点二"],
                example_or_case="案例四",
                caution="注意四",
                anchor_start_seconds=3.0,
                anchor_end_seconds=4.0,
            ),
            SummaryChapter(
                title="自动化、记忆与 MCP 测试",
                goal="目标五",
                key_points=["要点一", "要点二"],
                example_or_case="案例五",
                caution="注意五",
                anchor_start_seconds=4.0,
                anchor_end_seconds=5.0,
            ),
        ],
    )
    subagents_document = SummaryDocument(
        metadata=VideoMetadata(
            source_url="https://www.bilibili.com/video/BV1a2wizyEuJ",
            canonical_url="https://www.bilibili.com/video/BV1a2wizyEuJ",
            title="Codex App 支持子代理（Subagents)，并行开发极大提升效率",
            uploader="测试作者",
            description="测试简介",
            video_id="BV1a2wizyEuJ",
            platform=VideoPlatform.BILIBILI,
        ),
        abstract="这是摘要。",
        bullets=["通过提示词管理 Subagents，并行协作，同时配置沙箱和权限。"],
        transcript_segments=[TranscriptSegment(start_seconds=0.0, end_seconds=1.0, text="第一段内容。")],
        chapters=[
            SummaryChapter(
                title="子代理基础与角色分工",
                goal="目标一",
                key_points=["要点一", "要点二"],
                example_or_case="案例一",
                caution="注意一",
                anchor_start_seconds=0.0,
                anchor_end_seconds=1.0,
            ),
            SummaryChapter(
                title="子代理提示词与线程查看",
                goal="目标二",
                key_points=["要点一", "要点二"],
                example_or_case="案例二",
                caution="注意二",
                anchor_start_seconds=1.0,
                anchor_end_seconds=2.0,
            ),
            SummaryChapter(
                title="并行协作与临时子代理",
                goal="目标三",
                key_points=["要点一", "要点二"],
                example_or_case="案例三",
                caution="注意三",
                anchor_start_seconds=2.0,
                anchor_end_seconds=3.0,
            ),
            SummaryChapter(
                title="自定义子代理与权限配置",
                goal="目标四",
                key_points=["要点一", "要点二"],
                example_or_case="案例四",
                caution="注意四",
                anchor_start_seconds=3.0,
                anchor_end_seconds=4.0,
            ),
        ],
    )

    codex_app_tags = _build_tags(codex_app_document)
    subagents_tags = _build_tags(subagents_document)

    assert {"Codex App", "Plan 模式", "技能", "Worktree", "MCP"} <= set(codex_app_tags)
    assert {"Subagents", "并行协作", "权限配置"} <= set(subagents_tags)
    assert "bilibili" in codex_app_tags
    assert "bilibili" in subagents_tags


def test_build_visual_subsection_title_handles_remaining_codex_tutorial_action_scenes() -> None:
    plan_block = ScreenshotCaptionBlock(
        screenshot_relative_path="img/smart/frame-001-000330.jpg",
        screenshot_alt_text="关键画面 1",
        screenshot_timestamp_seconds=330.0,
        chapter_title="项目初始化与 Plan 模式",
        window_start_seconds=330.0,
        window_end_seconds=348.0,
        narration_lines=[
            "你做Plan的话，他会去搜索你整个的代码，或者搜索的范围非常大。他会去仔细思考。",
        ],
    )
    voice_block = ScreenshotCaptionBlock(
        screenshot_relative_path="img/smart/frame-002-000348.jpg",
        screenshot_alt_text="关键画面 2",
        screenshot_timestamp_seconds=348.0,
        chapter_title="项目初始化与 Plan 模式",
        window_start_seconds=348.0,
        window_end_seconds=411.0,
        narration_lines=[
            "在输入需求的时候，我们可以使用它一个非常便捷的功能，就是语音输入了。",
        ],
    )
    command_block = ScreenshotCaptionBlock(
        screenshot_relative_path="img/smart/frame-003-000572.jpg",
        screenshot_alt_text="关键画面 3",
        screenshot_timestamp_seconds=572.0,
        chapter_title="线程管理与运行调试",
        window_start_seconds=572.0,
        window_end_seconds=619.0,
        narration_lines=[
            "比如说它是通过这个命令来启动，你可以设置启动命令，也可以配置环境。",
        ],
    )
    skill_block = ScreenshotCaptionBlock(
        screenshot_relative_path="img/smart/frame-004-000678.jpg",
        screenshot_alt_text="关键画面 4",
        screenshot_timestamp_seconds=678.0,
        chapter_title="技能安装与界面优化",
        window_start_seconds=678.0,
        window_end_seconds=720.0,
        narration_lines=[
            "你安装的技能是可以去管理的，也可以用美元符号显式调用，或者通过描述来匹配技能。",
        ],
    )
    worktree_block = ScreenshotCaptionBlock(
        screenshot_relative_path="img/smart/frame-005-000960.jpg",
        screenshot_alt_text="关键画面 5",
        screenshot_timestamp_seconds=960.0,
        chapter_title="Worktree 并行开发",
        window_start_seconds=960.0,
        window_end_seconds=1007.0,
        narration_lines=[
            "这里有两个按钮，一个叫应用，一个是覆盖，你要理解它们的区别。",
        ],
    )
    automation_block = ScreenshotCaptionBlock(
        screenshot_relative_path="img/smart/frame-006-001023.jpg",
        screenshot_alt_text="关键画面 6",
        screenshot_timestamp_seconds=1023.0,
        chapter_title="自动化、记忆与 MCP 测试",
        window_start_seconds=1023.0,
        window_end_seconds=1069.0,
        narration_lines=[
            "你可以自动提交，也可以去创建这样 PR，那除了这些功能之外，它也自带自动化。",
        ],
    )

    assert _build_visual_subsection_title(plan_block) == "Plan 模式深度思考"
    assert _build_visual_subsection_title(voice_block) == "语音输入描述需求"
    assert _build_visual_subsection_title(command_block) == "启动命令与环境配置"
    assert _build_visual_subsection_title(skill_block) == "技能管理与调用方式"
    assert _build_visual_subsection_title(worktree_block) == "应用与覆盖的区别"
    assert _build_visual_subsection_title(automation_block) == "提交代码与创建 PR"


def test_build_visual_subsection_title_handles_remaining_subagent_tutorial_scenes() -> None:
    security_block = ScreenshotCaptionBlock(
        screenshot_relative_path="img/smart/frame-001-000057.jpg",
        screenshot_alt_text="关键画面 1",
        screenshot_timestamp_seconds=57.0,
        chapter_title="子代理基础与角色分工",
        window_start_seconds=57.0,
        window_end_seconds=62.0,
        narration_lines=[
            "第一个子代理是负责的，是安全性的问题。",
        ],
    )
    quality_block = ScreenshotCaptionBlock(
        screenshot_relative_path="img/smart/frame-002-000062.jpg",
        screenshot_alt_text="关键画面 2",
        screenshot_timestamp_seconds=62.0,
        chapter_title="子代理基础与角色分工",
        window_start_seconds=62.0,
        window_end_seconds=70.0,
        narration_lines=[
            "第二个是负责代码质量，第三个是负责错误，那第四个是竞争条件。",
        ],
    )
    coordination_block = ScreenshotCaptionBlock(
        screenshot_relative_path="img/smart/frame-003-000262.jpg",
        screenshot_alt_text="关键画面 3",
        screenshot_timestamp_seconds=262.0,
        chapter_title="主代理协调与上下文隔离",
        window_start_seconds=262.0,
        window_end_seconds=267.0,
        narration_lines=[
            "根据你输入的需求去协调更多的子代理。",
        ],
    )
    role_block = ScreenshotCaptionBlock(
        screenshot_relative_path="img/smart/frame-004-000277.jpg",
        screenshot_alt_text="关键画面 4",
        screenshot_timestamp_seconds=277.0,
        chapter_title="主代理协调与上下文隔离",
        window_start_seconds=277.0,
        window_end_seconds=282.0,
        narration_lines=[
            "比如说 review，那么他只关注 review 代码，那如果说生成接口文档。",
        ],
    )
    temporary_block = ScreenshotCaptionBlock(
        screenshot_relative_path="img/smart/frame-005-000380.jpg",
        screenshot_alt_text="关键画面 5",
        screenshot_timestamp_seconds=380.0,
        chapter_title="并行协作与临时子代理",
        window_start_seconds=380.0,
        window_end_seconds=388.0,
        narration_lines=[
            "它其实是个临时性的，可能你换了个项目之后就没有了。",
        ],
    )
    define_block = ScreenshotCaptionBlock(
        screenshot_relative_path="img/smart/frame-006-000466.jpg",
        screenshot_alt_text="关键画面 6",
        screenshot_timestamp_seconds=466.0,
        chapter_title="自定义子代理与权限配置",
        window_start_seconds=466.0,
        window_end_seconds=476.0,
        narration_lines=[
            "他会开启这样四个子代理，就他这边去声明的，那就相当于他定义的这个子代理。",
        ],
    )
    reusable_block = ScreenshotCaptionBlock(
        screenshot_relative_path="img/smart/frame-007-000471.jpg",
        screenshot_alt_text="关键画面 7",
        screenshot_timestamp_seconds=471.0,
        chapter_title="自定义子代理与权限配置",
        window_start_seconds=471.0,
        window_end_seconds=481.0,
        narration_lines=[
            "我们可以在别的地方都可以用到，所以这个就是要自定义的子代理。",
        ],
    )
    result_block = ScreenshotCaptionBlock(
        screenshot_relative_path="img/smart/frame-008-000563.jpg",
        screenshot_alt_text="关键画面 8",
        screenshot_timestamp_seconds=563.0,
        chapter_title="子代理实践建议",
        window_start_seconds=563.0,
        window_end_seconds=568.0,
        narration_lines=[
            "第三个就是你要让它返回一个特定的结果。",
        ],
    )
    failure_block = ScreenshotCaptionBlock(
        screenshot_relative_path="img/smart/frame-009-000572.jpg",
        screenshot_alt_text="关键画面 9",
        screenshot_timestamp_seconds=572.0,
        chapter_title="子代理实践建议",
        window_start_seconds=572.0,
        window_end_seconds=577.0,
        narration_lines=[
            "第四个就是你的失败不影响整体，如果你运行失败。",
        ],
    )

    assert _build_visual_subsection_title(security_block) == "安全性子代理职责"
    assert _build_visual_subsection_title(quality_block) == "代码质量与竞争条件"
    assert _build_visual_subsection_title(coordination_block) == "主代理协调多个子代理"
    assert _build_visual_subsection_title(role_block) == "Review 与文档各司其职"
    assert _build_visual_subsection_title(temporary_block) == "临时子代理的生命周期"
    assert _build_visual_subsection_title(define_block) == "配置里声明子代理"
    assert _build_visual_subsection_title(reusable_block) == "自定义子代理可复用"
    assert _build_visual_subsection_title(result_block) == "约束返回结果格式"
    assert _build_visual_subsection_title(failure_block) == "失败不影响主流程"


def test_render_summary_markdown_normalizes_dirty_domain_terms_in_tutorial_note() -> None:
    metadata = VideoMetadata(
        source_url="https://www.bilibili.com/video/BV1test12345",
        canonical_url="https://www.bilibili.com/video/BV1test12345?p=1",
        title="Codex App 支持子代理（Subagents)",
        uploader="测试作者",
        description="测试简介",
        video_id="BV1test12345",
        platform=VideoPlatform.BILIBILI,
    )
    summary_document = SummaryDocument(
        metadata=metadata,
        abstract="这是摘要。",
        bullets=["步骤一"],
        transcript_segments=[
            TranscriptSegment(start_seconds=10.0, end_seconds=12.0, text="第一段内容。"),
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
                chapter_title="子代理基础与角色分工",
                window_start_seconds=8.0,
                window_end_seconds=20.0,
                narration_lines=[
                    "glass app最近发布了新版本 支持子弹 sub agents。",
                    "那在这个对话里面明确要求开启这样的子弹，然后的话每一个子代理负责什么事情。",
                ],
            )
        ],
        chapters=[
            SummaryChapter(
                title="子代理基础与角色分工",
                goal="理解 Codex App 里的主代理与子代理分工。",
                key_points=["主代理负责任务协调", "子代理负责单点任务"],
                example_or_case="案例：安全性、代码质量和错误检查可以并行执行。",
                caution="注意不要把所有职责都塞进一个子代理。",
                anchor_start_seconds=10.0,
                anchor_end_seconds=40.0,
                screenshot_paths=["img/smart/frame-001-000010.jpg"],
            )
        ],
    )

    markdown = render_summary_markdown(summary_document, summary_style="tutorial-note")

    assert "Codex App" in markdown
    assert "glass app" not in markdown.lower()
    assert "子弹" not in markdown
    assert "#### 1.1 子代理职责说明" in markdown


def test_build_tags_and_summaries_fit_notebooklm_parenting_content() -> None:
    document = SummaryDocument(
        metadata=VideoMetadata(
            source_url="http://xhslink.com/o/AzAqWIsKgst",
            canonical_url="https://www.xiaohongshu.com/explore/69bbc03d00000000230109d9",
            title="notebooklm建立育儿知识库",
            uploader="测试作者",
            description="我建议所有父母都尝试用NotebookLM建立一个个人育儿知识库。",
            video_id="69bbc03d00000000230109d9",
            platform=VideoPlatform.XIAOHONGSHU,
        ),
        abstract="这是摘要。",
        bullets=[
            "用 NotebookLM 导入 WHO、美国儿科学会和国家卫健委的育儿资料。",
            "围绕新手父母照顾 0 到 1 岁婴儿的问题验证回答质量。",
            "对比通用模型，重点看出处来源和是否成体系。",
        ],
        transcript_segments=[TranscriptSegment(start_seconds=0.0, end_seconds=1.0, text="第一段内容。")],
        chapters=[
            SummaryChapter(
                title="为什么要建立育儿知识库",
                goal="理解为什么要先搭建个人育儿知识库。",
                key_points=["先集中权威资料", "避免东一片西一片地查信息"],
                example_or_case="案例一",
                caution="注意不要混入来源不明的资料。",
                anchor_start_seconds=0.0,
                anchor_end_seconds=30.0,
            ),
            SummaryChapter(
                title="导入权威育儿资料",
                goal="掌握导入 WHO、美国儿科学会和国家卫健委资料的方式。",
                key_points=["上传 PDF 或网页", "直接补充需要的育儿资料"],
                example_or_case="案例二",
                caution="注意优先选指南和机构资料。",
                anchor_start_seconds=30.0,
                anchor_end_seconds=60.0,
            ),
            SummaryChapter(
                title="查看回答出处与权威性",
                goal="学会检查回答背后的出处和引用资料。",
                key_points=["重点看出处来源", "减少幻觉和瞎编"],
                example_or_case="案例三",
                caution="注意不要只看答案结论。",
                anchor_start_seconds=60.0,
                anchor_end_seconds=90.0,
            ),
            SummaryChapter(
                title="对比通用模型的局限",
                goal="理解通用模型为什么容易不成体系。",
                key_points=["回答可能东一片西一片", "数字来源不容易核实"],
                example_or_case="案例四",
                caution="注意不要把无来源答案当结论。",
                anchor_start_seconds=90.0,
                anchor_end_seconds=120.0,
            ),
        ],
    )

    tags = _build_tags(document)
    ai_summary = _build_ai_summary(document)
    learning_goal = _build_learning_goal_summary(document)

    assert {"NotebookLM", "育儿知识库", "权威来源", "新手父母"} <= set(tags)
    assert "xiaohongshu" not in tags
    assert "Worktree" not in ai_summary
    assert "子代理" not in ai_summary
    assert "NotebookLM" in ai_summary
    assert "权威" in ai_summary
    assert "新手父母" in ai_summary
    assert "AI 时代的学习与开发框架" not in learning_goal
    assert "NotebookLM" in learning_goal
    assert "出处" in learning_goal


def test_build_visual_subsection_title_handles_notebooklm_parenting_scenes() -> None:
    import_block = ScreenshotCaptionBlock(
        screenshot_relative_path="img/smart/frame-001-000031.jpg",
        screenshot_alt_text="关键画面 1",
        screenshot_timestamp_seconds=31.0,
        chapter_title="导入权威育儿资料",
        window_start_seconds=30.0,
        window_end_seconds=40.0,
        narration_lines=[
            "这个Notebook LM其实能将本地或者网络上的大量权威资料转换为全部导入到你自己的一个个人支持库里。",
        ],
    )
    source_block = ScreenshotCaptionBlock(
        screenshot_relative_path="img/smart/frame-002-000134.jpg",
        screenshot_alt_text="关键画面 2",
        screenshot_timestamp_seconds=134.0,
        chapter_title="查看回答出处与权威性",
        window_start_seconds=133.0,
        window_end_seconds=145.0,
        narration_lines=[
            "你看他的每一句话都有处处和来源 这个婴儿腐蚀添加的营养指南也能看到国家卫生健康委员会的出处。",
        ],
    )
    compare_block = ScreenshotCaptionBlock(
        screenshot_relative_path="img/smart/frame-003-000178.jpg",
        screenshot_alt_text="关键画面 3",
        screenshot_timestamp_seconds=178.0,
        chapter_title="对比通用模型的局限",
        window_start_seconds=177.0,
        window_end_seconds=185.0,
        narration_lines=[
            "你会发现豆包和DeepSeek的回答没有成体系 会东一片西一片 这个数字来源也无从得知。",
        ],
    )

    assert _build_visual_subsection_title(import_block) == "导入权威育儿资料"
    assert _build_visual_subsection_title(source_block) in {"查看回答的出处来源", "查看回答的权威出处", "引用国家卫生健康委员会指南", "引用国家卫健委指南"}
    assert _build_visual_subsection_title(compare_block) in {"对比通用 AI 回答", "通用模型回答不成体系", "信息分散难以追溯", "回答不够成体系"}


def test_build_visual_subsection_title_improves_generic_notebooklm_parenting_frames() -> None:
    dialogue_block = ScreenshotCaptionBlock(
        screenshot_relative_path="img/smart/frame-001.jpg",
        screenshot_alt_text="关键画面 1",
        screenshot_timestamp_seconds=43.0,
        chapter_title="NotebookLM 与育儿知识库搭建",
        window_start_seconds=41.0,
        window_end_seconds=45.0,
        narration_lines=["你可以跟它进行无限的沟通对话交流。"],
    )
    answer_block = ScreenshotCaptionBlock(
        screenshot_relative_path="img/smart/frame-002.jpg",
        screenshot_alt_text="关键画面 2",
        screenshot_timestamp_seconds=103.0,
        chapter_title="导入资料并提出育儿问题",
        window_start_seconds=101.0,
        window_end_seconds=105.0,
        narration_lines=["我觉得是非常好的。"],
    )
    number_block = ScreenshotCaptionBlock(
        screenshot_relative_path="img/smart/frame-003.jpg",
        screenshot_alt_text="关键画面 3",
        screenshot_timestamp_seconds=183.0,
        chapter_title="对比通用 AI 的幻觉风险",
        window_start_seconds=181.0,
        window_end_seconds=185.0,
        narration_lines=["他提供的这么精准。"],
    )
    summary_block = ScreenshotCaptionBlock(
        screenshot_relative_path="img/smart/frame-004.jpg",
        screenshot_alt_text="关键画面 4",
        screenshot_timestamp_seconds=237.0,
        chapter_title="快速搭建体系并完成知识内化",
        window_start_seconds=236.0,
        window_end_seconds=239.0,
        narration_lines=["一个非常快速。"],
    )

    assert _build_visual_subsection_title(dialogue_block) == "围绕知识库持续对话"
    assert _build_visual_subsection_title(answer_block) == "回答结构更完整"
    assert _build_visual_subsection_title(number_block) == "数字精准但未必可信"
    assert _build_visual_subsection_title(summary_block) == "快速搭建学习体系"


def test_build_visual_subsection_title_cleans_more_notebooklm_parenting_half_sentences() -> None:
    intro_block = ScreenshotCaptionBlock(
        screenshot_relative_path="img/smart/frame-005.jpg",
        screenshot_alt_text="关键画面 5",
        screenshot_timestamp_seconds=27.0,
        chapter_title="NotebookLM 与育儿知识库搭建",
        window_start_seconds=26.0,
        window_end_seconds=28.0,
        narration_lines=["这个Notebook LM呢。"],
    )
    upload_block = ScreenshotCaptionBlock(
        screenshot_relative_path="img/smart/frame-006.jpg",
        screenshot_alt_text="关键画面 6",
        screenshot_timestamp_seconds=76.0,
        chapter_title="导入资料并提出育儿问题",
        window_start_seconds=75.0,
        window_end_seconds=77.0,
        narration_lines=["还有你自己硬盘里的文件都可以。"],
    )
    cite_block = ScreenshotCaptionBlock(
        screenshot_relative_path="img/smart/frame-007.jpg",
        screenshot_alt_text="关键画面 7",
        screenshot_timestamp_seconds=124.0,
        chapter_title="权威来源与回答可信度",
        window_start_seconds=123.0,
        window_end_seconds=125.0,
        narration_lines=["义买通发表的这个7到24月0。"],
    )
    compare_block = ScreenshotCaptionBlock(
        screenshot_relative_path="img/smart/frame-008.jpg",
        screenshot_alt_text="关键画面 8",
        screenshot_timestamp_seconds=175.0,
        chapter_title="对比通用 AI 的幻觉风险",
        window_start_seconds=174.0,
        window_end_seconds=176.0,
        narration_lines=["没有成体系。"],
    )
    method_block = ScreenshotCaptionBlock(
        screenshot_relative_path="img/smart/frame-009.jpg",
        screenshot_alt_text="关键画面 9",
        screenshot_timestamp_seconds=241.0,
        chapter_title="快速搭建体系并完成知识内化",
        window_start_seconds=240.0,
        window_end_seconds=242.0,
        narration_lines=["这么一个方法。"],
    )

    assert _build_visual_subsection_title(intro_block) == "介绍 NotebookLM 工具"
    assert _build_visual_subsection_title(upload_block) == "支持从本地文件导入"
    assert _build_visual_subsection_title(cite_block) == "引用美国儿科学会指南"
    assert _build_visual_subsection_title(compare_block) == "回答不够成体系"
    assert _build_visual_subsection_title(method_block) == "形成可复用的方法"

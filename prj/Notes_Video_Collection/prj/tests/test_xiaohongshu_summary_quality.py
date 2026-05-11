from video_summary_cli.chapter_builder import build_chapters
from video_summary_cli.models import (
    ScreenshotCaptionBlock,
    SummaryDocument,
    TranscriptSegment,
    VideoMetadata,
    VideoPlatform,
)
from video_summary_cli.presentation_builder import (
    _build_ai_summary,
    _build_learning_goal_summary,
    _build_tags,
    _build_visual_subsection_title,
    build_summary_presentation,
)
from video_summary_cli.text_normalizer import normalize_domain_terms


def _build_parenting_transcript() -> list[TranscriptSegment]:
    texts = [
        "这个Notebook LM其实能把本地或者网络上的大量权威资料导入到你自己的一个个人支持库里，对新手父母搭建幼儿支持库很方便。",
        "导入的方式可以通过本地上传文件，也可以直接搜索你想要的东西。我就问他一个问题，作为一个新手父母我应该怎么去照顾0到1岁的婴儿。",
        "他的任何一句话都是有处处和来源的，比如以买通发表的这个7到24月0婴儿卫扬指南的权威解读，还有国家卫生健康委员会发布的婴儿腐蚀添加营养指南。",
        "它不会去产生幻觉，也不会给你瞎编不存在的东西。我们用豆包或者deep seek问同样的问题，就有可能得到凭空编造、东一片西一片、没有成体系的回答。",
        "作为现在的新手家长，去成体系地学习婴儿知识是非常有必要的，因为这些答案如果没有权威来源，你是不能够完全信任的。",
        "Notebook LM给我们提供了一个非常快速高效的体系搭建方法，并且能够帮助我们快速进行知识内化。",
    ]
    return [
        TranscriptSegment(
            start_seconds=index * 45.0,
            end_seconds=index * 45.0 + 35.0,
            text=text,
        )
        for index, text in enumerate(texts)
    ]


def _build_parenting_document() -> SummaryDocument:
    transcript_segments = _build_parenting_transcript()
    chapters = build_chapters(
        transcript_segments,
        min_chapters=6,
        max_chapters=6,
    )
    metadata = VideoMetadata(
        source_url="http://xhslink.com/o/AzAqWIsKgst",
        canonical_url="https://www.xiaohongshu.com/explore/69bbc03d00000000230109d9",
        title="notebooklm建立育儿知识库",
        uploader="高啃菜",
        description=(
            "我建议所有的父母都尝试用Notebooklm建立一个个人育儿知识库"
            "#AI工具[话题]# #AI育儿[话题]# #我的育儿理念[话题]# #育儿新方式[话题]# #AI学习[话题]#"
        ),
        video_id="69bbc03d00000000230109d9",
        platform=VideoPlatform.XIAOHONGSHU,
        published_at="2026-03-19",
        tags=["AI工具", "AI育儿", "我的育儿理念", "育儿新方式", "AI学习", "NotebookLM"],
    )
    return SummaryDocument(
        metadata=metadata,
        abstract=(
            "Notebook LM 可以帮助父母把权威育儿资料整理成个人知识库，"
            "再围绕新手父母最关心的问题进行提问、核验和复用。"
        ),
        bullets=[
            "把 WHO、美国儿科学会和卫健委资料导入知识库",
            "围绕新手父母的真实问题进行提问",
            "优先核对出处，减少通用 AI 的幻觉风险",
        ],
        transcript_segments=transcript_segments,
        chapters=chapters,
    )


def test_normalize_domain_terms_cleans_notebooklm_parenting_asr_noise() -> None:
    source_text = (
        "Notebook LM 可以建立一个U2支持库，我只是把WHO和国家卫健委的一些卫扬指南、"
        "发育金色给导入进来了，他的任何一句话都是有处处和来源的。"
    )

    normalized_text = normalize_domain_terms(source_text)

    assert "Notebook LM" not in normalized_text
    assert "U2支持库" not in normalized_text
    assert "卫扬" not in normalized_text
    assert "发育金色" not in normalized_text
    assert "处处和来源" not in normalized_text
    assert "NotebookLM" in normalized_text
    assert "育儿知识库" in normalized_text
    assert "喂养指南" in normalized_text
    assert "发育监测" in normalized_text
    assert "出处和来源" in normalized_text


def test_build_chapters_prefers_parenting_knowledge_base_themes() -> None:
    chapters = build_chapters(
        _build_parenting_transcript(),
        min_chapters=6,
        max_chapters=6,
    )

    titles = [chapter.title for chapter in chapters]
    joined_titles = " ".join(titles)

    assert len(chapters) == 6
    assert "NotebookLM" in titles[0]
    assert "育儿知识库" in joined_titles
    assert "导入" in joined_titles
    assert any(keyword in joined_titles for keyword in ("权威", "来源", "幻觉"))
    assert any(keyword in joined_titles for keyword in ("通用 AI", "通用"))
    assert any(keyword in joined_titles for keyword in ("知识内化", "体系", "快速"))
    assert all("Worktree" not in chapter.title for chapter in chapters)
    assert all("处处" not in chapter.title for chapter in chapters)


def test_parenting_summary_preface_uses_neutral_video_specific_language() -> None:
    document = _build_parenting_document()

    ai_summary = _build_ai_summary(document)
    learning_goal = _build_learning_goal_summary(document)
    tags = _build_tags(document)

    assert "Worktree" not in ai_summary
    assert "框架设计、调试检验、工作流和上下文资产" not in ai_summary
    assert "育儿知识库" in ai_summary
    assert "权威来源" in ai_summary
    assert "学习与开发框架" not in learning_goal
    assert "新手父母" in learning_goal
    assert "知识库" in learning_goal
    assert tags[:4] == ["AI育儿", "NotebookLM", "育儿知识库", "权威来源"]
    assert "NotebookLM" in tags
    assert "权威来源" in tags
    assert "新手父母" in tags
    assert "xiaohongshu" not in tags
    assert "我的育儿理念" not in tags
    assert "育儿新方式" not in tags
    assert "AI学习" not in tags
    assert "Worktree" not in tags


def test_build_chapters_extracts_parenting_caution_and_cleans_dirty_terms() -> None:
    transcript_segments = [
        TranscriptSegment(
            start_seconds=0.0,
            end_seconds=18.0,
            text="他的这个出处来源是 美国儿科学会发布的这份7到24月龄 婴儿喂养指南的权威解读",
        ),
        TranscriptSegment(
            start_seconds=18.0,
            end_seconds=36.0,
            text="下句话这个也用来源是国家卫生 健康委员会去发布的这个 婴儿府是添加的阴阳指南",
        ),
        TranscriptSegment(
            start_seconds=36.0,
            end_seconds=54.0,
            text="这些答案如果没有权威来源 你是不能够完全信任的 也是无从得知的",
        ),
    ]

    chapters = build_chapters(
        transcript_segments,
        min_chapters=1,
        max_chapters=1,
    )

    assert len(chapters) == 1
    assert any("婴儿辅食添加营养指南" in point for point in chapters[0].key_points)
    assert "不能完全信任" in chapters[0].caution


def test_build_visual_subsection_title_rewrites_parenting_scene_labels() -> None:
    import_block = ScreenshotCaptionBlock(
        screenshot_relative_path="img/notebooklm建立育儿知识库.assets/frame-001-000035.jpg",
        screenshot_alt_text="关键画面 1",
        screenshot_timestamp_seconds=35.0,
        chapter_title="NotebookLM 与育儿知识库搭建",
        window_start_seconds=33.0,
        window_end_seconds=40.0,
        narration_lines=["可以转换为全部导入到你自己的一个个人支持库里。"],
    )
    question_block = ScreenshotCaptionBlock(
        screenshot_relative_path="img/notebooklm建立育儿知识库.assets/frame-008-000098.jpg",
        screenshot_alt_text="关键画面 8",
        screenshot_timestamp_seconds=98.0,
        chapter_title="导入资料并提出育儿问题",
        window_start_seconds=96.0,
        window_end_seconds=100.0,
        narration_lines=["我应该怎么去照顾一个0到1岁的婴儿。"],
    )
    source_block = ScreenshotCaptionBlock(
        screenshot_relative_path="img/notebooklm建立育儿知识库.assets/frame-012-000137.jpg",
        screenshot_alt_text="关键画面 12",
        screenshot_timestamp_seconds=137.0,
        chapter_title="权威来源与回答可信度",
        window_start_seconds=136.0,
        window_end_seconds=140.0,
        narration_lines=["他的每一句话都是有权威的指南。"],
    )
    risk_block = ScreenshotCaptionBlock(
        screenshot_relative_path="img/notebooklm建立育儿知识库.assets/frame-015-000144.jpg",
        screenshot_alt_text="关键画面 15",
        screenshot_timestamp_seconds=144.0,
        chapter_title="对比通用 AI 的幻觉风险",
        window_start_seconds=143.0,
        window_end_seconds=146.0,
        narration_lines=["他不会去产生幻觉。"],
    )

    assert _build_visual_subsection_title(import_block) == "导入权威育儿资料"
    assert _build_visual_subsection_title(question_block) == "向知识库提出育儿问题"
    assert _build_visual_subsection_title(source_block) == "查看回答的权威出处"
    assert _build_visual_subsection_title(risk_block) == "减少幻觉和编造内容"


def test_build_visual_subsection_title_rewrites_additional_parenting_scene_labels() -> None:
    cases = [
        ("它是能将本地或者是网络上的大量的权威的资料。", "汇总权威育儿资料"),
        ("我就问他一个问题。", "开始验证育儿问题"),
        ("就是你作为一个我作为一个新手父母。", "以新手父母视角提问"),
        ("和书籍去支撑的。", "回答由指南和书籍支撑"),
        ("都是由你自己导入的资料去做支撑的。", "回答只基于已导入资料"),
        ("没有成体系。", "回答缺少系统性"),
    ]

    for line, expected_title in cases:
        block = ScreenshotCaptionBlock(
            screenshot_relative_path="img/notebooklm建立育儿知识库.assets/frame-test.jpg",
            screenshot_alt_text="关键画面",
            screenshot_timestamp_seconds=0.0,
            chapter_title="NotebookLM 与育儿知识库搭建",
            window_start_seconds=0.0,
            window_end_seconds=1.0,
            narration_lines=[line],
        )

        assert _build_visual_subsection_title(block) == expected_title


def test_build_visual_subsection_title_prefers_ocr_when_narration_is_generic() -> None:
    block = ScreenshotCaptionBlock(
        screenshot_relative_path="img/notebooklm建立育儿知识库.assets/frame-ocr.jpg",
        screenshot_alt_text="关键画面",
        screenshot_timestamp_seconds=0.0,
        chapter_title="权威来源与回答可信度",
        window_start_seconds=0.0,
        window_end_seconds=1.0,
        narration_lines=["这样呢。"],
        ocr_text="7到24月龄 婴儿喂养指南的权威解读",
    )

    assert _build_visual_subsection_title(block) == "婴儿喂养指南的权威解读"


def test_build_visual_subsection_title_rewrites_real_sample_half_sentences() -> None:
    cases = [
        ("NotebookLM 与育儿知识库搭建", "并且对我的工作和生活带来非常极大便利的一个应用。", "NotebookLM 带来的实际价值"),
        ("NotebookLM 与育儿知识库搭建", "并且可以基于这个知识库。", "基于知识库持续追问"),
        ("NotebookLM 与育儿知识库搭建", "你可以跟它进行无限的沟通对话交流。", "围绕知识库持续对话"),
        ("NotebookLM 与育儿知识库搭建", "还有你甚至说你随便复制一遍文字都可以。", "支持粘贴文本导入"),
        ("NotebookLM 与育儿知识库搭建", "你新来的文字。", "支持粘贴文本导入"),
        ("NotebookLM 与育儿知识库搭建", "或者说是你直接在这里搜索你想要的东西。", "支持搜索后直接导入"),
        ("NotebookLM 与育儿知识库搭建", "他就直接搜索出来之后。", "搜索结果可直接导入"),
        ("导入资料并提出育儿问题", "我觉得他的回答是非常正。", "回答结构更完整"),
        ("权威来源与回答可信度", "下句话这个也用来源是国家卫生。", "引用国家卫健委指南"),
        ("对比通用 AI 的幻觉风险", "你会发现他的回答会更为的。", "通用模型回答更零散"),
        ("对比通用 AI 的幻觉风险", "会是东一片西一片的这样的。", "信息零散且不成体系"),
        ("对比通用 AI 的幻觉风险", "他提供的这么精准。", "数字精准但未必可信"),
        ("对比通用 AI 的幻觉风险", "就是那个这个数字。", "开始核对关键数字来源"),
        ("新手父母为什么要系统学习", "你是不能够知道的。", "无法判断局部错误"),
        ("新手父母为什么要系统学习", "这样呢。", "引出第二个判断点"),
        ("新手父母为什么要系统学习", "然后第二点呢，我是觉得说。", "引出第二个判断点"),
        ("快速搭建体系并完成知识内化", "高效的体系搭建的这么。", "高效搭建知识体系"),
        ("快速搭建体系并完成知识内化", "一个。", "形成可复用的方法"),
        ("快速搭建体系并完成知识内化", "然后并且能够帮助我们。", "帮助持续知识内化"),
    ]

    for chapter_title, line, expected_title in cases:
        block = ScreenshotCaptionBlock(
            screenshot_relative_path="img/notebooklm建立育儿知识库.assets/frame-test-2.jpg",
            screenshot_alt_text="关键画面",
            screenshot_timestamp_seconds=0.0,
            chapter_title=chapter_title,
            window_start_seconds=0.0,
            window_end_seconds=1.0,
            narration_lines=[line],
        )

        assert _build_visual_subsection_title(block) == expected_title


def test_build_chapters_and_presentation_clean_parenting_spoken_fillers() -> None:
    transcript_segments = [
        TranscriptSegment(
            start_seconds=0.0,
            end_seconds=18.0,
            text=(
                "这个NotebookLM呢 其实呢它是能将那个本地或者是网络上的大量的权威的资料呢 "
                "可以转换为全部导入到你自己的一个个人知识库里。"
            ),
        ),
        TranscriptSegment(
            start_seconds=18.0,
            end_seconds=36.0,
            text=(
                "还有你甚至说你随便复制一遍文字都可以 你新来的文字 "
                "或者说是你直接在这里搜索你想要的东西。"
            ),
        ),
        TranscriptSegment(
            start_seconds=36.0,
            end_seconds=54.0,
            text="然后并且能够帮助我们 快速的进行知识内化。",
        ),
    ]
    chapters = build_chapters(
        transcript_segments,
        min_chapters=1,
        max_chapters=1,
    )
    document = SummaryDocument(
        metadata=VideoMetadata(
            source_url="http://xhslink.com/o/AzAqWIsKgst",
            canonical_url="https://www.xiaohongshu.com/explore/69bbc03d00000000230109d9",
            title="notebooklm建立育儿知识库",
            uploader="高啃菜",
            description="测试简介",
            video_id="69bbc03d00000000230109d9",
            platform=VideoPlatform.XIAOHONGSHU,
            tags=["AI育儿", "NotebookLM"],
        ),
        abstract="测试摘要",
        bullets=["测试要点"],
        transcript_segments=transcript_segments,
        screenshots=[],
        chapters=chapters,
    )

    presentation = build_summary_presentation(document, summary_style="tutorial-note")
    chapter_lines = "\n".join(presentation.sections[-1].lines)
    chapter_summary_text = " ".join([chapters[0].goal, *chapters[0].key_points, chapters[0].caution])

    for phrase in ("其实呢", "你新来的文字", "然后并且能够帮助我们"):
        assert phrase not in chapter_summary_text
        assert phrase not in chapter_lines
    assert "个人知识库" in chapter_summary_text
    assert any(keyword in chapter_summary_text for keyword in ("粘贴", "搜索", "知识内化"))

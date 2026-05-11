from video_summary_cli.models import ScreenshotAsset, SummaryChapter, TranscriptSegment


def _build_long_transcript() -> list[TranscriptSegment]:
    texts = [
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
    return [
        TranscriptSegment(
            start_seconds=index * 60.0,
            end_seconds=index * 60.0 + 45.0,
            text=text,
        )
        for index, text in enumerate(texts)
    ]


def _build_repeated_theme_transcript() -> list[TranscriptSegment]:
    texts = [
        "提示词工程决定 AI 输出质量，也决定后续复用效率。",
        "项目记忆和上下文管理要和提示词工程一起设计。",
        "提示词工程不是一次性提问，而是可复用资产。",
        "MCP 和上下文打包能让同类任务稳定复现。",
        "提示词工程还要配合调试日志与框架约束。",
        "记录工作流后，后续迭代会越来越快。",
    ]
    return [
        TranscriptSegment(
            start_seconds=index * 90.0,
            end_seconds=index * 90.0 + 60.0,
            text=text,
        )
        for index, text in enumerate(texts)
    ]


def _build_codex_app_dirty_transcript() -> list[TranscriptSegment]:
    texts = [
        "大家好 open家最近推出一款非常热门的AI编程工具 叫class app。",
        "下载完之后先设置语言 默认打开目标 防止休眠 再选择模型和推理级别。",
        "创建新项目之后先初始化git 然后打开plan模式 也可以用语音输入描述需求。",
        "plan会澄清需求并生成实施计划 适合新的项目0到1。",
        "线程运行时可以归档 也可以配置启动命令 debug命令和环境。",
        "等待回复的时候可以先查看线程状态 再决定是否继续运行和调试。",
        "如果页面不好看 就安装front end技能或者UI技能来优化界面。",
        "你可以用美元符号调用技能 也可以去网站安装技能。",
        "work tree可以并行开发订单和账号两个功能 最后合并到main。",
        "不要直接覆盖 main 分支 更适合用应用的方式把变更打回去。",
        "自动化可以每天生成简报 项目记忆和总结都可以复用。",
        "还可以安装MCP去测试网站 比如自动打开浏览器回归登录流程。",
    ]
    return [
        TranscriptSegment(
            start_seconds=index * 60.0,
            end_seconds=index * 60.0 + 40.0,
            text=text,
        )
        for index, text in enumerate(texts)
    ]


def _build_subagent_dirty_transcript() -> list[TranscriptSegment]:
    texts = [
        "glass app最近发布了新版本 支持子弹 Sub agents 可以并行多个任务。",
        "主代理负责理解需求 子代理分别负责安全性 代码质量 错误和竞争条件。",
        "每一个子代理都会生成自己的提示词 你也可以在线程里面查看运行过程。",
        "主代理在子代理运行时会停下来 等结果返回后再继续往下执行。",
        "主代理负责协调更多子代理 子代理只关注review代码或者生成接口文档。",
        "每个子代理都有独立上下文 所以能减少主代理的上下文消耗。",
        "把大任务拆给不同子代理去运行 效率会更高 也是并行的独立空间。",
        "这些自动创建的子代点往往是临时性的 换项目之后可能就没有了。",
        "你也可以自定义子代理 它是TOML格式 还能配置沙箱 MCP 和 skills。",
        "项目目录和公共目录都可以放子代理定义 以后别的地方也能复用。",
        "实践上要低耦合拆分 明确职责范围 并且约束返回结果格式。",
        "如果个别子代理失败 也不要影响主流程 这样更适合落地。",
    ]
    return [
        TranscriptSegment(
            start_seconds=index * 45.0,
            end_seconds=index * 45.0 + 30.0,
            text=text,
        )
        for index, text in enumerate(texts)
    ]


def _build_notebooklm_parenting_transcript() -> list[TranscriptSegment]:
    texts = [
        "NotebookLM 可以把 WHO、美国儿科学会和国家卫健委的资料整理成个人育儿知识库。",
        "对于新手父母来说，先搭一个可追溯的育儿知识库会更安心。",
        "导入方式可以是本地文件、网页链接，或者直接搜索后加入知识库。",
        "几分钟就能完成第一版资料库搭建，不需要先自己手工整理。",
        "我先问它一个问题，新手父母应该如何照顾 0 到 1 岁的婴儿。",
        "回答会从科学喂养、发育监测、情感培育和父母自我支持几个方面展开。",
        "每一句回答都能看到出处和来源，比如 WHO、美国儿科学会和国家卫生健康委员会的指南。",
        "基于自己导入的资料，回答更稳定，也不容易产生幻觉。",
        "如果用豆包或 DeepSeek 问同样的问题，回答往往不够成体系。",
        "数字看起来很精准，但你很难判断是不是来自权威指南。",
        "对新手家长来说，系统学习育儿知识很难，NotebookLM 可以帮你快速搭建体系。",
        "它更适合作为长期更新的个人育儿学习工具，帮助持续知识内化。",
    ]
    return [
        TranscriptSegment(
            start_seconds=index * 40.0,
            end_seconds=index * 40.0 + 28.0,
            text=text,
        )
        for index, text in enumerate(texts)
    ]


def test_new_chapter_modules_export_core_functions() -> None:
    from video_summary_cli.chapter_visual_binding import bind_screenshots_to_chapters
    from video_summary_cli.chaptering import build_chapters, select_key_segments_for_chapters

    assert callable(build_chapters)
    assert callable(select_key_segments_for_chapters)
    assert callable(bind_screenshots_to_chapters)


def test_build_chapters_generates_ordered_sections_for_long_transcript() -> None:
    from video_summary_cli.chapter_builder import build_chapters

    chapters = build_chapters(_build_long_transcript())

    assert 3 <= len(chapters) <= 6
    previous_end = -1.0
    for chapter in chapters:
        assert chapter.title
        assert isinstance(chapter.goal, str)
        assert isinstance(chapter.key_points, list)
        assert isinstance(chapter.example_or_case, str)
        assert isinstance(chapter.caution, str)
        assert isinstance(chapter.screenshot_paths, list)
        assert chapter.anchor_start_seconds <= chapter.anchor_end_seconds
        assert chapter.anchor_start_seconds >= previous_end
        previous_end = chapter.anchor_end_seconds


def test_build_chapters_deduplicates_titles_and_compresses_goals() -> None:
    from video_summary_cli.chapter_builder import build_chapters

    transcript_segments = _build_repeated_theme_transcript()
    chapters = build_chapters(
        transcript_segments,
        min_chapters=3,
        max_chapters=3,
    )

    assert len(chapters) == 3
    assert len({chapter.title for chapter in chapters}) == len(chapters)

    grouped_texts = [
        " ".join(segment.text for segment in transcript_segments[index * 2 : (index + 1) * 2])
        for index in range(3)
    ]
    for chapter, raw_group_text in zip(chapters, grouped_texts):
        assert chapter.goal
        assert len(chapter.goal) < len(raw_group_text)
        assert 2 <= len(chapter.key_points) <= 3
        assert len(chapter.key_points) == len(set(chapter.key_points))


def test_build_chapters_prefers_codex_app_themes_over_dirty_asr_clauses() -> None:
    from video_summary_cli.chapter_builder import build_chapters

    chapters = build_chapters(
        _build_codex_app_dirty_transcript(),
        min_chapters=6,
        max_chapters=6,
    )

    assert [chapter.title for chapter in chapters] == [
        "基础设置与模型选择",
        "项目初始化与 Plan 模式",
        "线程管理与运行调试",
        "技能安装与界面优化",
        "Worktree 并行开发",
        "自动化、记忆与 MCP 测试",
    ]
    assert all("class app" not in chapter.title.lower() for chapter in chapters)
    assert all(not chapter.title.startswith(("大家好", "那么", "然后")) for chapter in chapters)


def test_build_chapters_prefers_subagent_themes_over_dirty_asr_clauses() -> None:
    from video_summary_cli.chapter_builder import build_chapters

    chapters = build_chapters(
        _build_subagent_dirty_transcript(),
        min_chapters=6,
        max_chapters=6,
    )

    assert [chapter.title for chapter in chapters] == [
        "子代理基础与角色分工",
        "子代理提示词与线程查看",
        "主代理协调与上下文隔离",
        "并行协作与临时子代理",
        "自定义子代理与权限配置",
        "子代理实践建议",
    ]
    assert all("glass app" not in chapter.title.lower() for chapter in chapters)
    assert all("子弹" not in chapter.title for chapter in chapters)


def test_build_chapters_prefers_notebooklm_parenting_themes_over_raw_asr_clauses() -> None:
    from video_summary_cli.chapter_builder import build_chapters

    chapters = build_chapters(
        _build_notebooklm_parenting_transcript(),
        min_chapters=6,
        max_chapters=6,
    )

    titles = [chapter.title for chapter in chapters]
    joined_titles = " ".join(titles)

    assert len(chapters) == 6
    assert "NotebookLM" in titles[0]
    assert "育儿知识库" in joined_titles
    assert "导入" in joined_titles
    assert any(keyword in joined_titles for keyword in ("提问", "新手父母"))
    assert any(keyword in joined_titles for keyword in ("权威", "来源", "幻觉"))
    assert "通用 AI" in joined_titles
    assert any(keyword in joined_titles for keyword in ("体系", "知识内化"))
    assert all("Worktree" not in chapter.title for chapter in chapters)
    assert all("并行开发" not in chapter.title for chapter in chapters)
    assert all("Notebook LM" not in chapter.title for chapter in chapters)


def test_normalize_domain_terms_fixes_long_tail_codex_variants() -> None:
    from video_summary_cli.text_normalizer import normalize_domain_terms

    assert "Codex" in normalize_domain_terms("克莱X它有个功能叫自动化")
    assert "Codex" in normalize_domain_terms("你克莱斯保持一个运行的状态")
    assert "GPT-5.3 Codex" in normalize_domain_terms("比如说GPT5.3COTEX")
    assert "Map Codebase" in normalize_domain_terms("用这个JSD的这个macoo base 去了解这个代码库的时候")


def test_normalize_domain_terms_fixes_notebooklm_parenting_variants() -> None:
    from video_summary_cli.text_normalizer import normalize_domain_terms

    normalized_text = normalize_domain_terms(
        "这个Notebook LM可以把支持库里的卫扬指南 发育金色和腐蚀添加资料整理出来 还能告诉你每句话的处处来源"
    )

    assert "NotebookLM" in normalized_text
    assert "知识库" in normalized_text
    assert "喂养指南" in normalized_text
    assert "发育监测" in normalized_text
    assert "辅食添加" in normalized_text
    assert "出处来源" in normalized_text


def test_build_chapters_prefers_notebooklm_parenting_themes_over_dirty_asr_clauses() -> None:
    from video_summary_cli.chapter_builder import build_chapters

    chapters = build_chapters(
        _build_notebooklm_parenting_dirty_transcript(),
        min_chapters=6,
        max_chapters=6,
    )

    titles = [chapter.title for chapter in chapters]
    joined_titles = " ".join(titles)

    assert len(chapters) == 6
    assert "NotebookLM" in titles[0]
    assert "育儿知识库" in joined_titles
    assert "导入" in joined_titles
    assert any(keyword in joined_titles for keyword in ("提问", "新手父母"))
    assert any(keyword in joined_titles for keyword in ("权威", "来源", "幻觉"))
    assert "通用 AI" in joined_titles
    assert any(keyword in joined_titles for keyword in ("体系", "知识内化"))
    assert all("Worktree" not in chapter.title for chapter in chapters)
    assert all("子代理" not in chapter.title for chapter in chapters)
    assert all("随便复制" not in chapter.title for chapter in chapters)


def test_select_key_segments_for_chapters_covers_early_middle_and_late_ranges() -> None:
    from video_summary_cli.chapter_builder import build_chapters, select_key_segments_for_chapters

    transcript_segments = _build_long_transcript()
    chapters = build_chapters(transcript_segments)

    key_segments = select_key_segments_for_chapters(
        transcript_segments=transcript_segments,
        chapters=chapters,
        limit=5,
    )

    timestamps = [segment.start_seconds for segment in key_segments]
    assert len(key_segments) == min(len(chapters), 5)
    assert min(timestamps) < 180.0
    assert any(180.0 <= timestamp < 420.0 for timestamp in timestamps)
    assert max(timestamps) >= 420.0


def test_bind_screenshots_to_chapters_keeps_at_most_one_image_per_chapter() -> None:
    from video_summary_cli.chapter_builder import bind_screenshots_to_chapters, build_chapters

    chapters = build_chapters(_build_long_transcript())
    screenshots = [
        ScreenshotAsset(timestamp_seconds=30.0, relative_path="img/smart/frame-001-000030.jpg", alt_text="画面 1"),
        ScreenshotAsset(timestamp_seconds=210.0, relative_path="img/smart/frame-002-000210.jpg", alt_text="画面 2"),
        ScreenshotAsset(timestamp_seconds=240.0, relative_path="img/smart/frame-003-000240.jpg", alt_text="画面 3"),
        ScreenshotAsset(timestamp_seconds=510.0, relative_path="img/smart/frame-004-000510.jpg", alt_text="画面 4"),
        ScreenshotAsset(timestamp_seconds=660.0, relative_path="img/smart/frame-005-000660.jpg", alt_text="画面 5"),
    ]

    bound_chapters = bind_screenshots_to_chapters(chapters=chapters, screenshots=screenshots)

    assert any(chapter.screenshot_paths for chapter in bound_chapters)
    assert all(len(chapter.screenshot_paths) <= 1 for chapter in bound_chapters)


def test_bind_screenshots_to_chapters_prefers_ocr_difference_when_available() -> None:
    from video_summary_cli.chapter_builder import bind_screenshots_to_chapters

    chapters = [
        SummaryChapter(
            title="章节一",
            goal="目标一",
            key_points=["要点一", "要点二"],
            example_or_case="案例一",
            caution="注意一",
            anchor_start_seconds=0.0,
            anchor_end_seconds=100.0,
        ),
        SummaryChapter(
            title="章节二",
            goal="目标二",
            key_points=["要点一", "要点二"],
            example_or_case="案例二",
            caution="注意二",
            anchor_start_seconds=100.0,
            anchor_end_seconds=200.0,
        ),
    ]
    screenshots = [
        ScreenshotAsset(
            timestamp_seconds=45.0,
            relative_path="img/smart/frame-a.jpg",
            alt_text="画面 A",
            visual_difference_score=0.2,
            text_difference_score=0.1,
            ocr_text="相同标题页",
        ),
        ScreenshotAsset(
            timestamp_seconds=55.0,
            relative_path="img/smart/frame-b.jpg",
            alt_text="画面 B",
            visual_difference_score=0.2,
            text_difference_score=0.95,
            ocr_text="新的代码示例页",
        ),
        ScreenshotAsset(
            timestamp_seconds=150.0,
            relative_path="img/smart/frame-c.jpg",
            alt_text="画面 C",
            visual_difference_score=0.3,
            text_difference_score=0.0,
            ocr_text="章节二画面",
        ),
    ]

    bound_chapters = bind_screenshots_to_chapters(chapters=chapters, screenshots=screenshots)

    assert bound_chapters[0].screenshot_paths == ["img/smart/frame-b.jpg"]
    assert bound_chapters[1].screenshot_paths == ["img/smart/frame-c.jpg"]


def test_bind_screenshots_to_chapters_falls_back_to_visual_difference_without_ocr() -> None:
    from video_summary_cli.chapter_builder import bind_screenshots_to_chapters

    chapters = [
        SummaryChapter(
            title="章节一",
            goal="目标一",
            key_points=["要点一", "要点二"],
            example_or_case="案例一",
            caution="注意一",
            anchor_start_seconds=0.0,
            anchor_end_seconds=100.0,
        ),
        SummaryChapter(
            title="章节二",
            goal="目标二",
            key_points=["要点一", "要点二"],
            example_or_case="案例二",
            caution="注意二",
            anchor_start_seconds=100.0,
            anchor_end_seconds=200.0,
        ),
    ]
    screenshots = [
        ScreenshotAsset(
            timestamp_seconds=45.0,
            relative_path="img/smart/frame-a.jpg",
            alt_text="画面 A",
            visual_difference_score=0.15,
        ),
        ScreenshotAsset(
            timestamp_seconds=55.0,
            relative_path="img/smart/frame-b.jpg",
            alt_text="画面 B",
            visual_difference_score=0.85,
        ),
    ]

    bound_chapters = bind_screenshots_to_chapters(chapters=chapters, screenshots=screenshots)

    assert bound_chapters[0].screenshot_paths == ["img/smart/frame-b.jpg"]
    assert bound_chapters[1].screenshot_paths == []


def test_bind_screenshots_to_chapters_prefers_clearer_frame_when_other_scores_tie() -> None:
    from video_summary_cli.chapter_builder import bind_screenshots_to_chapters

    chapters = [
        SummaryChapter(
            title="章节一",
            goal="目标一",
            key_points=["要点一", "要点二"],
            example_or_case="案例一",
            caution="注意一",
            anchor_start_seconds=0.0,
            anchor_end_seconds=100.0,
        ),
    ]
    screenshots = [
        ScreenshotAsset(
            timestamp_seconds=48.0,
            relative_path="img/smart/frame-a.jpg",
            alt_text="画面 A",
            visual_difference_score=0.4,
            text_difference_score=0.4,
            blur_score=0.2,
        ),
        ScreenshotAsset(
            timestamp_seconds=52.0,
            relative_path="img/smart/frame-b.jpg",
            alt_text="画面 B",
            visual_difference_score=0.4,
            text_difference_score=0.4,
            blur_score=0.9,
        ),
    ]

    bound_chapters = bind_screenshots_to_chapters(chapters=chapters, screenshots=screenshots)

    assert bound_chapters[0].screenshot_paths == ["img/smart/frame-b.jpg"]


def test_bind_screenshots_to_chapters_prefers_more_informative_frame_when_timing_is_similar() -> None:
    from video_summary_cli.chapter_builder import bind_screenshots_to_chapters

    chapters = [
        SummaryChapter(
            title="章节一",
            goal="目标一",
            key_points=["要点一", "要点二"],
            example_or_case="案例一",
            caution="注意一",
            anchor_start_seconds=0.0,
            anchor_end_seconds=100.0,
        ),
    ]
    screenshots = [
        ScreenshotAsset(
            timestamp_seconds=48.0,
            relative_path="img/smart/frame-a.jpg",
            alt_text="画面 A",
            visual_difference_score=0.35,
            blur_score=0.45,
            content_score=0.10,
        ),
        ScreenshotAsset(
            timestamp_seconds=52.0,
            relative_path="img/smart/frame-b.jpg",
            alt_text="画面 B",
            visual_difference_score=0.30,
            blur_score=0.42,
            content_score=0.92,
        ),
    ]

    bound_chapters = bind_screenshots_to_chapters(chapters=chapters, screenshots=screenshots)

    assert bound_chapters[0].screenshot_paths == ["img/smart/frame-b.jpg"]


def test_bind_screenshots_to_chapters_normalizes_large_blur_scores() -> None:
    from video_summary_cli.chapter_builder import bind_screenshots_to_chapters

    chapters = [
        SummaryChapter(
            title="章节一",
            goal="目标一",
            key_points=["要点一", "要点二"],
            example_or_case="案例一",
            caution="注意一",
            anchor_start_seconds=1800.0,
            anchor_end_seconds=2200.0,
        ),
    ]
    screenshots = [
        ScreenshotAsset(
            timestamp_seconds=1953.0,
            relative_path="img/smart/frame-a.jpg",
            alt_text="画面 A",
            visual_difference_score=0.0001,
            blur_score=2046.45,
            content_score=0.44,
        ),
        ScreenshotAsset(
            timestamp_seconds=1989.0,
            relative_path="img/smart/frame-b.jpg",
            alt_text="画面 B",
            visual_difference_score=0.0010,
            blur_score=1105.32,
            content_score=0.61,
        ),
    ]

    bound_chapters = bind_screenshots_to_chapters(chapters=chapters, screenshots=screenshots)

    assert bound_chapters[0].screenshot_paths == ["img/smart/frame-b.jpg"]


def test_bind_screenshots_to_chapters_covers_all_chapters_when_midpoint_candidates_exist() -> None:
    from video_summary_cli.chapter_builder import bind_screenshots_to_chapters, build_chapters

    chapters = build_chapters(_build_long_transcript())
    screenshots = [
        ScreenshotAsset(
            timestamp_seconds=(chapter.anchor_start_seconds + chapter.anchor_end_seconds) / 2,
            relative_path=f"img/smart/frame-{index:03d}.jpg",
            alt_text=f"画面 {index}",
        )
        for index, chapter in enumerate(chapters, 1)
    ]

    bound_chapters = bind_screenshots_to_chapters(chapters=chapters, screenshots=screenshots)

    assert len(bound_chapters) == len(chapters)
    assert all(chapter.screenshot_paths for chapter in bound_chapters)


def test_bind_screenshots_to_chapters_prefers_information_dense_frame() -> None:
    from video_summary_cli.chapter_builder import bind_screenshots_to_chapters

    chapters = [
        SummaryChapter(
            title="章节一",
            goal="目标一",
            key_points=["要点一", "要点二"],
            example_or_case="案例一",
            caution="注意一",
            anchor_start_seconds=0.0,
            anchor_end_seconds=100.0,
        ),
    ]
    screenshots = [
        ScreenshotAsset(
            timestamp_seconds=48.0,
            relative_path="img/smart/frame-a.jpg",
            alt_text="画面 A",
            visual_difference_score=0.4,
            blur_score=0.5,
            information_density_score=0.1,
        ),
        ScreenshotAsset(
            timestamp_seconds=52.0,
            relative_path="img/smart/frame-b.jpg",
            alt_text="画面 B",
            visual_difference_score=0.4,
            blur_score=0.5,
            information_density_score=0.9,
        ),
    ]

    bound_chapters = bind_screenshots_to_chapters(chapters=chapters, screenshots=screenshots)

    assert bound_chapters[0].screenshot_paths == ["img/smart/frame-b.jpg"]


def _build_notebooklm_parenting_dirty_transcript() -> list[TranscriptSegment]:
    texts = [
        "我觉得所有的父母都应该尝试用这个Notebook LM来建立一个属于自己的U2支持库。",
        "这个Notebook LM上手非常容易 它能把本地或者网络上的大量权威资料整理起来。",
        "我只是把WHO 美国儿科学会 还有国家卫健委的一些最底层的卫扬指南 发育金色给导入进来了。",
        "导入的方式可以通过本地上传文件 甚至说你随便复制一遍文字都可以 或者直接搜索你想要的东西。",
        "这个用几分钟时间形成这个支持库之后 我就问他一个问题 作为新手父母 我应该怎么去照顾一个0到1岁的婴儿。",
        "我觉得他的回答非常好 提到了科学卫扬 发育金色 情感培育和父母自我支持这几个方面。",
        "你看他的每一句话 他的这个处处来源是美国儿科学会发表的这个7到24月龄婴儿卫扬指南的权威解读。",
        "下句话这个也有来源 是国家卫生健康委员会发布的婴儿腐蚀添加营养指南 他不会去产生幻觉。",
        "我们去使用豆包或者deep seek去问同样的问题的时候 就会有凭空给你编造的东西。",
        "你会发现他的回答没有成体系 会东一片西一片 这个数字来源到底出自权威指南还是随便一个人 你无从得知。",
        "作为现在的新手家长 我们去搭建这么一套婴儿体系 去成体系地学习育儿知识 是非常有必要的。",
        "Notebook LM给我们提供了一个非常快速 高效的体系搭建方法 并且能够帮助我们快速进行知识内化。",
    ]
    return [
        TranscriptSegment(
            start_seconds=index * 24.0,
            end_seconds=index * 24.0 + 18.0,
            text=text,
        )
        for index, text in enumerate(texts)
    ]

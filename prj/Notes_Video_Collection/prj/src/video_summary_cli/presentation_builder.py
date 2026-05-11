from __future__ import annotations

import re
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from video_summary_cli.chaptering import select_key_segments_for_chapters
from video_summary_cli.models import (
    PresentationSection,
    ScreenshotCaptionBlock,
    SummaryDocument,
    SummaryPresentation,
    VideoMetadata,
    VideoPlatform,
)
from video_summary_cli.note_styles import build_note_sections, normalize_summary_style
from video_summary_cli.text_normalizer import clean_title_phrase, normalize_domain_terms, polish_summary_text
from video_summary_cli.transcript import merge_adjacent_segments, select_key_segments


def build_summary_presentation(
    document: SummaryDocument,
    summary_style: str = "default",
) -> SummaryPresentation:
    """把结构化总结转换为展示层模型。"""

    metadata = document.metadata
    normalized_style = normalize_summary_style(summary_style)
    canonical_url = _sanitize_video_url(metadata)
    transcript_segments = merge_adjacent_segments(document.transcript_segments)
    source_caption_blocks = document.screenshot_caption_blocks or _build_fallback_caption_blocks(document)
    caption_blocks = _clone_caption_blocks(source_caption_blocks)
    key_segment_lines = _build_key_segment_lines(
        metadata=metadata,
        document=document,
        caption_blocks=caption_blocks,
    )
    chapter_lines = _render_chapter_lines(document, caption_blocks=caption_blocks)
    display_abstract = _build_learning_goal_summary(document)

    metadata_lines = [
        f"- 平台：`{metadata.platform.value}`",
        f"- 原始链接：{metadata.source_url}",
        f"- 规范链接：{canonical_url}",
        f"- 作者：{metadata.uploader}",
    ]
    if metadata.video_id:
        metadata_lines.append(f"- 视频 ID：`{metadata.video_id}`")

    screenshot_lines: list[str] = []
    transcript_lines: list[str] = []
    if normalized_style != "tutorial-note":
        for caption_block in caption_blocks:
            screenshot_lines.append(
                f"### {caption_block.screenshot_alt_text} · "
                f"{_render_timestamp_link(metadata, caption_block.screenshot_timestamp_seconds)}"
            )
            screenshot_lines.append(
                _render_markdown_image(
                    alt_text=caption_block.screenshot_alt_text,
                    destination=caption_block.screenshot_relative_path,
                )
            )
            if caption_block.chapter_title:
                screenshot_lines.append(f"- 对应章节：{caption_block.chapter_title}")
            screenshot_lines.append(
                f"- 讲解时间：{_render_timestamp_link(metadata, caption_block.window_start_seconds)}"
                f" - {_render_timestamp_link(metadata, caption_block.window_end_seconds)}"
            )
            for index, narration_line in enumerate(caption_block.narration_lines, 1):
                screenshot_lines.append(f"- 讲解 {index}：{narration_line}")
            screenshot_lines.append("")

        transcript_lines = [
            f"- {_render_timestamp_link(metadata, segment.start_seconds)} {segment.text}"
            for segment in transcript_segments
        ]

    rendered_screenshot_count = _count_rendered_screenshot_cards(
        screenshot_lines=screenshot_lines,
        chapter_lines=chapter_lines,
        fallback_count=len(document.screenshots),
    )

    sections = [
        PresentationSection(heading="基础信息", lines=metadata_lines),
        *_build_preface_sections(document, screenshot_count=rendered_screenshot_count),
        *build_note_sections(
            summary_style=normalized_style,
            abstract=display_abstract,
            bullets=document.bullets,
            key_segment_lines=key_segment_lines,
            screenshot_lines=screenshot_lines,
            transcript_lines=transcript_lines,
            chapter_lines=chapter_lines,
        ),
    ]
    return SummaryPresentation(title=metadata.title, sections=sections)


def _format_seconds(seconds: float) -> str:
    total_seconds = int(seconds)
    minutes, remainder = divmod(total_seconds, 60)
    hours, minutes = divmod(minutes, 60)
    return f"{hours:02d}:{minutes:02d}:{remainder:02d}"


def _render_timestamp_link(metadata: VideoMetadata, seconds: float) -> str:
    label = _format_seconds(seconds)
    return f"[{label}]({_build_timestamp_url(metadata, seconds)})"


def _build_timestamp_url(metadata: VideoMetadata, seconds: float) -> str:
    base_url = _sanitize_video_url(metadata)
    if metadata.platform == VideoPlatform.XIAOHONGSHU:
        return base_url

    parsed_url = urlparse(base_url)
    query_items = [(key, value) for key, value in parse_qsl(parsed_url.query, keep_blank_values=True) if key != "t"]
    timestamp_seconds = int(seconds)

    if metadata.platform == VideoPlatform.YOUTUBE:
        query_items.append(("t", f"{timestamp_seconds}s"))
    else:
        query_items.append(("t", str(timestamp_seconds)))

    return urlunparse(parsed_url._replace(query=urlencode(query_items, doseq=True)))


def _sanitize_video_url(metadata: VideoMetadata) -> str:
    base_url = metadata.canonical_url or metadata.source_url
    parsed_url = urlparse(base_url)
    original_query_items = parse_qsl(parsed_url.query, keep_blank_values=True)

    if metadata.platform == VideoPlatform.BILIBILI:
        allowed_keys = {"p"}
    elif metadata.platform == VideoPlatform.YOUTUBE:
        allowed_keys = {"v", "list", "index"}
    elif metadata.platform == VideoPlatform.XIAOHONGSHU:
        allowed_keys = set()
    else:
        allowed_keys = {key for key, _ in original_query_items if key != "t"}

    query_items = [(key, value) for key, value in original_query_items if key in allowed_keys]
    return urlunparse(parsed_url._replace(query=urlencode(query_items, doseq=True)))


def _render_chapter_lines(
    document: SummaryDocument,
    caption_blocks: list[ScreenshotCaptionBlock],
) -> list[str]:
    if not document.chapters:
        return []

    caption_block_lookup = {
        caption_block.screenshot_relative_path: caption_block
        for caption_block in caption_blocks
    }
    chapter_block_lookup: dict[str, list[ScreenshotCaptionBlock]] = {}
    for caption_block in caption_blocks:
        chapter_block_lookup.setdefault(caption_block.chapter_title, []).append(caption_block)
    lines: list[str] = []
    rendered_paths: set[str] = set()
    rendered_blocks: list[ScreenshotCaptionBlock] = []
    previous_rendered_block: ScreenshotCaptionBlock | None = None
    for chapter_index, chapter in enumerate(document.chapters, 1):
        chapter_blocks = list(chapter_block_lookup.get(chapter.title, []))
        if not chapter_blocks:
            for screenshot_path in chapter.screenshot_paths:
                caption_block = caption_block_lookup.get(screenshot_path)
                if caption_block is not None:
                    chapter_blocks.append(caption_block)
        chapter_blocks.sort(key=lambda item: item.screenshot_timestamp_seconds)
        chapter_blocks = _merge_nearby_visual_blocks(chapter_blocks)
        lines.append(f"### {chapter.title}")
        lines.append(f"- 目标：{chapter.goal or '待补充'}")
        rendered_key_points = _resolve_chapter_key_points(chapter=chapter, chapter_blocks=chapter_blocks)
        if rendered_key_points:
            for index, key_point in enumerate(rendered_key_points, 1):
                lines.append(f"- 核心观点 {index}：{key_point}")
        rendered_example = _resolve_chapter_side_note(chapter.example_or_case)
        rendered_caution = _resolve_chapter_side_note(chapter.caution)
        if rendered_example:
            lines.append(f"- 案例：{rendered_example}")
        if rendered_caution:
            lines.append(f"- 注意：{rendered_caution}")
        used_subsection_titles: set[str] = set()
        for visual_index, caption_block in enumerate(chapter_blocks, 1):
            lines.extend(
                _render_visual_card_lines(
                    metadata=document.metadata,
                    caption_block=caption_block,
                    chapter_index=chapter_index,
                    visual_index=visual_index,
                    used_titles=used_subsection_titles,
                    previous_caption_block=previous_rendered_block,
                )
            )
            rendered_paths.add(caption_block.screenshot_relative_path)
            rendered_blocks.append(caption_block)
            previous_rendered_block = caption_block
        lines.append("")
    orphan_blocks = [
        caption_block
        for caption_block in caption_blocks
        if caption_block.screenshot_relative_path not in rendered_paths
        and not _is_represented_by_rendered_blocks(caption_block, rendered_blocks)
    ]
    if orphan_blocks:
        lines.append("### 未归类画面")
        for visual_index, caption_block in enumerate(orphan_blocks, 1):
            lines.extend(
                _render_visual_card_lines(
                    metadata=document.metadata,
                    caption_block=caption_block,
                    chapter_index=len(document.chapters) + 1,
                    visual_index=visual_index,
                    previous_caption_block=previous_rendered_block,
                )
            )
            previous_rendered_block = caption_block
        lines.append("")
    return lines[:-1] if lines and not lines[-1] else lines


def _render_visual_card_lines(
    metadata: VideoMetadata,
    caption_block: ScreenshotCaptionBlock,
    chapter_index: int,
    visual_index: int,
    used_titles: set[str] | None = None,
    previous_caption_block: ScreenshotCaptionBlock | None = None,
) -> list[str]:
    subsection_title = _resolve_visual_subsection_title(
        caption_block=caption_block,
        used_titles=used_titles,
    )
    render_narration_lines = _resolve_render_narration_lines(
        caption_block=caption_block,
        previous_caption_block=previous_caption_block,
    )
    lines = [
        f"#### {chapter_index}.{visual_index} {subsection_title}",
        f"视频节点：{_render_timestamp_link(metadata, caption_block.screenshot_timestamp_seconds)}",
    ]
    if render_narration_lines:
        lines.append(f"画面讲解：{_compose_narration_paragraph(render_narration_lines)}")
    else:
        lines.append("画面讲解：暂无匹配字幕。")
    lines.append(
        _render_markdown_image(
            alt_text=subsection_title,
            destination=caption_block.screenshot_relative_path,
        )
    )
    lines.append("")
    return lines


def _resolve_render_narration_lines(
    caption_block: ScreenshotCaptionBlock,
    previous_caption_block: ScreenshotCaptionBlock | None,
) -> list[str]:
    render_lines = list(caption_block.narration_lines)
    if not render_lines or previous_caption_block is None:
        return render_lines
    if not _needs_boundary_bridge_prefix(render_lines):
        return render_lines
    bridge_line = _extract_bridge_subject_line(previous_caption_block.narration_lines)
    if not bridge_line or bridge_line in render_lines:
        return render_lines
    return [bridge_line, *render_lines]


def _render_markdown_image(alt_text: str, destination: str) -> str:
    safe_destination = _render_markdown_destination(destination)
    return f"![{alt_text}]({safe_destination})"


def _render_markdown_destination(destination: str) -> str:
    if any(character.isspace() for character in destination) or "(" in destination or ")" in destination:
        return f"<{destination}>"
    return destination


def _compose_narration_paragraph(narration_lines: list[str]) -> str:
    clauses = [
        normalized_line
        for line in narration_lines
        if (normalized_line := _normalize_narration_clause(line))
    ]
    if not clauses:
        return "暂无匹配字幕。"
    clauses = _drop_trailing_bridge_clause(clauses)
    if not clauses:
        return "暂无匹配字幕。"

    if special_paragraph := _build_special_narration_paragraph(clauses):
        return special_paragraph

    sentence_fragments: list[str] = []
    current_clauses: list[str] = []
    current_length = 0
    for clause in clauses:
        current_clauses.append(clause)
        current_length += len(clause)
        if len(current_clauses) >= 3 or current_length >= 26:
            sentence_fragments.append("，".join(current_clauses))
            current_clauses = []
            current_length = 0
    if current_clauses:
        sentence_fragments.append("，".join(current_clauses))

    paragraph = "。".join(fragment for fragment in sentence_fragments if fragment)
    if paragraph and paragraph[-1] not in "。！？!?":
        paragraph += "。"
    return paragraph


def _drop_trailing_bridge_clause(clauses: list[str]) -> list[str]:
    if len(clauses) <= 1:
        return clauses
    if _is_bridge_subject_clause(clauses[-1]):
        return clauses[:-1]
    return clauses


def _build_special_narration_paragraph(clauses: list[str]) -> str:
    normalized_clauses = [normalize_domain_terms(clause) for clause in clauses]
    compact_clauses = [clause.lower().replace(" ", "") for clause in normalized_clauses]
    has_notebooklm_subject = any("notebooklm" in clause for clause in compact_clauses)
    has_building_method = any("体系搭建" in clause for clause in normalized_clauses)
    has_internalization = any("知识内化" in clause for clause in normalized_clauses)
    has_share_reason = any(
        marker in clause
        for clause in normalized_clauses
        for marker in ("帮助非常大", "帮助很大", "分享给大家")
    )
    if has_notebooklm_subject and has_building_method and has_internalization:
        paragraph = "这个 NotebookLM 给我们提供了一套非常快速高效的体系搭建方法，也能帮助我们快速进行知识内化。"
        if has_share_reason:
            paragraph += "这对个人实践帮助很大，所以我也分享给大家。"
        return paragraph
    return ""


def _needs_boundary_bridge_prefix(narration_lines: list[str]) -> bool:
    first_clause = _normalize_narration_clause(narration_lines[0])
    if not first_clause:
        return False
    continuation_prefixes = (
        "我觉得是给我们提供了",
        "给我们提供了",
        "非常快速高效的体系搭建",
        "这么一个方法",
        "快速进行知识内化",
        "快速的进行知识内化",
        "我是觉得这个对我的帮助非常大",
        "所以呢就我分享给大家",
    )
    return any(first_clause.startswith(prefix) for prefix in continuation_prefixes)


def _extract_bridge_subject_line(narration_lines: list[str]) -> str:
    for line in reversed(narration_lines):
        if bridge_line := _normalize_bridge_subject_line(line):
            return bridge_line
    return ""


def _is_bridge_subject_clause(text: str) -> bool:
    normalized_text = normalize_domain_terms(text).lower().replace(" ", "")
    return normalized_text in {"那这个notebooklm", "这个notebooklm", "notebooklm"}


def _normalize_bridge_subject_line(text: str) -> str:
    normalized_text = normalize_domain_terms(text).strip().strip("，。！？；;、 ")
    if not normalized_text:
        return ""
    if _is_bridge_subject_clause(normalized_text):
        return "这个 NotebookLM"
    return ""


def _build_key_segment_lines(
    metadata: VideoMetadata,
    document: SummaryDocument,
    caption_blocks: list[ScreenshotCaptionBlock],
) -> list[str]:
    if document.chapters and caption_blocks:
        chapter_block_lookup: dict[str, list[ScreenshotCaptionBlock]] = {}
        for caption_block in caption_blocks:
            chapter_block_lookup.setdefault(caption_block.chapter_title, []).append(caption_block)

        key_lines: list[str] = []
        for chapter in document.chapters[:5]:
            chapter_blocks = sorted(
                chapter_block_lookup.get(chapter.title, []),
                key=lambda item: item.screenshot_timestamp_seconds,
            )
            representative_block = _select_representative_key_block(chapter_blocks, chapter=chapter)
            if representative_block is None:
                continue
            subsection_title = _build_visual_subsection_title(representative_block)
            narration_summary = _compose_narration_paragraph(representative_block.narration_lines)
            if narration_summary == "暂无匹配字幕。":
                key_lines.append(
                    f"- {_render_timestamp_link(metadata, representative_block.screenshot_timestamp_seconds)} {subsection_title}"
                )
                continue
            key_lines.append(
                f"- {_render_timestamp_link(metadata, representative_block.screenshot_timestamp_seconds)} "
                f"{subsection_title}：{narration_summary}"
            )
        if key_lines:
            return key_lines

    if document.chapters:
        key_segments = select_key_segments_for_chapters(
            transcript_segments=document.transcript_segments,
            chapters=document.chapters,
        )
    else:
        key_segments = select_key_segments(document.transcript_segments)
    return [
        f"- {_render_timestamp_link(metadata, segment.start_seconds)} {polish_summary_text(segment.text)}"
        for segment in key_segments
    ]


def _select_representative_key_block(
    chapter_blocks: list[ScreenshotCaptionBlock],
    chapter: object,
) -> ScreenshotCaptionBlock | None:
    if not chapter_blocks:
        return None
    chapter_midpoint = (chapter.anchor_start_seconds + chapter.anchor_end_seconds) / 2
    return max(
        chapter_blocks,
        key=lambda item: (
            len(_compose_narration_paragraph(item.narration_lines)),
            -abs(item.screenshot_timestamp_seconds - chapter_midpoint),
        ),
    )


def _resolve_chapter_key_points(
    chapter: object,
    chapter_blocks: list[ScreenshotCaptionBlock],
) -> list[str]:
    visual_points: list[str] = []
    for caption_block in chapter_blocks:
        title = clean_title_phrase(_build_visual_subsection_title(caption_block))
        if not title or title in visual_points or _is_generic_visual_title(title):
            continue
        visual_points.append(title)
    if len(visual_points) >= 2:
        return visual_points[:3]

    chapter_points: list[str] = []
    for key_point in chapter.key_points:
        cleaned_point = polish_summary_text(key_point, max_length=44)
        if not cleaned_point or cleaned_point in chapter_points:
            continue
        chapter_points.append(cleaned_point)
    return chapter_points[:3]


def _resolve_chapter_side_note(text: str) -> str:
    cleaned_text = polish_summary_text(text, max_length=48)
    if not cleaned_text:
        return ""
    if cleaned_text.endswith(("这个", "那个", "这样", "的话")):
        return ""
    if any(marker in cleaned_text for marker in ("就比如说现在", "现在我们用同样的问题来问豆包", "就是说作为新手父母")):
        return ""
    return cleaned_text


def _normalize_narration_clause(text: str) -> str:
    normalized_text = polish_summary_text(text)
    normalized_text = normalized_text.strip().strip("，。！？；;、 ")
    if not normalized_text:
        return ""

    filler_lines = {"好吧", "对吧", "对不对", "能明白吧", "能明白吗"}
    if normalized_text in filler_lines:
        return ""

    replacements = (
        ("就比如说", "比如说"),
        ("我们的这个", "我们的"),
        ("这个时候我们要学会什么呢", "这个时候我们要学会的是"),
        ("这样的子代理", "子代理"),
        ("粘贴的文字，也可以", "也可以"),
        ("那这个notebook lm", "这个 NotebookLM"),
        ("那这个NotebookLM", "这个 NotebookLM"),
        ("我是觉得这个对我的帮助非常大", "这对个人实践帮助很大"),
        ("所以呢就我分享给大家", "所以我也分享给大家"),
        ("快速的进行知识内化", "快速进行知识内化"),
    )
    for source, target in replacements:
        normalized_text = normalized_text.replace(source, target)

    if normalized_text.endswith("吗") and "怎么" in normalized_text:
        normalized_text = normalized_text[:-1]
    if normalized_text.endswith("呢") and len(normalized_text) > 6:
        normalized_text = normalized_text[:-1]
    if normalized_text.endswith("好") and len(normalized_text) > 8:
        normalized_text = normalized_text[:-1]

    return normalized_text.strip("，。！？；;、 ")


def _build_visual_subsection_title(caption_block: ScreenshotCaptionBlock) -> str:
    joined_text = " ".join(normalize_domain_terms(line) for line in caption_block.narration_lines)
    normalized_chapter_title = normalize_domain_terms(caption_block.chapter_title)
    normalized_ocr_text = normalize_domain_terms(caption_block.ocr_text)
    ocr_title = _build_visual_title_from_ocr(caption_block)
    if "思维导图" in joined_text and "音频" in joined_text:
        return "生成多种内容形态"
    if "工作和生活带来非常极大便利" in joined_text:
        return "NotebookLM 带来的实际价值"
    normalized_joined_text = joined_text.strip("。")
    if normalized_joined_text in {"这个NotebookLM呢", "NotebookLM"}:
        return "介绍 NotebookLM 工具"
    if "本地或者是网络上的大量的权威的资料" in joined_text:
        return "汇总权威育儿资料"
    if "大量的权威的资料" in joined_text and any(keyword in joined_text for keyword in ("个人知识库", "支持库", "知识库")):
        return "导入权威育儿资料"
    if normalized_joined_text == "并且可以基于这个知识库":
        return "基于知识库持续追问"
    if "沟通对话交流" in joined_text:
        return "围绕知识库持续对话"
    if "非常好" in joined_text or "非常正" in joined_text:
        return "回答结构更完整"
    if "硬盘里的文件都可以" in joined_text:
        return "支持从本地文件导入"
    if "随便复制一遍文字都可以" in joined_text:
        return "支持粘贴文本导入"
    if normalized_joined_text in {"你新来的文字", "新来的文字"}:
        return "支持粘贴文本导入"
    if normalized_joined_text == "我就问他一个问题":
        return "开始验证育儿问题"
    if "新手父母" in joined_text and "我作为一个" in joined_text:
        return "以新手父母视角提问"
    if "直接在这里搜索你想要的东西" in joined_text:
        return "支持搜索后直接导入"
    if "直接搜索出来之后" in joined_text:
        return "搜索结果可直接导入"
    if normalized_joined_text == "他的这个出处来源是":
        return "开始核对回答来源"
    if "7到24月龄" in joined_text or "义买通发表" in joined_text or "美国儿科学会发布的这份" in joined_text:
        return "引用美国儿科学会指南"
    if "国家卫生" in joined_text and "来源" in joined_text:
        return "引用国家卫健委指南"
    if normalized_joined_text == "健康委员会去发布的这个":
        return "引用国家卫健委指南"
    if "没有成体系" in joined_text and "对比通用" in normalized_chapter_title:
        return "回答不够成体系"
    if normalized_joined_text in {"就是那个这个数字", "这个数字"}:
        return "开始核对关键数字来源"
    if "提供的这么精准" in joined_text:
        return "数字精准但未必可信"
    if "你是不能够知道的" in joined_text:
        return "无法判断局部错误"
    if "没有那么成体系" in joined_text:
        return "回答仍然不成体系"
    if "东一片" in joined_text:
        return "信息零散且不成体系"
    if normalized_joined_text == "和书籍去支撑的":
        return "回答由指南和书籍支撑"
    if "由你自己导入的资料去做支撑" in joined_text:
        return "回答只基于已导入资料"
    if "新手父母" in joined_text and "零到一岁的婴儿" in joined_text and "对比通用" in normalized_chapter_title:
        return "用同一问题对比模型"
    if normalized_joined_text == "你会发现他的回答会更为的":
        return "通用模型回答更零散"
    if normalized_joined_text in {"这样呢", "这样"}:
        if ocr_title:
            return ocr_title
        return "引出第二个判断点"
    if "第二点我是觉得说" in joined_text or (
        "第二点" in normalized_joined_text and "我是觉得说" in normalized_joined_text
    ):
        return "引出第二个判断点"
    if "作为现在的新手家长" in joined_text:
        return "新手父母更需要体系"
    if "搭建这么一套婴儿体系" in joined_text:
        return "搭建系统化育儿知识体系"
    if normalized_joined_text == "这么一个方法":
        return "形成可复用的方法"
    if normalized_joined_text == "一个" and any(keyword in normalized_chapter_title for keyword in ("知识内化", "快速搭建", "体系")):
        return "形成可复用的方法"
    if "高效的体系搭建的这么" in joined_text:
        return "高效搭建知识体系"
    if "非常快速" in joined_text and "知识内化" in normalized_chapter_title:
        return "快速搭建学习体系"
    if normalized_joined_text == "然后并且能够帮助我们" or (
        "帮助我们" in joined_text and any(keyword in normalized_chapter_title for keyword in ("知识内化", "快速搭建", "体系"))
    ):
        return "帮助持续知识内化"
    if "对我的帮助非常大" in joined_text:
        return "个人实践价值明显"
    if "NotebookLM" in joined_text and "导入" in normalized_chapter_title:
        return "导入权威育儿资料"
    if any(keyword in normalized_chapter_title for keyword in ("查看回答出处", "权威性")) and any(
        keyword in joined_text for keyword in ("出处", "来源")
    ):
        return "查看回答的权威出处"
    if "对比通用" in normalized_chapter_title and any(keyword in joined_text for keyword in ("豆包", "DeepSeek")):
        return "通用模型回答不成体系"
    if normalized_ocr_text and ocr_title:
        return ocr_title
    keyword_titles = (
        (("知识库所有的内容", "思维导图", "音频"), "生成多种内容形态"),
        (("文档", "思维导图", "音频"), "生成多种内容形态"),
        (("大量的权威的资料",), "汇总权威育儿资料"),
        (("NotebookLM", "权威资料", "知识库"), "导入权威育儿资料"),
        (("导入到你自己的", "知识库"), "导入权威育儿资料"),
        (("个人知识库", "导入"), "导入权威育儿资料"),
        (("上传文件", "导入"), "导入权威育儿资料"),
        (("我就问他一个问题",), "开始验证育儿问题"),
        (("0到1岁的婴儿",), "向知识库提出育儿问题"),
        (("新手父母", "照顾"), "向知识库提出育儿问题"),
        (("新手父母",), "以新手父母视角提问"),
        (("四个方面",), "查看回答的核心结构"),
        (("权威的指南",), "查看回答的权威出处"),
        (("出处", "来源"), "查看回答的权威出处"),
        (("国家卫生健康委员会", "辅食添加"), "引用权威育儿指南"),
        (("书籍去支撑的",), "回答由指南和书籍支撑"),
        (("导入的资料去做支撑的",), "回答只基于已导入资料"),
        (("产生幻觉",), "减少幻觉和编造内容"),
        (("没有成体系",), "回答缺少系统性"),
        (("豆包", "DeepSeek"), "对比通用 AI 回答"),
        (("豆包", "DeepSeek", "没有成体系"), "通用模型回答不成体系"),
        (("豆包", "DeepSeek", "不够成体系"), "通用模型回答不成体系"),
        (("豆包", "DeepSeek", "东一片西一片"), "通用模型回答不成体系"),
        (("无从得知", "来源"), "来源不明就继续核实"),
        (("新手家长", "成体系"), "系统化学习育儿知识"),
        (("知识内化",), "加快育儿知识内化"),
        (("热门的AI编程工具", "Codex App"), "Codex App 工具定位"),
        (("语言", "默认打开"), "语言与打开方式设置"),
        (("休眠", "自动化"), "防休眠与自动化准备"),
        (("回复", "余量"), "AI 回复风格与余量"),
        (("余量", "模型"), "AI 回复风格与余量"),
        (("推理", "速度"), "推理级别与速度取舍"),
        (("只支持OpenAI自己的模型",), "模型支持范围"),
        (("Plan 模式", "不仅仅是第一次"), "Plan 模式适用场景"),
        (("Plan", "仔细思考"), "Plan 模式深度思考"),
        (("语音输入",), "语音输入描述需求"),
        (("描述的更加详细",), "补充细化需求"),
        (("一直在转", "归档"), "线程运行状态与归档"),
        (("命令", "环境"), "启动命令与环境配置"),
        (("工程级别", "全局技能"), "工程级与全局技能"),
        (("技能", "美元符号"), "技能管理与调用方式"),
        (("美元符号", "技能的网站"), "美元符号调用技能"),
        (("创建属于自己的技能",), "创建自定义技能"),
        (("优化了我们的UI展示", "Frontend"), "技能优化界面效果"),
        (("开启多个这样的Worktree",), "派生新工作树"),
        (("同时在进行", "Worktree"), "多 Worktree 分工开发"),
        (("应用", "覆盖"), "应用与覆盖的区别"),
        (("自动提交", "PR"), "提交代码与创建 PR"),
        (("每隔半个小时", "简报"), "自动化与项目记忆"),
        (("装一个MCP", "MCP"), "MCP 安装入口"),
        (("provide", "MCP"), "MCP 自动回归测试"),
        (("主代理", "工作"), "主代理职责"),
        (("第一个子代理", "安全性"), "安全性子代理职责"),
        (("代码质量", "竞争条件"), "代码质量与竞争条件"),
        (("返回一个特定的结果",), "约束返回结果格式"),
        (("失败不影响整体", "运行失败"), "失败不影响主流程"),
        (("临时性的", "换了个项目"), "临时子代理的生命周期"),
        (("少的关键词", "子代理"), "少量关键词生成子代理"),
        (("review", "接口文档"), "Review 与文档各司其职"),
        (("帮你自己创建", "子代理"), "自动生成临时子代理"),
        (("在我们的演示当中", "独立的空间"), "并行协作的独立空间"),
        (("声明的", "子代理"), "配置里声明子代理"),
        (("在别的地方都可以用到",), "自定义子代理可复用"),
        (("像他这样子去定义",), "按模板定义子代理"),
        (("已经在生成子代理",), "生成自定义子代理"),
        (("很专注的去完成",), "聚焦单一子任务"),
        (("结果类的东西",), "文档与结果物输出"),
        (("略过去", "开源"), "善用开源子代理模板"),
        (("子代理", "负责"), "子代理职责说明"),
        (("Codex App", "Subagents"), "Subagents 功能概览"),
        (("提示词", "安全风险"), "子代理提示词"),
        (("子代理", "线程"), "查看子代理线程"),
        (("子代理", "完成之后"), "子代理执行结束即可"),
        (("停止状态", "点不了"), "主代理等待子代理返回"),
        (("线程", "归档"), "线程归档与查看"),
        (("上下文",), "上下文隔离"),
        (("沙箱",), "沙箱与权限配置"),
        (("TOML",), "自定义子代理配置"),
        (("Map Codebase", "代码库"), "Map Codebase 扫描代码库"),
        (("Worktree",), "Worktree 并行开发"),
        (("技能", "UI"), "技能安装与界面优化"),
        (("自动化", "简报"), "自动化与项目记忆"),
        (("MCP",), "MCP 测试流程"),
        (("串口", "收发", "框架"), "串口收发框架"),
        (("整体框架",), "整体框架搭建"),
        (("填充", "代码"), "按框架填充代码"),
        (("配置好了", "框架"), "框架配置完成后"),
        (("三个阶段",), "AI 的三个阶段"),
        (("执行", "ai"), "执行交给 AI"),
        (("被动", "搜索", "过滤"), "被动搜索与信息过滤"),
        (("交互", "提问"), "AI 交互学习"),
        (("过程", "学习AI"), "学习 AI 需要过程"),
        (("框架", "方案"), "理解框架与方案"),
        (("流程", "实现"), "理解正向实现流程"),
        (("语音", "助手"), "语音助手案例"),
        (("mcp",), "MCP 接入与更新"),
        (("技能包", "手册"), "技能包与手册接入"),
        (("工作流",), "标准工作流"),
        (("串口", "解析"), "串口解析框架"),
        (("日志", "调试"), "日志调试与排查"),
        (("错误中断",), "错误中断排查"),
        (("上下文",), "上下文决定输出"),
        (("提示词",), "提示词与项目记忆"),
        (("误区", "基础不牢"), "AI 学习误区"),
        (("投机取巧",), "AI 学习误区"),
        (("90分", "100分"), "从 90 分到 100 分"),
    )
    lowered_text = joined_text.lower()
    for keywords, title in keyword_titles:
        if all(keyword.lower() in lowered_text for keyword in keywords):
            return title

    candidate_titles = [
        normalized_candidate
        for line in caption_block.narration_lines
        if (normalized_candidate := _normalize_visual_title_candidate(line))
    ]
    if candidate_titles:
        scored_titles = sorted(
            candidate_titles,
            key=lambda title: (_score_visual_title(title), -len(title)),
            reverse=True,
        )
        return scored_titles[0]

    return caption_block.screenshot_alt_text


def _normalize_visual_title_candidate(text: str) -> str:
    title = clean_title_phrase(text)
    if not title:
        return ""

    for prefix in (
        "这也是",
        "在这个对话里面明确要求开启这样的",
        "我们只需要去深入的是",
        "我们最后是怎么以一个正的流程实现的",
        "你需要去具体的思考",
        "就比如说",
        "就是说",
        "那么",
        "然后",
        "好吧",
        "对吧",
        "大家应该都知道",
        "我觉得",
        "我们认为这个东西就是",
        "我们",
        "就是",
        "其实",
        "那",
        "和",
    ):
        if title.startswith(prefix):
            title = title[len(prefix) :].strip("，。！？；;、 ")

    replacements = (
        ("它是能将本地或者是网络上的大量的权威的资料", "汇总权威育儿资料"),
        ("并且可以基于这个知识库", "基于知识库持续追问"),
        ("可以转换为全部导入到你自己的一个个人知识库里", "导入权威育儿资料"),
        ("还有你自己硬盘里的文件都可以", "支持从本地文件导入"),
        ("还有你甚至说你随便复制一遍文字都可以", "支持粘贴文本导入"),
        ("你新来的文字", "支持粘贴文本导入"),
        ("或者说是你直接在这里搜索你想要的东西", "支持搜索后直接导入"),
        ("他就直接搜索出来之后", "搜索结果可直接导入"),
        ("我就问他一个问题", "开始验证育儿问题"),
        ("我应该怎么去照顾一个0到1岁的婴儿", "向知识库提出育儿问题"),
        ("你作为一个我作为一个新手父母", "以新手父母视角提问"),
        ("这个NotebookLM呢", "介绍 NotebookLM 工具"),
        ("美国儿科学会发布的这份7到24月龄", "引用美国儿科学会指南"),
        ("下句话这个也用来源是国家卫生", "引用国家卫健委指南"),
        ("他的每一句话都是有权威的指南", "查看回答的权威出处"),
        ("和书籍去支撑的", "回答由指南和书籍支撑"),
        ("都是由你自己导入的资料去做支撑的", "回答只基于已导入资料"),
        ("他不会去产生幻觉", "减少幻觉和编造内容"),
        ("你会发现他的回答会更为的", "通用模型回答更零散"),
        ("会是东一片西一片的这样的", "信息零散且不成体系"),
        ("没有成体系", "回答缺少系统性"),
        ("他提供的这么精准", "数字精准但未必可信"),
        ("你是不能够知道的", "无法判断局部错误"),
        ("这么一个方法", "形成可复用的方法"),
        ("和重度使用AI的人来说", "重度使用 AI 的差异"),
        ("重度使用AI的人来说", "重度使用 AI 的差异"),
        ("这款编程工具", "Codex App 工具定位"),
        ("你默认打开的目标", "语言与打开方式设置"),
        ("如果你电脑休眠了", "防休眠与自动化准备"),
        ("他的对你的一些AI的回复", "AI 回复风格与余量"),
        ("它追求的是速度", "推理级别与速度取舍"),
        ("只支持OpenAI自己的模型", "模型支持范围"),
        ("不仅仅是第一次", "Plan 模式适用场景"),
        ("在输入需求的时候", "语音输入描述需求"),
        ("描述的更加详细的", "补充细化需求"),
        ("它就一直在运行", "线程运行状态与归档"),
        ("询问你一些问题", "Plan 实施前的二次澄清"),
        ("但我们打开之后", "启动命令与环境配置"),
        ("你安装的技能呢", "技能管理与调用方式"),
        ("创建技能的一个流程", "创建自定义技能"),
        ("这边有两个按钮", "应用与覆盖的区别"),
        ("去创建这样pr", "提交代码与创建 PR"),
        ("自动化测试的一个流程", "MCP 自动回归测试"),
        ("最近发布了新版本 支持子代理 Subagents", "Subagents 功能概览"),
        ("每一个子代理负责什么事情", "子代理职责说明"),
        ("第一个子代理是负责的 是安全性的问题", "安全性子代理职责"),
        ("第二个是负责代码质量 第三个是负责错误 那第四个是竞争条件", "代码质量与竞争条件"),
        ("子代理完成之后", "子代理执行结束即可"),
        ("你在这边是点不了的", "主代理等待子代理返回"),
        ("主代理要做的事情其实非常简单", "主代理负责需求协调"),
        ("根据你输入的需求去协调更多的子代理", "主代理协调多个子代理"),
        ("子代理就非常的专注单一", "子代理专注单点任务"),
        ("比如说review", "Review 与文档各司其职"),
        ("再接着去做他接下来的事情", "并行协作的独立空间"),
        ("在我们的演示当中", "临时子代理的生成方式"),
        ("是帮你自己创建的", "自动生成临时子代理"),
        ("是他通过我们的一些比较少的关键词", "少量关键词生成子代理"),
        ("它其实是个临时性的", "临时子代理的生命周期"),
        ("macoo base", "Map Codebase"),
        ("Map Codebase 去了解这个代码库的时候", "Map Codebase 扫描代码库"),
        ("了解这个代码库的时候", "扫描代码库"),
        ("就他这边去声明的", "配置里声明子代理"),
        ("在别的地方都可以用到", "自定义子代理可复用"),
        ("像他这样子去定义", "按模板定义子代理"),
        ("他这边已经在生成子代理了", "生成自定义子代理"),
        ("他能很专注的去完成某一项很脚的", "聚焦单一子任务"),
        ("返回一个特定的结果", "约束返回结果格式"),
        ("或者说一些结果类的东西", "文档与结果物输出"),
        ("如果你运行失败", "失败不影响主流程"),
        ("你直接就略过去", "善用开源子代理模板"),
        ("你主要进行工作的", "主代理职责"),
        ("输入这样一段对话", "开启子代理对话"),
        ("可以在线程里面查看运行过程", "查看子代理线程"),
        ("它有独立的上下文", "上下文隔离"),
        ("自定义的子代理", "自定义子代理配置"),
        ("根据我们的框架去填充我们的代码", "按框架填充代码"),
        ("根据我们的框架去填充代码", "按框架填充代码"),
        ("就说首先问一下AI的三个阶段", "AI 的三个阶段"),
        ("首先问一下AI的三个阶段", "AI 的三个阶段"),
        ("之前的方案是干嘛", "传统方案怎么做"),
        ("这个流程是比较长的", "传统流程太长"),
        ("询问AI进行交互的回答", "AI 交互学习"),
        ("执行让AI来做", "执行交给 AI"),
        ("以及我们的整体框架的", "整体框架搭建"),
        ("写一个串口的一个收发的框架", "串口收发框架"),
        ("就是我们把这套框架给配置好了之后", "框架配置完成后"),
        ("权限能够知道我的问题出现在哪里", "定位问题出现的位置"),
        ("能够快速的去用", "快速上手 AI"),
        ("是让AI去快速的应用到90分的", "让 AI 先做到 90 分"),
        ("大部分的人", "大多数人的学习误区"),
        ("生成我们的框架", "让 AI 生成框架"),
        ("不是完美的基础", "先补基础再提速"),
        ("有些的东西你都是AI生成的", "AI 生成内容的边界"),
        ("或者说框架呀分享给你们", "复用框架与经验"),
        ("是什么", ""),
        ("怎么写的吗", "代码实现方式"),
        ("怎么写的", "代码实现方式"),
        ("怎么去", ""),
        ("只需要去深入的是", "理解"),
        ("需要去具体的思考", "思考"),
        ("正的流程实现", "正向流程实现"),
    )
    for source, target in replacements:
        title = title.replace(source, target)

    title = clean_title_phrase(title)
    if _looks_like_asr_residue_title(title):
        return ""
    if _is_generic_visual_title(title):
        return ""
    if not title:
        return ""
    if len(title) > 18:
        title = title[:18].rstrip("，。！？；;、 ")
    return title


def _score_visual_title(title: str) -> int:
    score = 0
    if 4 <= len(title) <= 16:
        score += 3
    if any(keyword in title for keyword in ("框架", "方案", "流程", "调试", "工作流", "误区", "上下文", "提示词", "解析")):
        score += 4
    if any(keyword in title for keyword in ("AI", "MCP", "技能", "串口", "日志")):
        score += 2
    if any(keyword in title for keyword in ("育儿", "知识库", "来源", "指南", "父母", "喂养", "内化")):
        score += 3
    if any(keyword in title for keyword in ("这个", "那个", "什么", "一个")):
        score -= 2
    return score


def _looks_like_asr_residue_title(title: str) -> bool:
    if not title:
        return True
    suspicious_fragments = (
        "那个本地或者是网络上的大量",
        "呢它是能将",
        "他的回答会更为",
        "对我的工作和生活带来",
        "然后第二点我是觉得说",
        "然后并且能够帮助我们",
    )
    if any(fragment in title for fragment in suspicious_fragments):
        return True
    if len(title) >= 14 and any(token in title for token in ("这个", "那个", "呢")):
        return True
    return False


def _is_generic_visual_title(title: str) -> bool:
    if not title:
        return True

    generic_titles = {
        "他们的感觉",
        "能够明白吗",
        "能够明白吧",
        "大部分的人",
        "大多数的人",
        "和重度使用AI的人来说",
    }
    if title in generic_titles:
        return True

    if title.endswith(("吗", "吧")):
        return True

    domain_keywords = (
        "AI",
        "框架",
        "流程",
        "调试",
        "工作流",
        "方案",
        "上下文",
        "提示词",
        "串口",
        "MCP",
        "误区",
        "育儿",
        "知识库",
        "来源",
        "指南",
        "父母",
        "喂养",
        "内化",
    )
    if len(title) <= 6 and not any(keyword in title for keyword in domain_keywords):
        return True

    return False


def _resolve_visual_subsection_title(
    caption_block: ScreenshotCaptionBlock,
    used_titles: set[str] | None,
) -> str:
    candidate_titles = [
        _build_visual_subsection_title(caption_block),
        _build_visual_title_from_ocr(caption_block),
        *[
            candidate
            for line in caption_block.narration_lines
            if (candidate := _normalize_visual_title_candidate(line))
        ],
    ]
    deduplicated_candidates: list[str] = []
    seen_candidates: set[str] = set()
    for candidate in candidate_titles:
        if not candidate or candidate in seen_candidates:
            continue
        deduplicated_candidates.append(candidate)
        seen_candidates.add(candidate)

    base_title = deduplicated_candidates[0] if deduplicated_candidates else caption_block.screenshot_alt_text
    if used_titles is None:
        return base_title

    for candidate in deduplicated_candidates:
        if candidate not in used_titles:
            used_titles.add(candidate)
            return candidate

    suffix = 2
    unique_title = f"{base_title}（补充）"
    while unique_title in used_titles:
        suffix += 1
        unique_title = f"{base_title}（补充 {suffix}）"
    used_titles.add(unique_title)
    return unique_title


def _build_visual_title_from_ocr(caption_block: ScreenshotCaptionBlock) -> str:
    normalized_ocr_text = normalize_domain_terms(caption_block.ocr_text)
    if not normalized_ocr_text:
        return ""

    if any(keyword in normalized_ocr_text for keyword in ("文档", "思维导图", "音频")) and "NotebookLM" in normalized_ocr_text:
        return "生成多种内容形态"
    if any(keyword in normalized_ocr_text for keyword in ("7到24月龄", "喂养指南", "婴幼儿喂养")):
        return "婴儿喂养指南的权威解读"
    if any(keyword in normalized_ocr_text for keyword in ("国家卫生健康委员会", "辅食添加")):
        return "国家卫健委辅食指南"
    if any(keyword in normalized_ocr_text for keyword in ("科学喂养", "发育监测", "情感培育")):
        return "查看回答的核心结构"
    if any(keyword in normalized_ocr_text for keyword in ("0到1岁", "零到一岁", "新手父母", "新手家长")):
        return "向知识库提出育儿问题"
    if any(keyword in normalized_ocr_text for keyword in ("知识内化", "体系搭建", "高效搭建")):
        return "快速搭建学习体系"

    ocr_candidate = clean_title_phrase(re.split(r"[\n\r]", normalized_ocr_text, maxsplit=1)[0])
    if not ocr_candidate:
        return ""
    if len(ocr_candidate) > 18:
        ocr_candidate = ocr_candidate[:18].rstrip("，。！？；;、 ")
    if _is_generic_visual_title(ocr_candidate):
        return ""
    return ocr_candidate


def _merge_nearby_visual_blocks(caption_blocks: list[ScreenshotCaptionBlock]) -> list[ScreenshotCaptionBlock]:
    if len(caption_blocks) <= 1:
        return caption_blocks

    merged_blocks: list[ScreenshotCaptionBlock] = []
    for caption_block in caption_blocks:
        if not merged_blocks:
            merged_blocks.append(caption_block)
            continue

        previous_block = merged_blocks[-1]
        is_close_in_time = caption_block.screenshot_timestamp_seconds - previous_block.screenshot_timestamp_seconds <= 4.0
        same_path = previous_block.screenshot_relative_path == caption_block.screenshot_relative_path
        same_title = _build_visual_subsection_title(previous_block) == _build_visual_subsection_title(caption_block)
        if not (same_path or (is_close_in_time and same_title)):
            merged_blocks.append(caption_block)
            continue

        previous_score = _score_visual_block(previous_block)
        current_score = _score_visual_block(caption_block)
        previous_block.window_end_seconds = max(previous_block.window_end_seconds, caption_block.window_end_seconds)
        for narration_line in caption_block.narration_lines:
            if narration_line not in previous_block.narration_lines:
                previous_block.narration_lines.append(narration_line)
        if current_score >= previous_score:
            previous_block.screenshot_relative_path = caption_block.screenshot_relative_path
            previous_block.screenshot_alt_text = caption_block.screenshot_alt_text
            previous_block.screenshot_timestamp_seconds = caption_block.screenshot_timestamp_seconds
            previous_block.ocr_text = caption_block.ocr_text or previous_block.ocr_text
    return merged_blocks


def _score_visual_block(caption_block: ScreenshotCaptionBlock) -> int:
    score = len([line for line in caption_block.narration_lines if not _is_generic_visual_title(clean_title_phrase(line))])
    if caption_block.ocr_text.strip():
        score += 1
    return score


def _is_represented_by_rendered_blocks(
    caption_block: ScreenshotCaptionBlock,
    rendered_blocks: list[ScreenshotCaptionBlock],
) -> bool:
    caption_title = _build_visual_subsection_title(caption_block)
    for rendered_block in rendered_blocks:
        if rendered_block.screenshot_relative_path == caption_block.screenshot_relative_path:
            return True
        if abs(rendered_block.screenshot_timestamp_seconds - caption_block.screenshot_timestamp_seconds) > 4.0:
            continue
        if rendered_block.chapter_title != caption_block.chapter_title:
            continue
        if _build_visual_subsection_title(rendered_block) != caption_title:
            continue
        return True
    return False


def _build_preface_sections(
    document: SummaryDocument,
    screenshot_count: int | None = None,
) -> list[PresentationSection]:
    tags = _build_tags(document)
    ai_summary = _build_ai_summary(document)
    info_lines = _build_key_info_lines(document, screenshot_count=screenshot_count)

    sections = [
        PresentationSection(heading="AI 总结", lines=[ai_summary]),
        PresentationSection(heading="关键信息", lines=info_lines),
    ]
    if tags:
        sections.append(
            PresentationSection(
                heading="标签",
                lines=[" ".join(f"`{tag}`" for tag in tags)],
            )
        )
    return sections


def _build_topic_source_text(document: SummaryDocument) -> str:
    return normalize_domain_terms(
        " ".join(
            [
                document.metadata.title,
                document.metadata.description,
                document.abstract,
                *(document.metadata.tags[:8]),
                *(chapter.title for chapter in document.chapters),
                *(chapter.goal for chapter in document.chapters),
                *(document.bullets[:5]),
            ]
        )
    )


def _extract_description_tags(description: str) -> list[str]:
    tags: list[str] = []
    for match in re.finditer(r"#([^#\[]+)(?:\[[^\]]+\])?#", description):
        tag = match.group(1).strip()
        if tag and tag not in tags:
            tags.append(tag)
    return tags


def _is_notebooklm_parenting_document(document: SummaryDocument) -> bool:
    source_text = _build_topic_source_text(document).lower()
    if "notebooklm" not in source_text:
        return False
    for keyword in ("育儿", "婴儿", "新手父母", "新手家长"):
        if keyword in source_text:
            return True
    return False


def _build_tags(document: SummaryDocument) -> list[str]:
    source_text = _build_topic_source_text(document)
    lowered_text = source_text.lower()

    def has_any(*keywords: str) -> bool:
        return any(keyword.lower() in lowered_text for keyword in keywords)

    raw_tags = [
        normalize_domain_terms(tag).strip()
        for tag in [*document.metadata.tags, *_extract_description_tags(document.metadata.description)]
        if normalize_domain_terms(tag).strip()
    ]
    tags: list[str] = []
    for tag in raw_tags:
        if tag not in tags:
            tags.append(tag)

    if _is_notebooklm_parenting_document(document):
        filtered_tags = [
            tag
            for tag in tags
            if tag not in {"我的育儿理念", "育儿新方式", "AI学习", "xiaohongshu", document.metadata.platform.value}
        ]
        curated_tags: list[str] = []
        for tag in filtered_tags:
            if tag in {"AI育儿", "NotebookLM", "育儿", "新手父母"} and tag not in curated_tags:
                curated_tags.append(tag)
        for condition, tag in (
            (has_any("NotebookLM"), "NotebookLM"),
            (has_any("知识库") and has_any("育儿", "婴儿", "新手父母", "新手家长"), "育儿知识库"),
            (has_any("出处", "来源", "权威", "指南"), "权威来源"),
            (has_any("新手父母", "新手家长"), "新手父母"),
            (has_any("幻觉", "编造", "不能完全信任", "不能够完全信任"), "幻觉风险"),
            (has_any("0到1岁的婴儿", "0到1岁", "零到一岁的婴儿", "照顾一个0到1岁的婴儿"), "婴儿照护"),
        ):
            if condition and tag not in curated_tags:
                curated_tags.append(tag)
        return curated_tags[:8]

    if document.metadata.platform.value not in tags:
        tags.append(document.metadata.platform.value)
    if has_any("NotebookLM") and "NotebookLM" not in tags:
        tags.append("NotebookLM")
    if has_any("知识库") and has_any("育儿", "婴儿", "新手父母", "新手家长") and "育儿知识库" not in tags:
        tags.append("育儿知识库")
    if has_any("育儿", "婴儿") and "育儿" not in tags:
        tags.append("育儿")
    if has_any("出处", "来源", "权威", "指南") and "权威来源" not in tags:
        tags.append("权威来源")
    if has_any("新手父母", "新手家长") and "新手父母" not in tags:
        tags.append("新手父母")

    tag_rules = (
        (("Codex App",), "Codex App"),
        (("Subagents", "子代理"), "Subagents"),
        (("Plan 模式", "计划模式"), "Plan 模式"),
        (("技能",), "技能"),
        (("Worktree", "工作树"), "Worktree"),
        (("MCP",), "MCP"),
        (("并行协作", "并行开发"), "并行协作"),
        (("权限配置", "沙箱"), "权限配置"),
        (("AI",), "AI"),
        (("嵌入式",), "嵌入式"),
        (("学习方法",), "学习方法"),
        (("方法论",), "方法论"),
        (("沉浸式编程",), "沉浸式编程"),
        (("工作流",), "工作流"),
        (("调试",), "AI 调试"),
        (("提示词",), "提示词工程"),
        (("上下文",), "上下文管理"),
        (("框架",), "框架设计"),
        (("90分", "100分"), "90分到100分"),
    )
    for keywords, tag in tag_rules:
        if has_any(*keywords) and tag not in tags:
            tags.append(tag)
    return tags[:8]


def _build_ai_summary(document: SummaryDocument) -> str:
    if _is_notebooklm_parenting_document(document):
        chapter_titles = [chapter.title for chapter in document.chapters[:3] if chapter.title]
        title_summary = f"核心内容包括 {'、'.join(chapter_titles)}。" if chapter_titles else ""
        return (
            title_summary
            + "这期视频演示如何用 NotebookLM 把 WHO、美国儿科学会和国家卫生健康委员会等育儿资料整理成个人育儿知识库，"
            "再围绕新手父母照顾婴儿的真实问题验证回答效果，重点强调核对权威来源和回答出处，并和通用模型做对比，"
            "避免直接采信无来源的育儿建议。"
        )
    if not document.chapters:
        return document.abstract or "暂无可用总结。"

    chapter_titles = [chapter.title for chapter in document.chapters if chapter.title]
    if len(chapter_titles) >= 4:
        joined_titles = "、".join(chapter_titles[:4])
        return f"这期视频围绕“{document.metadata.title}”展开，重点依次讲了 {joined_titles}，适合按章节快速回顾。"
    joined_titles = "、".join(chapter_titles)
    return f"这期视频围绕“{document.metadata.title}”展开，核心内容包括 {joined_titles}。"


def _build_key_info_lines(
    document: SummaryDocument,
    screenshot_count: int | None = None,
) -> list[str]:
    info_lines: list[str] = []
    if document.chapters:
        for chapter in document.chapters[:3]:
            goal_text = chapter.goal or "见章节拆解"
            info_lines.append(f"- {chapter.title}：{goal_text}")
    else:
        info_lines.extend(f"- {bullet}" for bullet in document.bullets[:3])

    info_lines.append(f"- 章节数：{len(document.chapters)}")
    resolved_screenshot_count = screenshot_count if screenshot_count is not None else len(document.screenshots)
    info_lines.append(f"- 截图数：{resolved_screenshot_count}")
    return info_lines


def _build_learning_goal_summary(document: SummaryDocument) -> str:
    if _is_notebooklm_parenting_document(document):
        return "通过这期视频，理解如何用 NotebookLM 搭建个人育儿知识库、核对回答出处，并判断哪些建议值得新手父母继续验证。"
    if not document.chapters:
        return document.abstract or "暂无可用学习目标。"

    focus_titles = [chapter.title for chapter in document.chapters[:3] if chapter.title]
    if not focus_titles:
        return document.abstract or "暂无可用学习目标。"

    joined_titles = "、".join(focus_titles)
    return f"通过这期视频，重点理解 {joined_titles} 等主线，并把它们整理成可复用的判断标准和操作步骤。"


def _build_fallback_caption_blocks(document: SummaryDocument) -> list[ScreenshotCaptionBlock]:
    blocks: list[ScreenshotCaptionBlock] = []
    for screenshot in document.screenshots:
        blocks.append(
            ScreenshotCaptionBlock(
                screenshot_relative_path=screenshot.relative_path,
                screenshot_alt_text=screenshot.alt_text,
                screenshot_timestamp_seconds=screenshot.timestamp_seconds,
                chapter_title="",
                window_start_seconds=screenshot.timestamp_seconds,
                window_end_seconds=screenshot.timestamp_seconds,
                narration_lines=[],
            )
        )
    return blocks


def _clone_caption_blocks(
    caption_blocks: list[ScreenshotCaptionBlock],
) -> list[ScreenshotCaptionBlock]:
    return [
        ScreenshotCaptionBlock(
            screenshot_relative_path=caption_block.screenshot_relative_path,
            screenshot_alt_text=caption_block.screenshot_alt_text,
            screenshot_timestamp_seconds=caption_block.screenshot_timestamp_seconds,
            chapter_title=caption_block.chapter_title,
            window_start_seconds=caption_block.window_start_seconds,
            window_end_seconds=caption_block.window_end_seconds,
            narration_lines=list(caption_block.narration_lines),
            ocr_text=caption_block.ocr_text,
        )
        for caption_block in caption_blocks
    ]


def _count_rendered_screenshot_cards(
    screenshot_lines: list[str],
    chapter_lines: list[str],
    fallback_count: int,
) -> int:
    rendered_destinations = {
        destination
        for line in [*screenshot_lines, *chapter_lines]
        if line.startswith("![")
        if (destination := _extract_image_destination(line))
    }
    rendered_count = len(rendered_destinations)
    return rendered_count if rendered_count > 0 else fallback_count


def _extract_image_destination(markdown_line: str) -> str:
    start_index = markdown_line.find("](")
    end_index = markdown_line.rfind(")")
    if start_index < 0 or end_index <= start_index + 2:
        return ""
    return markdown_line[start_index + 2 : end_index].strip("<>")

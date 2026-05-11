from __future__ import annotations

from video_summary_cli.models import PresentationSection


SUMMARY_STYLE_CHOICES = ("default", "concise", "tutorial-note", "action-note")


def normalize_summary_style(summary_style: str) -> str:
    """把未知风格回退到默认值。"""

    if summary_style in SUMMARY_STYLE_CHOICES:
        return summary_style
    return "default"


def render_note_sections(
    summary_style: str,
    abstract: str,
    bullets: list[str],
    key_segment_lines: list[str],
    screenshot_lines: list[str],
    transcript_lines: list[str],
    chapter_lines: list[str] | None = None,
) -> list[str]:
    """按风格模板生成正文章节文本。"""

    return _flatten_sections(
        build_note_sections(
            summary_style=summary_style,
            abstract=abstract,
            bullets=bullets,
            key_segment_lines=key_segment_lines,
            screenshot_lines=screenshot_lines,
            transcript_lines=transcript_lines,
            chapter_lines=chapter_lines,
        )
    )


def build_note_sections(
    summary_style: str,
    abstract: str,
    bullets: list[str],
    key_segment_lines: list[str],
    screenshot_lines: list[str],
    transcript_lines: list[str],
    chapter_lines: list[str] | None = None,
) -> list[PresentationSection]:
    """按风格模板生成结构化章节。"""

    normalized_style = normalize_summary_style(summary_style)
    if normalized_style == "concise":
        return _build_concise_sections(
            abstract=abstract,
            bullets=bullets,
            key_segment_lines=key_segment_lines,
            screenshot_lines=screenshot_lines,
            transcript_lines=transcript_lines,
        )
    if normalized_style == "tutorial-note":
        return _build_tutorial_sections(
            abstract=abstract,
            bullets=bullets,
            key_segment_lines=key_segment_lines,
            screenshot_lines=screenshot_lines,
            transcript_lines=transcript_lines,
            chapter_lines=chapter_lines,
        )
    if normalized_style == "action-note":
        return _build_action_sections(
            abstract=abstract,
            bullets=bullets,
            key_segment_lines=key_segment_lines,
            screenshot_lines=screenshot_lines,
            transcript_lines=transcript_lines,
        )
    return _build_default_sections(
        abstract=abstract,
        bullets=bullets,
        key_segment_lines=key_segment_lines,
        screenshot_lines=screenshot_lines,
        transcript_lines=transcript_lines,
    )


def _flatten_sections(sections: list[PresentationSection]) -> list[str]:
    lines: list[str] = []
    for section in sections:
        lines.extend(["", f"{'#' * section.level} {section.heading}", *section.lines])
    return lines


def _build_default_sections(
    abstract: str,
    bullets: list[str],
    key_segment_lines: list[str],
    screenshot_lines: list[str],
    transcript_lines: list[str],
) -> list[PresentationSection]:
    sections = [
        PresentationSection(heading="核心摘要", lines=[abstract]),
        PresentationSection(heading="要点", lines=[f"- {bullet}" for bullet in bullets]),
        PresentationSection(heading="关键片段", lines=key_segment_lines),
    ]
    if screenshot_lines:
        sections.append(PresentationSection(heading="关键画面", lines=screenshot_lines))
    sections.append(PresentationSection(heading="全文转写", lines=transcript_lines))
    return sections


def _build_concise_sections(
    abstract: str,
    bullets: list[str],
    key_segment_lines: list[str],
    screenshot_lines: list[str],
    transcript_lines: list[str],
) -> list[PresentationSection]:
    sections = [
        PresentationSection(heading="一句话总结", lines=[abstract]),
        PresentationSection(heading="核心结论", lines=[f"- {bullet}" for bullet in bullets]),
        PresentationSection(heading="时间锚点", lines=key_segment_lines),
    ]
    if screenshot_lines:
        sections.append(PresentationSection(heading="关键画面", lines=screenshot_lines))
    sections.append(PresentationSection(heading="全文转写", lines=transcript_lines))
    return sections


def _build_tutorial_sections(
    abstract: str,
    bullets: list[str],
    key_segment_lines: list[str],
    screenshot_lines: list[str],
    transcript_lines: list[str],
    chapter_lines: list[str] | None = None,
) -> list[PresentationSection]:
    sections = [PresentationSection(heading="学习目标", lines=[abstract])]
    if key_segment_lines:
        sections.append(PresentationSection(heading="关键片段", lines=key_segment_lines))
    if chapter_lines:
        sections.append(PresentationSection(heading="章节拆解", lines=chapter_lines))
    else:
        if bullets:
            sections.append(
                PresentationSection(
                    heading="操作步骤",
                    lines=[f"{index}. {bullet}" for index, bullet in enumerate(bullets, 1)],
                )
            )
    return sections


def _build_action_sections(
    abstract: str,
    bullets: list[str],
    key_segment_lines: list[str],
    screenshot_lines: list[str],
    transcript_lines: list[str],
) -> list[PresentationSection]:
    sections = [
        PresentationSection(heading="任务概览", lines=[abstract]),
        PresentationSection(heading="执行清单", lines=[f"- [ ] {bullet}" for bullet in bullets]),
        PresentationSection(heading="参考片段", lines=key_segment_lines),
    ]
    if screenshot_lines:
        sections.append(PresentationSection(heading="关键画面", lines=screenshot_lines))
    sections.append(PresentationSection(heading="全文转写", lines=transcript_lines))
    return sections

from __future__ import annotations

from video_summary_cli.models import PresentationSection, SummaryDocument, SummaryPresentation
from video_summary_cli.presentation_builder import _build_visual_subsection_title, build_summary_presentation


def render_summary_markdown(document: SummaryDocument, summary_style: str = "default") -> str:
    """把结构化总结渲染为 Markdown。"""

    presentation = build_summary_presentation(document, summary_style=summary_style)
    return _serialize_summary_presentation(presentation)


def _serialize_summary_presentation(presentation: SummaryPresentation) -> str:
    lines = [f"# {presentation.title}"]
    for section in presentation.sections:
        lines.extend(_serialize_section(section))
    return "\n".join(lines).strip() + "\n"


def _serialize_section(section: PresentationSection) -> list[str]:
    return [
        "",
        f"{'#' * section.level} {section.heading}",
        *section.lines,
    ]

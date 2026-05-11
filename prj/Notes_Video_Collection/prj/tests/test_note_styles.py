from video_summary_cli.note_styles import normalize_summary_style, render_note_sections


def test_normalize_summary_style_falls_back_to_default() -> None:
    assert normalize_summary_style("unknown-style") == "default"


def test_render_note_sections_supports_concise_style() -> None:
    lines = render_note_sections(
        summary_style="concise",
        abstract="这是摘要。",
        bullets=["要点一", "要点二"],
        key_segment_lines=["- 时间片段 A"],
        screenshot_lines=["![关键画面 1](img/quick/frame-001.jpg)"],
        transcript_lines=["- 全文段落 A"],
    )

    rendered = "\n".join(lines)
    assert "## 一句话总结" in rendered
    assert "## 核心结论" in rendered
    assert "## 时间锚点" in rendered


def test_render_note_sections_supports_tutorial_note_style() -> None:
    lines = render_note_sections(
        summary_style="tutorial-note",
        abstract="这是摘要。",
        bullets=["步骤一", "步骤二"],
        key_segment_lines=["- 时间片段 A"],
        screenshot_lines=["![关键画面 1](img/smart/frame-001.jpg)"],
        transcript_lines=["- 全文段落 A"],
    )

    rendered = "\n".join(lines)
    assert "## 学习目标" in rendered
    assert "## 操作步骤" in rendered
    assert "1. 步骤一" in rendered
    assert "## 逐段转写" not in rendered
    assert "## 画面变化索引" not in rendered


def test_render_note_sections_supports_action_note_style() -> None:
    lines = render_note_sections(
        summary_style="action-note",
        abstract="这是摘要。",
        bullets=["行动一", "行动二"],
        key_segment_lines=["- 时间片段 A"],
        screenshot_lines=[],
        transcript_lines=["- 全文段落 A"],
    )

    rendered = "\n".join(lines)
    assert "## 任务概览" in rendered
    assert "- [ ] 行动一" in rendered
    assert "## 执行清单" in rendered

from video_summary_cli.text_normalizer import normalize_domain_terms, polish_summary_text


def test_normalize_domain_terms_handles_long_tail_codex_asr_variants() -> None:
    source_text = (
        "克莱X它有个功能叫自动化，那这个自动化是需要你克莱斯保持一个运行的状态。"
        "比如说 GPT5.3COTEX。"
        "用这个 JSD 的这个 macoo base 去了解这个代码库的时候。"
    )

    normalized_text = normalize_domain_terms(source_text)

    assert "克莱X" not in normalized_text
    assert "克莱斯" not in normalized_text
    assert "GPT5.3COTEX" not in normalized_text
    assert "macoo base" not in normalized_text
    assert "Codex" in normalized_text
    assert "GPT-5.3 Codex" in normalized_text
    assert "Map Codebase" in normalized_text


def test_normalize_domain_terms_handles_notebooklm_parenting_asr_variants() -> None:
    source_text = (
        "我建议所有父母都用 Notebook LM 建一个U2支持库。"
        "它会把文档思维导徒和音频整理出来。"
        "这些卫扬指南、发育金色，还有婴儿腐蚀添加的营养指南都会保留处处和来源。"
        "美国R科学会发布的这份指南，和婴儿府是添加的阴阳指南都能继续追溯。"
        "我们也可以拿它和 deep seek 做对比。"
    )

    normalized_text = normalize_domain_terms(source_text)

    assert "Notebook LM" not in normalized_text
    assert "U2支持库" not in normalized_text
    assert "文档思维导徒" not in normalized_text
    assert "卫扬指南" not in normalized_text
    assert "发育金色" not in normalized_text
    assert "婴儿腐蚀添加" not in normalized_text
    assert "美国R科学会" not in normalized_text
    assert "婴儿府是添加的阴阳指南" not in normalized_text
    assert "处处和来源" not in normalized_text
    assert "deep seek" not in normalized_text
    assert "NotebookLM" in normalized_text
    assert "育儿知识库" in normalized_text
    assert "文档、思维导图和音频" in normalized_text
    assert "美国儿科学会" in normalized_text
    assert "喂养指南" in normalized_text
    assert "发育监测" in normalized_text
    assert "婴儿辅食添加的营养指南" in normalized_text
    assert "出处和来源" in normalized_text
    assert "DeepSeek" in normalized_text


def test_polish_summary_text_cleans_parenting_spoken_fillers() -> None:
    source_text = (
        "这个NotebookLM呢 其实呢它是能将那个本地或者是网络上的大量的权威的资料呢 "
        "可以转换为全部导入到你自己的一个个人知识库里。"
        "还有你甚至说你随便复制一遍文字都可以 你新来的文字。"
        "然后并且能够帮助我们 快速的进行知识内化。"
    )

    polished_text = polish_summary_text(source_text)

    assert "其实呢" not in polished_text
    assert "你新来的文字" not in polished_text
    assert "然后并且能够帮助我们" not in polished_text
    assert "NotebookLM" in polished_text
    assert "个人知识库" in polished_text
    assert any(keyword in polished_text for keyword in ("粘贴", "导入", "知识内化"))

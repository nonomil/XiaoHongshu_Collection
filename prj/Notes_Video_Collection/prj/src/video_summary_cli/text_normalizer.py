from __future__ import annotations

import re


TERM_REPLACEMENTS: tuple[tuple[str, str], ...] = (
    (r"(?i)notebook\s*lm", "NotebookLM"),
    (r"(?i)(?:class|glass|cortex|gooss)\s*app", "Codex App"),
    (r"(?i)cortex", "Codex"),
    (r"克莱X", "Codex"),
    (r"克莱斯", "Codex"),
    (r"(?i)sub\s*agents?", "Subagents"),
    (r"(?i)front\s*end", "Frontend"),
    (r"方end", "Frontend"),
    (r"(?i)get\s+it", "Git"),
    (r"(?i)work\s*tree", "Worktree"),
    (r"weal tr", "Worktree"),
    (r"VOGUTREE", "Worktree"),
    (r"(?i)\bMAD\b", "main"),
    (r"open家", "OpenAI"),
    (r"open i", "OpenAI"),
    (r"play模式", "Plan 模式"),
    (r"prime模式", "Plan 模式"),
    (r"(?i)gpt\s*[- ]?5(?:\.|点)?3\s*(?:co?d?e?x|cotex)", "GPT-5.3 Codex"),
    (r"(?i)macoo\s*base", "Map Codebase"),
    (r"(?i)map\s*code\s*base", "Map Codebase"),
    (r"(?i)\bplan\b", "Plan"),
    (r"(?i)\bdebug\b", "调试"),
    (r"(?i)\bskills\b", "技能"),
    (r"(?i)\bthe skills\b", "技能"),
    (r"工作数", "工作树"),
    (r"UUI", "UI"),
    (r"子弹礼", "子代理"),
    (r"子弹里", "子代理"),
    (r"子代点", "子代理"),
    (r"字代里", "子代理"),
    (r"自成体", "子代理"),
    (r"子弹", "子代理"),
    (r"个人支持库", "个人知识库"),
    (r"U2(?:支持库|知识库)", "育儿知识库"),
    (r"幼儿(?:支持库|知识库)", "育儿知识库"),
    (r"支持库", "知识库"),
    (r"卫扬", "喂养"),
    (r"卫养", "喂养"),
    (r"发育金色", "发育监测"),
    (r"发育监测和父母自我支持", "发育监测、情感培育和父母自我支持"),
    (r"腐蚀添加", "辅食添加"),
    (r"文档思维导图和音频", "文档、思维导图和音频"),
    (r"文档思维导徒和音频", "文档、思维导图和音频"),
    (r"处处和来源", "出处和来源"),
    (r"导徒", "导图"),
    (r"处处来源", "出处来源"),
    (r"处处", "出处"),
    (r"以买通发表的这个", "美国儿科学会发布的这份"),
    (r"义买通发表的这个", "美国儿科学会发布的这份"),
    (r"美国R科学会", "美国儿科学会"),
    (r"美国r科学会", "美国儿科学会"),
    (r"美国.?科学会", "美国儿科学会"),
    (r"7到24月0", "7到24月龄"),
    (r"婴儿府是添加的阴阳指南", "婴儿辅食添加营养指南"),
    (r"婴儿府是添加的营养指南", "婴儿辅食添加营养指南"),
    (r"婴儿府是添加指南", "婴儿辅食添加营养指南"),
    (r"婴儿辅食添加的阴阳指南", "婴儿辅食添加营养指南"),
    (r"婴儿.?是添加(?:的阴阳)?指南", "婴儿辅食添加营养指南"),
    (r"不能够完全信任", "不能完全信任"),
    (r"有出处和来\b", "有出处和来源"),
    (r"(?i)deep\s*seek", "DeepSeek"),
    (r"国家卫健委", "国家卫生健康委员会"),
)

SUMMARY_REPLACEMENTS: tuple[tuple[str, str], ...] = (
    (r"^呢+", ""),
    (r"这个NotebookLM(?:呢)?\s*其实(?:呢)?\s*它是能将那个", "NotebookLM可以把"),
    (r"NotebookLM(?:呢)?\s*其实(?:呢)?\s*它是能将那个", "NotebookLM可以把"),
    (r"它是能将那个", "它可以把"),
    (r"是我使用下来觉得上手会非常容易", "上手会非常容易"),
    (r"对我的工作和生活带来非常极大便利的一个应用", "对工作和生活都很方便"),
    (r"本地或者是网络上的大量的权威的资料", "本地或网络上的大量权威资料"),
    (r"可以转换为全部导入到你自己的一个个人知识库里", "导入你自己的个人知识库里"),
    (r"这个用几分钟时间形成这个知识库之后", "用几分钟搭好这个知识库之后"),
    (r"还有你甚至说你随便复制一遍文字都可以", "也可以直接粘贴文字导入"),
    (r"你新来的文字", "粘贴的文字"),
    (r"也可以直接粘贴文字导入\s*粘贴的文字", "也可以直接粘贴文字导入"),
    (r"或者说是", "也可以"),
    (r"你直接在这里搜索你想要的东西", "直接搜索你想要的资料"),
    (r"他就直接搜索出来之后", "搜索结果出来之后"),
    (r"我就问他一个问题", "我就问了它一个问题"),
    (r"作为作为一个", "作为一个"),
    (r"我觉得他的回答是非常(?:正|振)", "我觉得它的回答更完整"),
    (r"我觉得是非常好的", "整体回答比较完整"),
    (r"你会发现他的回答会更为的", "你会发现它的回答更零散"),
    (r"会是东一片\s*西一片的这样的", "会显得东一片、西一片"),
    (r"会是东一片\s*西一片", "会显得东一片、西一片"),
    (r"但是他这个数字来源", "但这些数字的来源"),
    (r"这个数字他提供的这么精准", "这些数字看起来很精准"),
    (r"到底是出自于\s*一个非常权威的指南\s*还是出自于一个", "来源未必都能追溯到权威指南"),
    (r"然后并且能够帮助我们", "并且能够帮助我们"),
    (r"然后第二点(?:呢)?\s*(?:，|,)?\s*我是觉得说", "第二点是"),
    (r"第二点(?:呢)?\s*(?:，|,)?\s*我是觉得说", "第二点是"),
    (r"我是觉得说", ""),
    (r"我是觉得", ""),
    (r"我觉得是", ""),
    (r"我觉得", ""),
    (r"你看他的每一句话", "回答的每一句话"),
    (r"下句话这个也用来源是", "下一句的来源是"),
    (r"都是由你自己导入的资料去做支撑的", "都由你导入的资料支撑"),
    (r"他不会去产生幻觉", "它不会产生幻觉"),
    (r"他也不会去给你瞎编一些", "也不会给你瞎编一些"),
    (r"凭空的给你编造的东西", "凭空编造的内容"),
    (r"你都是无从得知的", "你很难判断"),
    (r"所以说这里面的所出现的", ""),
    (r"所他所给你提供的答案", "它给你的答案"),
    (r"就是作为现在的", "作为现在的"),
    (r"去成体系的去学习", "系统地学习"),
    (r"去搭建这么一套婴儿体系", "搭建一套婴儿知识体系"),
    (r"这个婴儿知识", "育儿知识"),
    (r"去去", "去"),
    (r"给我们提供了一个[，, ]*非常快速[，, ]*高效的体系搭建的[，, ]*(?:这么[，, ]*)?一套方法", "提供了一套非常快速高效的体系搭建方法"),
    (r"一个非常快速\s*高效的体系搭建的这么", "一套非常快速、高效的体系搭建方法"),
    (r"高效的体系搭建的这么", "高效的体系搭建方法"),
    (r"给我们提供了一个[，, ]*非常快速高效的体系搭建的[，, ]*一套方法", "提供了一套非常快速高效的体系搭建方法"),
    (r"给我们提供了一个\s*非常快速高效的体系搭建的\s*一套方法", "提供了一套非常快速高效的体系搭建方法"),
    (r"能够帮助我们\s*快速的进行知识内化\s*我是觉得", "能够帮助我们快速进行知识内化"),
    (r"快速的进行知识内化", "快速进行知识内化"),
    (r"一个\s+一个\s+方法", "一套方法"),
    (r"所以呢就我分享给大家", "所以我也分享给大家"),
    (r"这个对我的帮助非常大", "这对个人实践帮助很大"),
    (r"一个我作为一个", "作为一个"),
    (r"这么一个方法", "一套方法"),
)

SUMMARY_PREFIXES: tuple[str, ...] = (
    "这个NotebookLM呢",
    "这个NotebookLM",
    "大家好",
    "这里是",
    "今天我们",
    "那么",
    "那",
    "然后",
    "然后的话",
    "并且",
    "而且",
    "还有",
    "还有你甚至说",
    "你甚至说",
    "或者说是",
    "或者说",
    "就是说",
    "就比如说",
    "比如说",
    "其实",
    "这个时候",
    "如果说",
    "你也可以",
    "我们可以",
    "我们就",
    "OK",
    "好",
    "的话",
    "就是",
    "第二点是",
    "第二点",
)

SUMMARY_FRAGMENT_SUFFIXES: tuple[str, ...] = (
    "更为的",
    "这个",
    "那个",
    "这样",
    "这样的",
    "的话",
)


def normalize_domain_terms(text: str) -> str:
    """把高频领域术语误识别统一成更稳定的写法。"""

    normalized_text = text
    for pattern, replacement in TERM_REPLACEMENTS:
        normalized_text = re.sub(pattern, replacement, normalized_text)
    normalized_text = re.sub(r"\s+", " ", normalized_text).strip()
    return normalized_text


def strip_spoken_prefixes(text: str) -> str:
    """剥离标题里高频的口语前缀。"""

    stripped_text = text.strip()
    changed = True
    while changed and stripped_text:
        changed = False
        for prefix in SUMMARY_PREFIXES:
            if stripped_text.startswith(prefix):
                stripped_text = stripped_text[len(prefix) :].strip("，。！？；;、 :：")
                changed = True
    return stripped_text


def polish_summary_text(text: str, max_length: int | None = None) -> str:
    """把摘要、要点和图下说明整理成更自然的书面表达。"""

    polished_text = normalize_domain_terms(text)
    for pattern, replacement in SUMMARY_REPLACEMENTS:
        polished_text = re.sub(pattern, replacement, polished_text)
    polished_text = re.sub(r"(?<=[\u4e00-\u9fffA-Za-z])呢(?=[，。！？!?、 ]|$)", "", polished_text)
    polished_text = re.sub(r"([，。！？!?、 ])呢(?=\S)", r"\1", polished_text)
    polished_text = strip_spoken_prefixes(polished_text)
    polished_text = re.sub(r"^呢(?=\S)", "", polished_text)
    polished_text = re.sub(r"^(?:并且|而且|还有|另外|同时|接着|随后)[，、 ]*", "", polished_text)
    polished_text = re.sub(r"\s+", " ", polished_text).strip("，。！？；;、 :：")
    if not polished_text:
        return ""

    for suffix in SUMMARY_FRAGMENT_SUFFIXES:
        if polished_text.endswith(suffix) and len(polished_text) > len(suffix):
            polished_text = polished_text[: -len(suffix)].rstrip("，。！？；;、 :：")
            break

    if max_length is not None and len(polished_text) > max_length:
        break_index = max(polished_text.rfind(delimiter, 0, max_length + 1) for delimiter in ("。", "，", "；", "、", " "))
        if break_index >= max(12, max_length // 2):
            polished_text = polished_text[:break_index].rstrip("，。！？；;、 :：")
    return polished_text


def clean_title_phrase(text: str) -> str:
    """把章节/小节标题候选整理成更像人工写法的短语。"""

    cleaned_text = polish_summary_text(text)
    cleaned_text = cleaned_text.strip("，。！？；;、 :：")
    cleaned_text = re.sub(r"(还有你可|所以是|而且是|而这边|这样的一|的话)$", "", cleaned_text).strip()
    cleaned_text = re.sub(r"(是|而|和|可)$", "", cleaned_text).strip()
    cleaned_text = re.sub(r"\s+", " ", cleaned_text).strip()
    return cleaned_text

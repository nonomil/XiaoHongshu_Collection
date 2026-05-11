from __future__ import annotations

from dataclasses import dataclass
from math import ceil
import re

from video_summary_cli.models import SummaryChapter, TranscriptSegment
from video_summary_cli.text_normalizer import clean_title_phrase, normalize_domain_terms, polish_summary_text
from video_summary_cli.transcript import clean_segment_text, merge_adjacent_segments, select_key_segments

SUMMARY_KEYWORDS: tuple[str, ...] = (
    "NotebookLM",
    "知识库",
    "导入",
    "出处",
    "来源",
    "权威",
    "指南",
    "喂养",
    "辅食添加",
    "发育监测",
    "情感培育",
    "新手父母",
    "新手家长",
    "幻觉",
    "编造",
    "体系",
    "内化",
    "不能完全信任",
    "不能够完全信任",
    "无从得知",
)

CLAUSE_SPLIT_PATTERN = re.compile(
    r"[，。！？!?\n:：]|"
    r"\s+(?=(?:但是|然后|并且|所以|因为|还有|同时|另外|而且|不过|如果|对于|下句话|下一句|这些答案|作为现在|最后|接着))"
)


@dataclass(frozen=True, slots=True)
class ThemeRule:
    """章节主题规则。"""

    title: str
    keywords: tuple[str, ...]
    priority: int
    default_goal: str


@dataclass(frozen=True, slots=True)
class TitleCandidate:
    """章节标题候选。"""

    title: str
    score: float
    default_goal: str = ""


THEME_RULES: tuple[ThemeRule, ...] = (
    ThemeRule(
        title="基础设置与模型选择",
        keywords=("语言", "默认打开", "休眠", "模型", "推理级别", "余量"),
        priority=144,
        default_goal="熟悉 Codex App 的基础设置、模型选择与运行前准备。",
    ),
    ThemeRule(
        title="项目初始化与 Plan 模式",
        keywords=("新建项目", "Git", "计划模式", "Plan 模式", "语音输入", "需求"),
        priority=142,
        default_goal="掌握新项目初始化、需求澄清与 Plan 模式的使用顺序。",
    ),
    ThemeRule(
        title="线程管理与运行调试",
        keywords=("线程", "归档", "启动命令", "环境", "调试", "等待回复"),
        priority=140,
        default_goal="理解线程归档、运行命令和调试入口的日常用法。",
    ),
    ThemeRule(
        title="技能安装与界面优化",
        keywords=("技能", "UI", "Frontend", "界面", "美元符号", "安装"),
        priority=138,
        default_goal="学会安装技能、调用技能，并用技能优化页面体验。",
    ),
    ThemeRule(
        title="Worktree 并行开发",
        keywords=("Worktree", "工作树", "并行开发", "main", "分支"),
        priority=136,
        default_goal="掌握 Worktree 并行开发和安全合并主分支的基本方式。",
    ),
    ThemeRule(
        title="自动化、记忆与 MCP 测试",
        keywords=("自动化", "简报", "项目记忆", "MCP", "测试", "浏览器"),
        priority=134,
        default_goal="理解自动化、项目记忆与 MCP 测试如何串成持续工作流。",
    ),
    ThemeRule(
        title="子代理基础与角色分工",
        keywords=("子代理", "Subagents", "主代理", "代码质量", "竞争条件"),
        priority=146,
        default_goal="理解主代理与子代理的分工，以及子代理的核心职责。",
    ),
    ThemeRule(
        title="子代理提示词与线程查看",
        keywords=("提示词", "线程", "运行过程", "安全风险", "查看"),
        priority=144,
        default_goal="掌握子代理提示词生成方式，以及运行线程的查看入口。",
    ),
    ThemeRule(
        title="主代理协调与上下文隔离",
        keywords=("协调", "上下文", "接口文档", "review", "主代理"),
        priority=142,
        default_goal="理解主代理如何协调子代理，以及上下文隔离带来的收益。",
    ),
    ThemeRule(
        title="并行协作与临时子代理",
        keywords=("并行", "独立空间", "临时性", "换了个项目", "效率"),
        priority=140,
        default_goal="理解并行协作的运行方式，以及临时子代理的使用边界。",
    ),
    ThemeRule(
        title="自定义子代理与权限配置",
        keywords=("TOML", "沙箱", "MCP", "技能", "公共目录", "项目目录"),
        priority=138,
        default_goal="学会定义可复用子代理，并配置沙箱、技能和 MCP 权限。",
    ),
    ThemeRule(
        title="子代理实践建议",
        keywords=("低耦合", "职责范围", "返回结果", "失败不影响整体", "实践"),
        priority=136,
        default_goal="整理子代理拆分、输出约束和失败隔离的实践建议。",
    ),
    ThemeRule(
        title="NotebookLM 与育儿知识库搭建",
        keywords=("NotebookLM", "育儿知识库", "个人知识库", "权威资料", "知识库"),
        priority=220,
        default_goal="理解如何用 NotebookLM 把权威育儿资料整理成可复用的个人知识库。",
    ),
    ThemeRule(
        title="导入资料并提出育儿问题",
        keywords=("上传文件", "导入", "搜索", "新手父母", "0到1岁的婴儿"),
        priority=218,
        default_goal="掌握资料导入、搜索补充与围绕真实育儿问题发问的基本方式。",
    ),
    ThemeRule(
        title="权威来源与回答可信度",
        keywords=("出处和来源", "出处来源", "出处", "来源", "权威", "指南", "国家卫生健康委员会", "美国儿科学会", "辅食添加"),
        priority=216,
        default_goal="学会核对回答的出处、来源与权威指南，判断内容是否可信。",
    ),
    ThemeRule(
        title="对比通用 AI 的幻觉风险",
        keywords=("豆包", "DeepSeek", "没有成体系", "东一片西一片", "无从得知", "编造", "幻觉"),
        priority=214,
        default_goal="理解通用 AI 在育儿建议场景下的幻觉风险和信息碎片化问题。",
    ),
    ThemeRule(
        title="新手父母为什么要系统学习",
        keywords=("新手家长", "新手父母", "成体系", "婴儿知识", "非常有必要", "不能够完全信任"),
        priority=212,
        default_goal="理解新手父母为什么需要系统化整理和学习育儿知识。",
    ),
    ThemeRule(
        title="快速搭建体系并完成知识内化",
        keywords=("快速", "高效", "体系搭建", "知识内化", "方法"),
        priority=210,
        default_goal="把知识库搭建、快速理解和知识内化串成可持续复用的方法。",
    ),
    ThemeRule(
        title="学习方法的时代转向",
        keywords=("学习方法", "方法论", "AI时代", "这个时代", "多用AI"),
        priority=120,
        default_goal="理解 AI 时代为什么要重构嵌入式学习方法。",
    ),
    ThemeRule(
        title="沉浸式编程与 AI 分工",
        keywords=("沉浸式编程", "编程范式", "PRD", "系统架构", "执行能力", "设计思路"),
        priority=116,
        default_goal="理解沉浸式编程里“人做设计、AI做执行”的协作分工。",
    ),
    ThemeRule(
        title="AI 辅助调试与问题检验",
        keywords=("调试", "日志", "检验", "错误中断", "排查问题", "debug"),
        priority=112,
        default_goal="掌握 AI 在日志分析、调试定位和问题检验中的使用方式。",
    ),
    ThemeRule(
        title="工作流与陌生领域开发",
        keywords=("工作流", "不熟知", "加载", "陌生领域", "服务器"),
        priority=108,
        default_goal="理解如何用工作流和知识库加速陌生领域开发。",
    ),
    ThemeRule(
        title="提示词、上下文与可复用资产",
        keywords=("提示词工程", "上下文", "项目记忆", "MCP", "可复用", "方向盘"),
        priority=114,
        default_goal="理解提示词、上下文和项目记忆为什么是 AI 开发的核心资产。",
    ),
    ThemeRule(
        title="从 90 分到 100 分的跃迁",
        keywords=("90分", "100分", "善后工程师", "边界条件", "美中不足"),
        priority=110,
        default_goal="理解 AI 先做到 90 分，再由人补足最后 10 分的协作方式。",
    ),
    ThemeRule(
        title="框架思维与接口设计",
        keywords=("框架", "接口", "抽象思维", "结构体", "配置分离"),
        priority=104,
        default_goal="建立框架思维，先设计接口与边界，再让 AI 填充实现。",
    ),
    ThemeRule(
        title="AI 学习路径与落地建议",
        keywords=("学习思路", "学习重点", "快速迭代", "先能跑", "实践"),
        priority=100,
        default_goal="整理 AI 学习路径，明确从实践到迭代的落地顺序。",
    ),
    ThemeRule(
        title="常见误区与学习建议",
        keywords=("误区", "警惕", "基础不牢", "投机取巧", "循序渐进"),
        priority=96,
        default_goal="识别常见误区，避免把 AI 学习误解为跳过思考。",
    ),
)


def build_chapters(
    transcript_segments: list[TranscriptSegment],
    min_chapters: int = 3,
    max_chapters: int = 6,
) -> list[SummaryChapter]:
    """把长转写整理成更适合教程阅读的章节。"""

    merged_segments = merge_adjacent_segments(
        transcript_segments,
        target_characters=120,
        max_segments=6,
    )
    if not merged_segments:
        return []

    chapter_count = _determine_chapter_count(
        segment_count=len(merged_segments),
        min_chapters=min_chapters,
        max_chapters=max_chapters,
    )
    segment_groups = _split_segments_into_groups(merged_segments, chapter_count)
    chapters: list[SummaryChapter] = []
    used_titles: set[str] = set()

    for index, group in enumerate(segment_groups, 1):
        chapter_texts = [segment.text.strip() for segment in group if segment.text.strip()]
        title, default_goal = _select_unique_title(
            chapter_texts=chapter_texts,
            chapter_index=index,
            used_titles=used_titles,
        )
        chapters.append(
            SummaryChapter(
                title=title,
                goal=_extract_goal(chapter_texts, default_goal),
                key_points=_extract_key_points(chapter_texts),
                example_or_case=_extract_marker_sentence(chapter_texts, ("案例", "例如", "比如", "举例", "对比")),
                caution=_extract_marker_sentence(
                    chapter_texts,
                    ("注意", "不要", "避免", "误区", "风险", "不能完全信任", "不能够完全信任", "无从得知", "幻觉", "编造"),
                ),
                anchor_start_seconds=group[0].start_seconds,
                anchor_end_seconds=group[-1].end_seconds,
                screenshot_paths=[],
            )
        )
    return chapters


def select_key_segments_for_chapters(
    transcript_segments: list[TranscriptSegment],
    chapters: list[SummaryChapter],
    limit: int = 5,
) -> list[TranscriptSegment]:
    """按章节挑选代表性片段，避免只取视频开头。"""

    if not chapters:
        return select_key_segments(transcript_segments, limit=limit)

    merged_segments = merge_adjacent_segments(transcript_segments)
    if not merged_segments:
        return []

    selected_segments: list[TranscriptSegment] = []
    for chapter in chapters[:limit]:
        representative = _pick_representative_segment(merged_segments, chapter)
        if representative not in selected_segments:
            selected_segments.append(representative)
    return selected_segments


def _determine_chapter_count(segment_count: int, min_chapters: int, max_chapters: int) -> int:
    if segment_count <= 0:
        return 0
    if segment_count <= 2:
        return segment_count

    ideal_count = ceil(segment_count / 2)
    bounded_count = max(min_chapters, min(max_chapters, ideal_count))
    return min(segment_count, bounded_count)


def _split_segments_into_groups(
    segments: list[TranscriptSegment],
    chapter_count: int,
) -> list[list[TranscriptSegment]]:
    if chapter_count <= 0:
        return []

    base_size, remainder = divmod(len(segments), chapter_count)
    groups: list[list[TranscriptSegment]] = []
    start_index = 0
    for index in range(chapter_count):
        current_size = base_size + (1 if index < remainder else 0)
        end_index = start_index + current_size
        groups.append(segments[start_index:end_index])
        start_index = end_index
    return [group for group in groups if group]


def _select_unique_title(
    chapter_texts: list[str],
    chapter_index: int,
    used_titles: set[str],
) -> tuple[str, str]:
    title_candidates = _build_title_candidates(chapter_texts, chapter_index)
    for candidate in title_candidates:
        if candidate.title not in used_titles:
            used_titles.add(candidate.title)
            return candidate.title, candidate.default_goal

    base_candidate = title_candidates[0]
    for subtitle in _build_subtitle_candidates(chapter_texts):
        unique_title = f"{base_candidate.title}·{subtitle}"
        if unique_title not in used_titles:
            used_titles.add(unique_title)
            return unique_title, base_candidate.default_goal

    fallback_title = f"{base_candidate.title}·第{chapter_index}节"
    used_titles.add(fallback_title)
    return fallback_title, base_candidate.default_goal


def _build_title_candidates(chapter_texts: list[str], chapter_index: int) -> list[TitleCandidate]:
    sentences = _collect_sentences(chapter_texts)
    candidates: list[TitleCandidate] = []

    for rule in THEME_RULES:
        score = _score_theme(rule, sentences)
        if score > 0:
            candidates.append(
                TitleCandidate(
                    title=rule.title,
                    score=score,
                    default_goal=rule.default_goal,
                )
            )

    for offset, sentence in enumerate(sentences[:3]):
        clause = _extract_salient_clause(sentence)
        if clause:
            candidates.append(
                TitleCandidate(
                    title=clause[:18],
                    score=60.0 - offset,
                    default_goal=_build_goal_from_clause(clause),
                )
            )

    candidates.append(
        TitleCandidate(
            title=f"章节 {chapter_index}",
            score=1.0,
            default_goal="梳理本章的核心内容与实践重点。",
        )
    )

    deduplicated_candidates: list[TitleCandidate] = []
    seen_titles: set[str] = set()
    for candidate in sorted(candidates, key=lambda item: item.score, reverse=True):
        if candidate.title in seen_titles:
            continue
        deduplicated_candidates.append(candidate)
        seen_titles.add(candidate.title)
    return deduplicated_candidates


def _extract_goal(chapter_texts: list[str], default_goal: str) -> str:
    sentences = _collect_sentences(chapter_texts)
    explicit_goal = _select_best_sentence(sentences, ("目标", "为了"))
    if explicit_goal:
        compressed_goal = _compress_sentence(explicit_goal, max_length=42)
        if compressed_goal and len(compressed_goal) <= 30:
            return compressed_goal
    if default_goal:
        return default_goal

    secondary_goal = _select_best_sentence(sentences, ("核心", "重点", "记住", "需要"))
    if secondary_goal:
        return _compress_sentence(secondary_goal, max_length=54)
    if not sentences:
        return "梳理本章的核心内容。"
    return _build_goal_from_clause(sentences[0])


def _extract_key_points(chapter_texts: list[str], limit: int = 3) -> list[str]:
    sentences = _collect_sentences(chapter_texts)
    candidate_points = _collect_clauses(chapter_texts) or sentences
    scored_points: list[tuple[float, str]] = []
    for index, sentence in enumerate(candidate_points):
        score = float(max(0, 6 - index))
        if any(keyword in sentence for keyword in ("核心", "重点", "需要", "记住", "第一", "第二", "第三", "可以")):
            score += 6.0
        if any(keyword in sentence for keyword in ("案例", "例如", "比如", "注意", "不要")):
            score += 2.0
        if any(keyword in sentence for keyword in SUMMARY_KEYWORDS):
            score += 3.0
        point = _compress_sentence(sentence, max_length=72)
        if _is_low_quality_summary_text(point):
            continue
        scored_points.append((score, point))

    key_points: list[str] = []
    for _, point in sorted(scored_points, key=lambda item: item[0], reverse=True):
        if not point or point in key_points:
            continue
        key_points.append(point)
        if len(key_points) >= limit:
            break

    if len(key_points) < 2:
        for sentence in candidate_points:
            point = _compress_sentence(sentence, max_length=48)
            if point and point not in key_points:
                key_points.append(point)
            if len(key_points) >= 2:
                break
    return key_points[:limit]


def _extract_marker_sentence(chapter_texts: list[str], markers: tuple[str, ...]) -> str:
    sentence = _select_best_sentence(_collect_clauses(chapter_texts) or _collect_sentences(chapter_texts), markers)
    if not sentence:
        return ""
    marker_window = _extract_marker_window(sentence, markers=markers, max_length=54)
    if marker_window:
        return marker_window
    return _compress_sentence(sentence, max_length=54)


def _pick_representative_segment(
    segments: list[TranscriptSegment],
    chapter: SummaryChapter,
) -> TranscriptSegment:
    overlapping_segments = [
        segment
        for segment in segments
        if segment.end_seconds >= chapter.anchor_start_seconds and segment.start_seconds <= chapter.anchor_end_seconds
    ]
    if not overlapping_segments:
        chapter_midpoint = (chapter.anchor_start_seconds + chapter.anchor_end_seconds) / 2
        return min(
            segments,
            key=lambda item: abs(((item.start_seconds + item.end_seconds) / 2) - chapter_midpoint),
        )

    chapter_midpoint = (chapter.anchor_start_seconds + chapter.anchor_end_seconds) / 2
    return min(
        overlapping_segments,
        key=lambda item: abs(((item.start_seconds + item.end_seconds) / 2) - chapter_midpoint),
    )


def _normalize_sentence(text: str) -> str:
    cleaned_text = clean_segment_text(text)
    cleaned_text = polish_summary_text(cleaned_text)
    cleaned_text = cleaned_text.lstrip("：: ")
    cleaned_text = re.sub(r"\s+", " ", cleaned_text).strip()
    return cleaned_text


def _score_theme(rule: ThemeRule, sentences: list[str]) -> float:
    score = 0.0
    for index, sentence in enumerate(sentences):
        position_bonus = max(0, 5 - index) * 3
        for keyword in rule.keywords:
            if keyword in sentence:
                score += float(len(keyword) + position_bonus + rule.priority)
    return score


def _build_subtitle_candidates(chapter_texts: list[str]) -> list[str]:
    combined_text = " ".join(chapter_texts)
    subtitle_candidates: list[str] = []
    for keyword in (
        "项目记忆",
        "上下文",
        "MCP",
        "工作流",
        "调试日志",
        "框架设计",
        "快速迭代",
        "学习建议",
        "系统架构",
        "陌生领域",
    ):
        if keyword in combined_text and keyword not in subtitle_candidates:
            subtitle_candidates.append(keyword)

    for sentence in chapter_texts:
        clause = _extract_salient_clause(sentence)
        if clause:
            short_clause = clause[:8]
            if short_clause not in subtitle_candidates:
                subtitle_candidates.append(short_clause)
    return subtitle_candidates


def _collect_sentences(chapter_texts: list[str]) -> list[str]:
    sentences: list[str] = []
    for text in chapter_texts:
        for sentence in re.split(r"[。！？!?\n]", _normalize_sentence(text)):
            normalized_sentence = sentence.strip()
            if normalized_sentence:
                sentences.append(normalized_sentence)
    return sentences


def _collect_clauses(chapter_texts: list[str]) -> list[str]:
    clauses: list[str] = []
    for text in chapter_texts:
        for clause in _split_summary_fragments(_normalize_sentence(text)):
            if clause and not _is_low_quality_summary_text(clause):
                clauses.append(clause)
    return clauses


def _split_summary_fragments(text: str) -> list[str]:
    return [
        cleaned_fragment
        for fragment in re.split(CLAUSE_SPLIT_PATTERN, text)
        if (cleaned_fragment := clean_title_phrase(fragment))
    ]


def _select_best_sentence(sentences: list[str], markers: tuple[str, ...]) -> str:
    best_sentence = ""
    best_score = -1.0
    for index, sentence in enumerate(sentences):
        if _is_low_quality_summary_text(sentence):
            continue
        match_count = sum(1 for marker in markers if marker in sentence)
        if match_count == 0:
            continue
        score = float(match_count * 10 + max(0, 6 - index))
        if _looks_incomplete_summary_text(sentence):
            score -= 6.0
        if score > best_score:
            best_sentence = sentence
            best_score = score
    return best_sentence


def _extract_salient_clause(text: str) -> str:
    normalized = _normalize_sentence(text)
    candidate_clauses = _split_summary_fragments(normalized)
    ignored_prefixes = (
        "大家好",
        "这里是",
        "今天我们",
        "那么",
        "就是说",
        "其实",
        "然后",
        "接着",
        "最后",
        "这个",
    )
    for clause in candidate_clauses:
        cleaned_clause = re.sub(
            r"^(开场先说明|这一段的目标是|这一章的目标是|这一段先讲|这一章先讲|接着讲|然后进入|最后总结|结尾提醒)",
            "",
            clause,
        ).strip()
        if re.fullmatch(r"\d+", cleaned_clause):
            continue
        if cleaned_clause and not cleaned_clause.startswith(ignored_prefixes):
            return cleaned_clause
    return candidate_clauses[0] if candidate_clauses else normalized


def _compress_sentence(text: str, max_length: int) -> str:
    normalized = _normalize_sentence(text)
    keyword_window = _extract_keyword_window(normalized, max_length=max_length)
    if keyword_window:
        return polish_summary_text(keyword_window, max_length=max_length)
    salient_clause = _extract_salient_clause(normalized)
    if len(salient_clause) <= max_length:
        return polish_summary_text(salient_clause, max_length=max_length)
    return polish_summary_text(salient_clause, max_length=max_length)


def _build_goal_from_clause(text: str) -> str:
    salient_clause = _compress_sentence(text, max_length=36)
    if not salient_clause:
        return "梳理本章的核心内容。"
    if salient_clause.startswith(("理解", "掌握", "识别", "建立", "学会", "整理")):
        return salient_clause
    return f"理解{salient_clause}"


def _extract_keyword_window(text: str, max_length: int) -> str:
    normalized_text = text.strip()
    if not normalized_text:
        return ""
    for keyword in SUMMARY_KEYWORDS:
        keyword_index = normalized_text.find(keyword)
        if keyword_index < 0:
            continue
        window_start = max(0, keyword_index - 10)
        while window_start > 0 and normalized_text[window_start - 1] not in " ，。！？!?:：":
            window_start -= 1
        window_end = min(len(normalized_text), window_start + max_length)
        while window_end < len(normalized_text) and normalized_text[window_end] not in " ，。！？!?:：":
            window_end += 1
        candidate = normalized_text[window_start:window_end].strip("，。！？；;、 ")
        if candidate and not _is_low_quality_summary_text(candidate):
            return candidate
    return ""


def _extract_marker_window(text: str, markers: tuple[str, ...], max_length: int) -> str:
    normalized_text = _normalize_sentence(text)
    if not normalized_text:
        return ""

    best_candidate = ""
    best_score = -1.0
    for marker in sorted(markers, key=len, reverse=True):
        marker_index = normalized_text.find(marker)
        if marker_index < 0:
            continue
        window_start = max(0, marker_index - 14)
        while window_start > 0 and normalized_text[window_start - 1] not in " ，。！？!?:：":
            window_start -= 1
        window_end = min(len(normalized_text), marker_index + len(marker) + max_length // 2)
        while window_end < len(normalized_text) and normalized_text[window_end] not in " ，。！？!?:：":
            window_end += 1
        candidate = polish_summary_text(normalized_text[window_start:window_end], max_length=max_length)
        if not candidate or _is_low_quality_summary_text(candidate):
            continue
        score = float(len(marker) * 10 - abs(marker_index - len(normalized_text) / 2))
        if score > best_score:
            best_candidate = candidate
            best_score = score
    return best_candidate


def _is_low_quality_summary_text(text: str) -> bool:
    normalized_text = text.strip("，。！？；;、 ")
    if not normalized_text:
        return True
    if re.fullmatch(r"\d+", normalized_text):
        return True
    if len(normalized_text) <= 2:
        return True
    if normalized_text in {"这样", "这样呢", "一个", "这个", "那个"}:
        return True
    if any(
        phrase in normalized_text
        for phrase in ("其实呢", "你新来的文字", "然后并且能够帮助我们", "回答会更为的")
    ):
        return True
    if _looks_incomplete_summary_text(normalized_text):
        return True
    return False


def _looks_incomplete_summary_text(text: str) -> bool:
    normalized_text = text.strip("，。！？；;、 ")
    if not normalized_text:
        return True
    if normalized_text.startswith(("这个NotebookLM", "第二点我是觉得说", "然后第二点")):
        return True
    if normalized_text.endswith(("更为的", "这个", "那个", "这样", "这样的", "的话")):
        return True
    return False

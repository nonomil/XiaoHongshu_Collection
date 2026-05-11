from __future__ import annotations

from collections import Counter

from video_summary_cli.models import TranscriptSegment, VideoMetadata
from video_summary_cli.text_normalizer import normalize_domain_terms
from video_summary_cli.transcript import merge_adjacent_segments


class ExtractiveSummarizer:
    """简单的抽取式摘要器。"""

    def summarize(
        self,
        metadata: VideoMetadata,
        transcript_segments: list[TranscriptSegment],
    ) -> tuple[str, list[str]]:
        if not transcript_segments:
            return "未获取到可用转写内容。", ["未获取到可用转写内容。"]

        merged_segments = merge_adjacent_segments(transcript_segments)
        normalized_segments = [
            normalize_domain_terms(segment.text.strip())
            for segment in merged_segments
            if segment.text.strip()
        ]
        abstract = " ".join(normalized_segments[:2]).strip()
        bullets = _rank_sentences(normalized_segments, limit=3)
        return abstract, bullets


def _rank_sentences(sentences: list[str], limit: int) -> list[str]:
    token_counter = Counter()
    for sentence in sentences:
        for token in _tokenize(sentence):
            token_counter[token] += 1

    scored = []
    for sentence in sentences:
        score = sum(token_counter[token] for token in _tokenize(sentence))
        scored.append((score, sentence))

    ranked = [sentence for _, sentence in sorted(scored, key=lambda item: item[0], reverse=True)]
    unique_ranked: list[str] = []
    for sentence in ranked:
        if sentence not in unique_ranked:
            unique_ranked.append(sentence)
        if len(unique_ranked) >= limit:
            break
    return unique_ranked or sentences[:limit]


def _tokenize(sentence: str) -> list[str]:
    return [token for token in sentence.replace("，", " ").replace("。", " ").split() if token]

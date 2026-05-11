from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Protocol
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from video_summary_cli.models import TranscriptSegment, VideoMetadata
from video_summary_cli.summarizer import ExtractiveSummarizer
from video_summary_cli.transcript import merge_adjacent_segments


@dataclass(slots=True)
class OpenAICompatibleConfig:
    """OpenAI 兼容接口配置。"""

    enabled: bool = False
    base_url: str = "https://api.openai.com/v1"
    api_key: str = ""
    model: str = ""
    temperature: float = 0.2
    max_input_characters: int = 12000
    request_timeout_seconds: float = 90.0

    def is_ready(self) -> bool:
        """判断当前配置是否足以发起请求。"""

        return bool(
            self.enabled
            and self.base_url.strip()
            and self.api_key.strip()
            and self.model.strip()
        )

    @classmethod
    def from_dict(cls, payload: dict[str, Any] | None) -> OpenAICompatibleConfig:
        """从字典载荷恢复配置。"""

        source_payload = payload or {}
        return cls(
            enabled=bool(source_payload.get("enabled")),
            base_url=str(source_payload.get("base_url") or "https://api.openai.com/v1"),
            api_key=str(source_payload.get("api_key") or ""),
            model=str(source_payload.get("model") or ""),
            temperature=_coerce_float(source_payload.get("temperature"), 0.2),
            max_input_characters=_coerce_int(source_payload.get("max_input_characters"), 12000),
            request_timeout_seconds=_coerce_float(
                source_payload.get("request_timeout_seconds"),
                90.0,
            ),
        )


class CompletionTransport(Protocol):
    """兼容接口调用传输层。"""

    def create_completion(self, endpoint_url: str, api_key: str, payload: dict[str, Any]) -> dict[str, Any]:
        """发送摘要请求。"""


class UrllibCompletionTransport:
    """基于标准库 urllib 的简易 HTTP 传输层。"""

    def __init__(self, timeout_seconds: float = 90.0) -> None:
        self.timeout_seconds = timeout_seconds

    def create_completion(self, endpoint_url: str, api_key: str, payload: dict[str, Any]) -> dict[str, Any]:
        request_body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        request = Request(
            endpoint_url,
            data=request_body,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
            },
            method="POST",
        )
        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as exc:  # pragma: no cover - 依赖真实网络响应
            response_text = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"OpenAI 兼容摘要请求失败：HTTP {exc.code} {response_text}") from exc
        except URLError as exc:  # pragma: no cover - 依赖真实网络响应
            raise RuntimeError(f"OpenAI 兼容摘要请求失败：{exc.reason}") from exc


class OpenAICompatibleSummarizer:
    """优先走 OpenAI 兼容接口，否则回退到本地抽取式摘要。"""

    def __init__(
        self,
        config: OpenAICompatibleConfig,
        fallback_summarizer=None,
        transport: CompletionTransport | None = None,
    ) -> None:
        self.config = config
        self.fallback_summarizer = fallback_summarizer or ExtractiveSummarizer()
        self.transport = transport or UrllibCompletionTransport(
            timeout_seconds=config.request_timeout_seconds
        )
        self.last_result_source = "extractive"

    def summarize(
        self,
        metadata: VideoMetadata,
        transcript_segments: list[TranscriptSegment],
    ) -> tuple[str, list[str]]:
        """生成摘要。"""

        if not self.config.is_ready():
            self.last_result_source = "extractive"
            return self.fallback_summarizer.summarize(metadata, transcript_segments)

        try:
            endpoint_url = build_chat_completions_url(self.config.base_url)
            payload = self._build_payload(metadata, transcript_segments)
            response_payload = self.transport.create_completion(
                endpoint_url=endpoint_url,
                api_key=self.config.api_key.strip(),
                payload=payload,
            )
            abstract, bullets = _parse_completion_payload(response_payload)
            if not abstract or not bullets:
                raise ValueError("返回内容缺少有效摘要字段。")
            self.last_result_source = "openai-compatible"
            return abstract, bullets[:3]
        except Exception:
            self.last_result_source = "extractive-fallback"
            return self.fallback_summarizer.summarize(metadata, transcript_segments)

    def _build_payload(
        self,
        metadata: VideoMetadata,
        transcript_segments: list[TranscriptSegment],
    ) -> dict[str, Any]:
        transcript_text = _build_transcript_prompt_text(
            transcript_segments=transcript_segments,
            max_input_characters=self.config.max_input_characters,
        )
        return {
            "model": self.config.model.strip(),
            "temperature": self.config.temperature,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "你是一个视频教程总结助手。"
                        "请严格输出 JSON 对象，字段固定为 abstract 和 bullets。"
                        "abstract 要用 1 到 2 句自然中文概括。"
                        "bullets 要输出 2 到 3 条简洁要点，不要重复原文整段搬运。"
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"视频标题：{metadata.title}\n"
                        f"作者：{metadata.uploader}\n"
                        f"平台：{metadata.platform.value}\n"
                        f"转写内容：\n{transcript_text}"
                    ),
                },
            ],
        }


def build_chat_completions_url(base_url: str) -> str:
    """把用户填写的 Base URL 规范成 chat completions 终点。"""

    normalized_url = base_url.strip().rstrip("/")
    if normalized_url.endswith("/chat/completions"):
        return normalized_url
    return f"{normalized_url}/chat/completions"


def _build_transcript_prompt_text(
    transcript_segments: list[TranscriptSegment],
    max_input_characters: int,
) -> str:
    merged_segments = merge_adjacent_segments(transcript_segments)
    lines = [
        f"[{int(segment.start_seconds):04d}-{int(segment.end_seconds):04d}] {segment.text.strip()}"
        for segment in merged_segments
        if segment.text.strip()
    ]
    transcript_text = "\n".join(lines)
    if len(transcript_text) <= max_input_characters:
        return transcript_text

    head_length = max_input_characters // 2
    tail_length = max_input_characters - head_length - 16
    return (
        transcript_text[:head_length].rstrip()
        + "\n\n[...内容已截断...]\n\n"
        + transcript_text[-tail_length:].lstrip()
    )


def _parse_completion_payload(payload: dict[str, Any]) -> tuple[str, list[str]]:
    content = _extract_message_content(payload)
    response_object = _parse_json_like_content(content)
    abstract = str(response_object.get("abstract", "")).strip()
    bullets = _normalize_bullets(response_object.get("bullets"))
    return abstract, bullets


def _extract_message_content(payload: dict[str, Any]) -> str:
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        raise ValueError("OpenAI 兼容接口返回缺少 choices。")

    message = choices[0].get("message") if isinstance(choices[0], dict) else None
    if not isinstance(message, dict):
        raise ValueError("OpenAI 兼容接口返回缺少 message。")

    content = message.get("content", "")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        fragments: list[str] = []
        for item in content:
            if isinstance(item, dict):
                text_value = item.get("text") or item.get("content")
                if isinstance(text_value, str):
                    fragments.append(text_value)
        return "\n".join(fragment for fragment in fragments if fragment)
    if isinstance(content, dict):
        text_value = content.get("text")
        if isinstance(text_value, str):
            return text_value
    raise ValueError("OpenAI 兼容接口返回的 content 无法解析。")


def _parse_json_like_content(content: str) -> dict[str, Any]:
    normalized_content = content.strip()
    if normalized_content.startswith("```"):
        normalized_content = normalized_content.strip("`")
        normalized_content = normalized_content.replace("json\n", "", 1).strip()
    try:
        parsed_payload = json.loads(normalized_content)
        if isinstance(parsed_payload, dict):
            return parsed_payload
    except json.JSONDecodeError:
        pass

    first_brace = normalized_content.find("{")
    last_brace = normalized_content.rfind("}")
    if first_brace >= 0 and last_brace > first_brace:
        candidate_payload = normalized_content[first_brace : last_brace + 1]
        parsed_payload = json.loads(candidate_payload)
        if isinstance(parsed_payload, dict):
            return parsed_payload
    raise ValueError("无法从 OpenAI 兼容接口返回中解析 JSON。")


def _normalize_bullets(raw_bullets: Any) -> list[str]:
    if isinstance(raw_bullets, list):
        return [str(item).strip() for item in raw_bullets if str(item).strip()]
    if isinstance(raw_bullets, str):
        lines = [
            line.strip().lstrip("-").lstrip("•").strip()
            for line in raw_bullets.splitlines()
        ]
        return [line for line in lines if line]
    return []


def _coerce_float(raw_value: Any, default_value: float) -> float:
    if raw_value in (None, ""):
        return default_value
    return float(raw_value)


def _coerce_int(raw_value: Any, default_value: int) -> int:
    if raw_value in (None, ""):
        return default_value
    return int(raw_value)

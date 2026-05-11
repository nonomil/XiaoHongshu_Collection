from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from video_summary_cli.openai_compatible import OpenAICompatibleConfig
from video_summary_cli.settings import AppSettings
from video_summary_cli.web_batch import parse_batch_urls


@dataclass(slots=True)
class OpenAiCompatibleConfig(OpenAICompatibleConfig):
    """兼容旧命名的 OpenAI 配置模型。"""

    @classmethod
    def from_dict(cls, payload: dict | None) -> OpenAiCompatibleConfig:
        payload = payload or {}
        return cls(
            enabled=bool(payload.get("enabled")),
            base_url=str(payload.get("base_url") or "https://api.openai.com/v1"),
            api_key=str(payload.get("api_key") or ""),
            model=str(payload.get("model") or ""),
            temperature=float(payload["temperature"]) if payload.get("temperature") not in (None, "") else 0.2,
            max_input_characters=(
                int(payload["max_input_characters"])
                if payload.get("max_input_characters") not in (None, "")
                else 12000
            ),
            request_timeout_seconds=(
                float(payload["request_timeout_seconds"])
                if payload.get("request_timeout_seconds") not in (None, "")
                else 90.0
            ),
        )

    def to_dict(self, include_api_key: bool = True) -> dict:
        return {
            "enabled": self.enabled,
            "base_url": self.base_url,
            "api_key": self.api_key if include_api_key else "",
            "model": self.model,
            "temperature": self.temperature,
            "max_input_characters": self.max_input_characters,
            "request_timeout_seconds": self.request_timeout_seconds,
        }


@dataclass(slots=True)
class WebUiSettings:
    """Web UI 表单与持久化通用模型。"""

    output_dir: str = field(default_factory=lambda: str(AppSettings.default_output_dir() / "web-batches"))
    batch_name: str = ""
    cookies_path: str = ""
    transcriber: str = "auto"
    whisper_model: str = "tiny"
    screenshot_mode: str = "smart"
    screenshot_count: int = 8
    summary_style: str = "tutorial-note"
    remember_api_key: bool = True
    openai: OpenAiCompatibleConfig = field(default_factory=OpenAiCompatibleConfig)

    @classmethod
    def from_dict(cls, payload: dict[str, Any] | None) -> WebUiSettings:
        payload = payload or {}
        return cls(
            output_dir=str(payload.get("output_dir") or payload.get("output_root") or cls().output_dir),
            batch_name=str(payload.get("batch_name") or ""),
            cookies_path=str(payload.get("cookies_path") or ""),
            transcriber=str(payload.get("transcriber") or "auto"),
            whisper_model=str(payload.get("whisper_model") or "tiny"),
            screenshot_mode=str(payload.get("screenshot_mode") or "smart"),
            screenshot_count=max(1, int(payload.get("screenshot_count") or 8)),
            summary_style=str(payload.get("summary_style") or "tutorial-note"),
            remember_api_key=bool(payload.get("remember_api_key", True)),
            openai=OpenAiCompatibleConfig.from_dict(
                payload.get("openai") or payload.get("openai_compatible")
            ),
        )

    @property
    def output_root(self) -> str:
        return self.output_dir

    @property
    def openai_compatible(self) -> OpenAiCompatibleConfig:
        return self.openai

    def to_dict(self, include_api_key: bool = True) -> dict:
        return {
            "output_dir": self.output_dir,
            "output_root": self.output_dir,
            "batch_name": self.batch_name,
            "cookies_path": self.cookies_path,
            "transcriber": self.transcriber,
            "whisper_model": self.whisper_model,
            "screenshot_mode": self.screenshot_mode,
            "screenshot_count": self.screenshot_count,
            "summary_style": self.summary_style,
            "remember_api_key": self.remember_api_key,
            "openai": self.openai.to_dict(include_api_key=include_api_key),
        }


def parse_video_urls(urls_text: str) -> list[str]:
    """解析用户输入的多视频链接。"""

    return parse_batch_urls(urls_text)


@dataclass(slots=True)
class BatchRunRequest:
    """单次批处理请求。"""

    urls: list[str]
    settings: WebUiSettings


@dataclass(slots=True)
class BatchItemResult:
    """单条视频任务状态。"""

    url: str
    title: str = ""
    status: str = "queued"
    summary_markdown_path: str = ""
    artifacts_directory: str = ""
    error_message: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "url": self.url,
            "title": self.title,
            "status": self.status,
            "summary_markdown_path": self.summary_markdown_path,
            "artifacts_directory": self.artifacts_directory,
            "error_message": self.error_message,
        }


@dataclass(slots=True)
class BatchRunResult:
    """一次批处理的汇总结果。"""

    output_dir: str
    completed_count: int
    failed_count: int
    items: list[BatchItemResult]
    batch_manifest_path: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "output_dir": self.output_dir,
            "completed_count": self.completed_count,
            "failed_count": self.failed_count,
            "items": [item.to_dict() for item in self.items],
            "batch_manifest_path": self.batch_manifest_path,
        }


@dataclass(slots=True)
class BatchJobState:
    """Web 看板中的任务状态。"""

    job_id: str
    status: str
    output_dir: str
    created_at: str
    total_count: int
    completed_count: int = 0
    failed_count: int = 0
    started_at: str = ""
    finished_at: str = ""
    error_message: str = ""
    items: list[BatchItemResult] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "job_id": self.job_id,
            "status": self.status,
            "output_dir": self.output_dir,
            "created_at": self.created_at,
            "total_count": self.total_count,
            "completed_count": self.completed_count,
            "failed_count": self.failed_count,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "error_message": self.error_message,
            "items": [item.to_dict() for item in self.items],
        }

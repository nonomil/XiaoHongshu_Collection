from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

from video_summary_cli.settings import AppSettings
from video_summary_cli.web_models import OpenAiCompatibleConfig, WebUiSettings


def default_web_output_root() -> Path:
    """返回 Web 批处理的默认输出根目录。"""

    return AppSettings.default_output_dir() / "web-batches"


def default_web_config_path() -> Path:
    """返回 Web UI 默认配置文件路径。"""

    return Path.home() / ".video_summary_cli" / "web_ui_config.json"


@dataclass(slots=True)
class WebUiPreferences:
    """兼容旧批处理模块的配置结构。"""

    output_root: str = field(default_factory=lambda: str(default_web_output_root()))
    batch_name: str = ""
    cookies_path: str = ""
    transcriber: str = "auto"
    whisper_model: str = "tiny"
    screenshot_mode: str = "smart"
    screenshot_count: int = 8
    summary_style: str = "tutorial-note"
    remember_api_key: bool = True
    openai_compatible: OpenAiCompatibleConfig = field(default_factory=OpenAiCompatibleConfig)

    @classmethod
    def from_settings(cls, settings: WebUiSettings) -> WebUiPreferences:
        return cls(
            output_root=settings.output_dir,
            batch_name=settings.batch_name,
            cookies_path=settings.cookies_path,
            transcriber=settings.transcriber,
            whisper_model=settings.whisper_model,
            screenshot_mode=settings.screenshot_mode,
            screenshot_count=settings.screenshot_count,
            summary_style=settings.summary_style,
            remember_api_key=settings.remember_api_key,
            openai_compatible=settings.openai,
        )

    def to_settings(self) -> WebUiSettings:
        return WebUiSettings(
            output_dir=self.output_root,
            batch_name=self.batch_name,
            cookies_path=self.cookies_path,
            transcriber=self.transcriber,
            whisper_model=self.whisper_model,
            screenshot_mode=self.screenshot_mode,
            screenshot_count=self.screenshot_count,
            summary_style=self.summary_style,
            remember_api_key=self.remember_api_key,
            openai=self.openai_compatible,
        )


class WebUiConfigStore:
    """本地 Web UI 的 JSON 配置存储。"""

    def __init__(self, config_path: Path | None = None) -> None:
        self.config_path = Path(config_path) if config_path else default_web_config_path()

    def load(self) -> WebUiSettings:
        if not self.config_path.exists():
            return WebUiSettings(output_dir=str(default_web_output_root()))

        payload = json.loads(self.config_path.read_text(encoding="utf-8"))
        openai_payload = payload.get("openai") or payload.get("openai_compatible") or {}
        output_dir = payload.get("output_dir") or payload.get("output_root") or str(default_web_output_root())
        return WebUiSettings(
            output_dir=str(output_dir),
            batch_name=str(payload.get("batch_name") or ""),
            cookies_path=str(payload.get("cookies_path") or ""),
            transcriber=str(payload.get("transcriber") or "auto"),
            whisper_model=str(payload.get("whisper_model") or "tiny"),
            screenshot_mode=str(payload.get("screenshot_mode") or "smart"),
            screenshot_count=max(1, int(payload.get("screenshot_count", 8))),
            summary_style=str(payload.get("summary_style") or "tutorial-note"),
            remember_api_key=bool(payload.get("remember_api_key", True)),
            openai=OpenAiCompatibleConfig.from_dict(openai_payload),
        )

    def save(self, settings: WebUiSettings) -> WebUiSettings:
        self.config_path.parent.mkdir(parents=True, exist_ok=True)
        include_api_key = settings.remember_api_key
        self.config_path.write_text(
            json.dumps(settings.to_dict(include_api_key=include_api_key), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        return settings


def load_web_ui_preferences(config_path: Path | None = None) -> WebUiPreferences:
    """读取兼容旧前端结构的配置。"""

    return WebUiPreferences.from_settings(WebUiConfigStore(config_path).load())


def save_web_ui_preferences(
    preferences: WebUiPreferences,
    config_path: Path | None = None,
) -> Path:
    """保存兼容旧前端结构的配置。"""

    WebUiConfigStore(config_path).save(preferences.to_settings())
    return Path(config_path) if config_path else default_web_config_path()


OpenAiCompatibleConfig = OpenAiCompatibleConfig
WebUiConfig = WebUiPreferences

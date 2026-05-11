from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


@dataclass(slots=True)
class AppSettings:
    """应用级默认配置。"""

    preferred_subtitle_languages: list[str] = field(
        default_factory=lambda: ["zh-CN", "zh-Hans", "zh", "ai-zh", "en", "ai-en"]
    )
    preferred_subtitle_extensions: list[str] = field(
        default_factory=lambda: ["json3", "json", "vtt", "srt"]
    )

    @staticmethod
    def default_output_dir() -> Path:
        """返回默认输出目录。"""

        return Path(__file__).resolve().parents[3] / "docs" / "output"

from __future__ import annotations

import re
from pathlib import Path


INVALID_FILENAME_CHARACTER_MAP = str.maketrans(
    {
        "<": "＜",
        ">": "＞",
        ":": "：",
        '"': "＂",
        "/": "／",
        "\\": "＼",
        "|": "｜",
        "?": "？",
        "*": "＊",
    }
)


def slugify_text(text: str) -> str:
    """生成适合作为目录名的 slug。"""

    normalized = re.sub(r"[^\w\-]+", "-", text.strip(), flags=re.UNICODE)
    normalized = re.sub(r"-{2,}", "-", normalized).strip("-_")
    return normalized or "video-summary"


def build_output_directory(output_root: Path, title: str, video_id: str) -> Path:
    """根据标题和视频 ID 生成单视频输出目录。"""

    return output_root / f"{slugify_text(title)}-{video_id}"


def build_document_basename(title: str) -> str:
    """生成尽量贴近原标题的安全文件名。"""

    normalized_title = re.sub(r"\s+", " ", title.strip()).translate(INVALID_FILENAME_CHARACTER_MAP)
    normalized_title = re.sub(r"[\x00-\x1f]", "", normalized_title).rstrip(" .")
    return normalized_title or "视频总结"


def build_summary_markdown_filename(title: str) -> str:
    """生成与视频标题同名的 Markdown 文件名。"""

    return f"{build_document_basename(title)}.md"


def build_document_assets_directory(title: str) -> Path:
    """生成与文档同名的资源目录。"""

    return Path("img") / f"{build_document_basename(title)}.assets"


def relative_to_output(output_directory: Path, target_path: Path) -> str:
    """把文件路径转换为相对输出目录的 POSIX 路径。"""

    return target_path.relative_to(output_directory).as_posix()

from pathlib import Path

from video_summary_cli.paths import (
    build_document_assets_directory,
    build_summary_markdown_filename,
)


def test_build_summary_markdown_filename_prefers_human_readable_video_title() -> None:
    assert build_summary_markdown_filename("你好，世界：AI/教程？") == "你好，世界：AI／教程？.md"


def test_build_document_assets_directory_nests_assets_under_img_directory() -> None:
    assets_directory = build_document_assets_directory("你好，世界：AI/教程？")

    assert assets_directory == Path("img") / "你好，世界：AI／教程？.assets"

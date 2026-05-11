from pathlib import Path

from video_summary_cli.batch_workspace import parse_batch_urls, publish_batch_artifacts
from video_summary_cli.paths import build_document_assets_directory, build_summary_markdown_filename


def test_parse_batch_urls_preserves_order_and_removes_duplicates() -> None:
    urls_text = """
    https://b23.tv/1SzaT3c
    https://www.youtube.com/watch?v=demo123
    https://b23.tv/1SzaT3c
    not-a-url
    """

    urls = parse_batch_urls(urls_text)

    assert urls == [
        "https://b23.tv/1SzaT3c",
        "https://www.youtube.com/watch?v=demo123",
    ]


def test_publish_batch_artifacts_flattens_markdown_and_keeps_assets_in_img_subfolders(
    tmp_path: Path,
) -> None:
    title = "示例教程视频"
    source_output_dir = tmp_path / "artifacts" / "sample-video"
    source_output_dir.mkdir(parents=True, exist_ok=True)
    summary_path = source_output_dir / build_summary_markdown_filename(title)
    summary_path.write_text("# 示例教程视频", encoding="utf-8")

    source_assets_dir = source_output_dir / build_document_assets_directory(title)
    source_assets_dir.mkdir(parents=True, exist_ok=True)
    (source_assets_dir / "frame-001.jpg").write_bytes(b"fake-jpeg")

    batch_directory = tmp_path / "web-batch"
    published = publish_batch_artifacts(source_output_dir, batch_directory, title=title)

    assert published.summary_path == batch_directory / build_summary_markdown_filename(title)
    assert published.summary_path.exists()
    assert published.assets_directory == batch_directory / build_document_assets_directory(title)
    assert published.assets_directory.exists()
    assert (published.assets_directory / "frame-001.jpg").exists()


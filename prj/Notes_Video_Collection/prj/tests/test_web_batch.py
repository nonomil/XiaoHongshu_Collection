import json
from pathlib import Path


def test_parse_batch_urls_deduplicates_and_preserves_order() -> None:
    from video_summary_cli.web_batch import parse_batch_urls

    urls = parse_batch_urls(
        """
        https://b23.tv/demo-a
        https://youtu.be/demo-b
        https://b23.tv/demo-a
        """
    )

    assert urls == ["https://b23.tv/demo-a", "https://youtu.be/demo-b"]


def test_parse_batch_urls_extracts_links_from_freeform_text() -> None:
    from video_summary_cli.web_batch import parse_batch_urls

    urls = parse_batch_urls(
        """
        第一条先看 https://b23.tv/demo-a ，然后再看
        https://www.youtube.com/watch?v=demo-b ，最后重复一次 https://b23.tv/demo-a
        """
    )

    assert urls == [
        "https://b23.tv/demo-a",
        "https://www.youtube.com/watch?v=demo-b",
    ]


def test_web_batch_runner_exports_markdown_into_shared_folder_and_keeps_assets_split(tmp_path: Path) -> None:
    from video_summary_cli.paths import (
        build_document_assets_directory,
        build_output_directory,
        build_summary_markdown_filename,
    )
    from video_summary_cli.web_batch import BatchRequest, WebBatchRunner

    title_map = {
        "https://b23.tv/demo-a": ("重复标题", "video-001"),
        "https://b23.tv/demo-b": ("重复标题", "video-002"),
    }

    def fake_single_run_callable(*, url, output_root, **kwargs):
        title, video_id = title_map[url]
        output_dir = build_output_directory(output_root, title, video_id)
        output_dir.mkdir(parents=True, exist_ok=True)
        summary_filename = build_summary_markdown_filename(title)
        assets_dir = build_document_assets_directory(title)
        (output_dir / assets_dir).mkdir(parents=True, exist_ok=True)
        (output_dir / assets_dir / "frame-001.jpg").write_bytes(b"fake-image")
        (output_dir / summary_filename).write_text(
            "\n".join(
                [
                    f"# {title}",
                    "",
                    f"![示例图]({(assets_dir / 'frame-001.jpg').as_posix()})",
                ]
            )
            + "\n",
            encoding="utf-8",
        )
        (output_dir / "metadata.json").write_text(
            json.dumps({"title": title, "video_id": video_id}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        (output_dir / "transcript.txt").write_text("测试转写", encoding="utf-8")
        (output_dir / "versions").mkdir(exist_ok=True)
        return output_dir

    runner = WebBatchRunner(single_run_callable=fake_single_run_callable)
    result = runner.run_batch(
        BatchRequest(
            urls=["https://b23.tv/demo-a", "https://b23.tv/demo-b"],
            output_root=tmp_path,
            batch_name="前端批量导出",
        )
    )

    first_summary = result.items[0].summary_path
    second_summary = result.items[1].summary_path

    assert first_summary.exists()
    assert second_summary.exists()
    assert first_summary.parent == second_summary.parent == result.batch_directory
    assert first_summary.name == "重复标题.md"
    assert second_summary.name == "重复标题 - video-002.md"
    assert (result.batch_directory / "img" / "重复标题.assets" / "frame-001.jpg").exists()
    assert (result.batch_directory / "img" / "重复标题 - video-002.assets" / "frame-001.jpg").exists()
    assert "img/重复标题.assets/frame-001.jpg" in first_summary.read_text(encoding="utf-8")
    assert "img/重复标题 - video-002.assets/frame-001.jpg" in second_summary.read_text(encoding="utf-8")
    assert (result.batch_directory / "batch_manifest.json").exists()
    assert (result.batch_directory / ".runs").is_dir()


def test_export_record_directory_to_batch_keeps_safe_markdown_links_when_assets_dir_is_renamed(
    tmp_path: Path,
) -> None:
    from video_summary_cli.paths import (
        build_document_assets_directory,
        build_document_basename,
        build_output_directory,
        build_summary_markdown_filename,
    )
    from video_summary_cli.web_batch import export_record_directory_to_batch

    title = "Codex App 支持子代理（Subagents)"
    video_id = "video-002"
    records_root = tmp_path / "records"
    batch_directory = tmp_path / "batch"
    batch_directory.mkdir()
    (batch_directory / "img").mkdir()

    record_directory = build_output_directory(records_root, title, video_id)
    record_directory.mkdir(parents=True, exist_ok=True)
    assets_directory = build_document_assets_directory(title)
    (record_directory / assets_directory).mkdir(parents=True, exist_ok=True)
    (record_directory / assets_directory / "frame-001.jpg").write_bytes(b"fake-image")
    (record_directory / build_summary_markdown_filename(title)).write_text(
        "\n".join(
            [
                f"# {title}",
                "",
                f"![示例图](<{(assets_directory / 'frame-001.jpg').as_posix()}>)",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    (record_directory / "metadata.json").write_text(
        json.dumps({"title": title, "video_id": video_id}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    (record_directory / "transcript.txt").write_text("测试转写", encoding="utf-8")
    (record_directory / "versions").mkdir(exist_ok=True)
    (batch_directory / f"{build_document_basename(title)}.md").write_text("# 占位", encoding="utf-8")

    item_result = export_record_directory_to_batch(
        record_directory=record_directory,
        batch_directory=batch_directory,
        source_url="https://b23.tv/demo-subagents",
        summary_source="extractive",
    )

    exported_markdown = item_result.summary_path.read_text(encoding="utf-8")
    expected_base_name = f"{build_document_basename(title)} - {video_id}"

    assert f"![示例图](<img/{expected_base_name}.assets/frame-001.jpg>)" in exported_markdown
    assert item_result.assets_directory == batch_directory / "img" / f"{expected_base_name}.assets"

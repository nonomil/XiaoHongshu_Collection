import importlib.util
import json
import sys
from pathlib import Path


def load_module(module_name: str, relative_path: str):
    repo_root = Path(__file__).resolve().parents[2]
    module_path = repo_root / relative_path
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def write_utf8_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def build_repo_release_fixture(repo_root: Path) -> Path:
    release_dir_name = "video_summary_doc_vtest"
    release_root = repo_root / "release" / release_dir_name
    latest_version_dir = release_root / "sample_output" / "demo" / "versions" / "20260326-010203"

    write_utf8_text(
        repo_root / "release" / "LATEST_RELEASE.txt",
        "version_id=vtest\npackage_version=0.3.0\nrelease_dir=video_summary_doc_vtest\n",
    )
    write_utf8_text(
        repo_root / "release" / "README.md",
        "当前推荐复制的稳定版本：\n- `video_summary_doc_vtest`\n",
    )
    write_utf8_text(
        repo_root / ".codex" / "README.md",
        "Stable Release 说明：`docs/release/2026-03-23-stable-release.md`\n当前推荐 release 指针：`release/LATEST_RELEASE.txt`\n",
    )
    write_utf8_text(
        repo_root / "docs" / "release" / "2026-03-23-stable-release.md",
        "当前稳定版：`vtest`\nrelease 目录：`release/video_summary_doc_vtest/`\n",
    )
    (repo_root / "docs" / "plans").mkdir(parents=True, exist_ok=True)
    (repo_root / "docs" / "research").mkdir(parents=True, exist_ok=True)
    (repo_root / "docs" / "datasets").mkdir(parents=True, exist_ok=True)

    required_files = {
        "VERSION": "vtest\n",
        "README.md": "# release\n",
        "RELEASE_MANIFEST.json": json.dumps(
            {
                "version_id": "vtest",
                "package_version": "0.3.0",
                "release_root": release_root.as_posix(),
                "release_dir": release_dir_name,
                "copied_paths": sorted(
                    [
                        "README.md",
                        "RELEASE_MANIFEST.json",
                        "VERSION",
                        "requirements-lock.txt",
                        "start_web_ui.bat",
                        "start_web_ui_7861.bat",
                        "start_web_ui_debug.bat",
                        "scripts/setup_windows.ps1",
                        "scripts/setup_windows.bat",
                        "scripts/run_bilibili_sample.ps1",
                        "scripts/run_bilibili_sample.bat",
                        "project/tools/package_release.py",
                        "project/tools/verify_release.py",
                        "sample_output/demo/demo.md",
                        "sample_output/demo/metadata.json",
                        "sample_output/demo/transcript.txt",
                        "sample_output/demo/img",
                        "sample_output/demo/versions/manifest.json",
                        "sample_output/demo/versions/20260326-010203/metadata.json",
                        "sample_output/demo/versions/20260326-010203/transcript.txt",
                        "sample_output/demo/versions/20260326-010203/summary.md",
                        "sample_output/demo/versions/20260326-010203/chapters.json",
                        "sample_output/demo/versions/20260326-010203/screenshot_caption_blocks.json",
                    ]
                ),
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        "requirements-lock.txt": "pytest==9.0.0\n",
        "start_web_ui.bat": "@echo off\n",
        "start_web_ui_7861.bat": "@echo off\n",
        "start_web_ui_debug.bat": "@echo off\n",
        "scripts/setup_windows.ps1": "Write-Host 'setup'\n",
        "scripts/setup_windows.bat": "@echo off\n",
        "scripts/run_bilibili_sample.ps1": "Write-Host 'sample'\n",
        "scripts/run_bilibili_sample.bat": "@echo off\n",
        "project/tools/package_release.py": "print('package')\n",
        "project/tools/verify_release.py": "print('ok')\n",
        "sample_output/demo/demo.md": "# demo\n",
        "sample_output/demo/metadata.json": "{}\n",
        "sample_output/demo/transcript.txt": "demo transcript\n",
        "sample_output/demo/versions/manifest.json": "{}\n",
        "sample_output/demo/versions/20260326-010203/metadata.json": "{}\n",
        "sample_output/demo/versions/20260326-010203/transcript.txt": "version transcript\n",
        "sample_output/demo/versions/20260326-010203/summary.md": "# summary\n",
        "sample_output/demo/versions/20260326-010203/chapters.json": "[]\n",
        "sample_output/demo/versions/20260326-010203/screenshot_caption_blocks.json": "[]\n",
    }
    for relative_path, content in required_files.items():
        write_utf8_text(release_root / relative_path, content)
    (release_root / "sample_output" / "demo" / "img").mkdir(parents=True, exist_ok=True)
    latest_version_dir.mkdir(parents=True, exist_ok=True)

    return release_root


def test_verify_release_accepts_complete_repository_layout(tmp_path: Path) -> None:
    module = load_module("verify_release_complete", "tools/verify_release.py")

    repo_root = tmp_path / "repo"
    build_repo_release_fixture(repo_root)

    failures = module.collect_repository_release_failures(repo_root)

    assert failures == []


def test_verify_release_reports_missing_release_launcher(tmp_path: Path) -> None:
    module = load_module("verify_release_missing", "tools/verify_release.py")

    repo_root = tmp_path / "repo"
    release_root = build_repo_release_fixture(repo_root)
    (release_root / "start_web_ui_7861.bat").unlink()

    failures = module.collect_release_directory_failures(release_root)

    assert any("start_web_ui_7861.bat" in item for item in failures)


def test_detect_legacy_reference_roots_skips_missing_optional_program_dir(tmp_path: Path) -> None:
    module = load_module("validate_doc_call_graph_roots", ".codex/scripts/validate_doc_call_graph.py")

    repo_root = tmp_path / "repo"
    (repo_root / ".claude" / "reference").mkdir(parents=True, exist_ok=True)

    roots = module.detect_legacy_reference_roots(repo_root)

    assert roots == [repo_root / ".claude" / "reference"]

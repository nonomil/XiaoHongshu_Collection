import importlib.util
import sys
import tomllib
from pathlib import Path


def load_package_release_module(module_name: str):
    repo_root = Path(__file__).resolve().parents[2]
    module_path = repo_root / "tools" / "package_release.py"
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_pyproject_includes_runtime_web_assets() -> None:
    pyproject_path = Path(__file__).resolve().parents[1] / "pyproject.toml"
    payload = tomllib.loads(pyproject_path.read_text(encoding="utf-8"))

    package_data = payload["tool"]["setuptools"]["package-data"]["video_summary_cli"]

    assert "web/templates/*.html" in package_data
    assert "web/static/*.css" in package_data
    assert "web/static/*.js" in package_data


def test_release_packager_uses_current_package_version() -> None:
    module = load_package_release_module("package_release")

    assert module.PACKAGE_VERSION == "0.3.0"


def test_release_setup_script_installs_web_dependencies() -> None:
    module = load_package_release_module("package_release_setup")

    setup_script = module.build_setup_script()

    assert "[dev,asr,media,web]" in setup_script


def test_release_root_web_launchers_point_to_release_layout() -> None:
    module = load_package_release_module("package_release_launchers")

    launcher_files = module.build_release_root_launchers()

    assert sorted(launcher_files) == [
        "start_web_ui.bat",
        "start_web_ui_7861.bat",
        "start_web_ui_debug.bat",
    ]

    default_launcher = launcher_files["start_web_ui.bat"]
    assert "set \"PROJECT_DIR=%ROOT_DIR%project\\prj\"" in default_launcher
    assert "set \"PYTHON_EXE=%PROJECT_DIR%\\.venv\\Scripts\\python.exe\"" in default_launcher
    assert "--port %WEB_PORT%" in default_launcher

    port_7861_launcher = launcher_files["start_web_ui_7861.bat"]
    assert "set \"WEB_PORT=7861\"" in port_7861_launcher

    debug_launcher = launcher_files["start_web_ui_debug.bat"]
    assert "-X dev -m video_summary_cli.cli web" in debug_launcher
    assert "该窗口会保留日志输出" in debug_launcher


def test_release_readme_prefers_root_web_launchers() -> None:
    module = load_package_release_module("package_release_readme")

    readme_text = module.build_release_readme("vtest")

    assert "start_web_ui.bat" in readme_text
    assert "start_web_ui_7861.bat" in readme_text
    assert "start_web_ui_debug.bat" in readme_text
    assert "双击 release 根目录下的 `start_web_ui.bat`" in readme_text
    assert "project\\tools\\verify_release.py" in readme_text


def test_release_readme_prefers_root_web_ui_bat_launchers() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    module_path = repo_root / "tools" / "package_release.py"
    spec = importlib.util.spec_from_file_location("package_release_readme", module_path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)

    readme = module.build_release_readme("v-test")

    assert "start_web_ui.bat" in readme
    assert "start_web_ui_7861.bat" in readme
    assert "start_web_ui_debug.bat" in readme
    assert "video-summary web --host 127.0.0.1 --port 7860" not in readme


def test_release_root_web_ui_bat_targets_release_project_venv() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    module_path = repo_root / "tools" / "package_release.py"
    spec = importlib.util.spec_from_file_location("package_release_web_ui", module_path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)

    default_bat = module.build_release_web_ui_bat()
    backup_bat = module.build_release_web_ui_bat(port=7861)
    debug_bat = module.build_release_web_ui_bat(debug=True)

    assert 'set "PROJECT_DIR=%ROOT_DIR%project\\prj"' in default_bat
    assert 'set "PYTHON_EXE=%PROJECT_DIR%\\.venv\\Scripts\\python.exe"' in default_bat
    assert 'set "WEB_PORT=7860"' in default_bat
    assert "video_summary_cli.cli web --host %WEB_HOST% --port %WEB_PORT%" in default_bat

    assert 'set "WEB_PORT=7861"' in backup_bat

    assert "调试模式启动本地 Web 工作台" in debug_bat
    assert '-X dev -m video_summary_cli.cli web --host %WEB_HOST% --port %WEB_PORT%' in debug_bat


def test_copy_latest_sample_output_accepts_named_markdown_root(tmp_path: Path) -> None:
    module = load_package_release_module("package_release_sample_copy")

    repo_root = tmp_path / "repo"
    sample_root = repo_root / "docs" / "output"
    sample_folder = sample_root / "示例视频-BV1kfkkBwEHZ_p1"
    latest_version_dir = sample_folder / "versions" / "20260326-010203"
    image_dir = sample_folder / "img" / "示例视频.assets"

    latest_version_dir.mkdir(parents=True, exist_ok=True)
    image_dir.mkdir(parents=True, exist_ok=True)

    (sample_folder / "metadata.json").write_text("{}", encoding="utf-8")
    (sample_folder / "transcript.txt").write_text("root transcript", encoding="utf-8")
    (sample_folder / "示例视频-BV1kfkkBwEHZ_p1.md").write_text("# 示例视频", encoding="utf-8")
    (image_dir / "frame-001.png").write_text("png", encoding="utf-8")
    (sample_folder / "versions" / "manifest.json").write_text("{}", encoding="utf-8")

    (latest_version_dir / "metadata.json").write_text("{}", encoding="utf-8")
    (latest_version_dir / "transcript.txt").write_text("version transcript", encoding="utf-8")
    (latest_version_dir / "summary.md").write_text("# summary", encoding="utf-8")
    (latest_version_dir / "chapters.json").write_text("[]", encoding="utf-8")
    (latest_version_dir / "screenshot_caption_blocks.json").write_text("[]", encoding="utf-8")

    release_sample_root = tmp_path / "sample_output"
    copied_paths = module.copy_latest_sample_output(repo_root=repo_root, sample_root=release_sample_root)

    assert (
        release_sample_root / "示例视频-BV1kfkkBwEHZ_p1" / "示例视频-BV1kfkkBwEHZ_p1.md"
    ).exists()
    assert "sample_output/示例视频-BV1kfkkBwEHZ_p1/示例视频-BV1kfkkBwEHZ_p1.md" in copied_paths


def test_release_packager_copies_release_verifier_tool() -> None:
    module = load_package_release_module("package_release_copy_rules")

    repo_root = Path(__file__).resolve().parents[2]
    release_root = repo_root / "tmp" / "release_test"
    copy_rules = module.build_copy_rules(
        repo_root=repo_root,
        project_root=release_root / "project",
        docs_root=release_root / "docs",
    )

    normalized_rules = {
        (
            rule.source.relative_to(repo_root).as_posix(),
            rule.target.relative_to(release_root).as_posix(),
        )
        for rule in copy_rules
    }

    assert (
        "tools/verify_release.py",
        "project/tools/verify_release.py",
    ) in normalized_rules

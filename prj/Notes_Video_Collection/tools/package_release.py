from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path


sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")


def load_package_version(repo_root: Path) -> str:
    """从源码读取当前包版本，避免 release 脚本手工漂移。"""

    init_path = repo_root / "prj" / "src" / "video_summary_cli" / "__init__.py"
    init_text = init_path.read_text(encoding="utf-8")
    matched = re.search(r'__version__\s*=\s*"([^"]+)"', init_text)
    if matched is None:
        raise RuntimeError(f"无法从 {init_path} 解析包版本。")
    return matched.group(1)


PACKAGE_VERSION = load_package_version(Path(__file__).resolve().parents[1])


@dataclass(slots=True)
class CopyRule:
    source: Path
    target: Path


def main() -> int:
    parser = argparse.ArgumentParser(description="生成可拷贝的稳定 release 目录。")
    parser.add_argument(
        "--version-id",
        default=f"v{datetime.now().strftime('%Y.%m.%d')}-stable",
        help="release 版本号，例如 v2026.03.22-stable",
    )
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parents[1]
    release_root = repo_root / "release" / sanitize_release_name(args.version_id)
    if release_root.exists():
        timestamp_suffix = datetime.now().strftime("%H%M%S")
        release_root = release_root.with_name(f"{release_root.name}_{timestamp_suffix}")

    project_root = release_root / "project"
    docs_root = release_root / "docs"
    scripts_root = release_root / "scripts"
    sample_root = release_root / "sample_output"

    for path in (project_root, docs_root, scripts_root, sample_root):
        path.mkdir(parents=True, exist_ok=True)

    copy_rules = build_copy_rules(repo_root, project_root, docs_root)
    copied_paths: list[str] = []
    for rule in copy_rules:
        if not rule.source.exists():
            continue
        copy_path(rule.source, rule.target)
        copied_paths.append(rule.target.relative_to(release_root).as_posix())

    requirements_path = release_root / "requirements-lock.txt"
    export_requirements(repo_root=repo_root, output_path=requirements_path)
    copied_paths.append(requirements_path.relative_to(release_root).as_posix())

    sample_paths = copy_latest_sample_output(
        repo_root=repo_root,
        sample_root=sample_root,
    )
    copied_paths.extend(sample_paths)

    generated_files: dict[Path, str] = {
        release_root / "VERSION": args.version_id + "\n",
        release_root / "README.md": build_release_readme(args.version_id),
        release_root / "scripts" / "setup_windows.ps1": build_setup_script(),
        release_root / "scripts" / "run_bilibili_sample.ps1": build_run_script(),
        release_root / "scripts" / "setup_windows.bat": build_setup_bat(),
        release_root / "scripts" / "run_bilibili_sample.bat": build_run_bat(),
    }
    for filename, content in build_release_root_launchers().items():
        generated_files[release_root / filename] = content

    for path, content in generated_files.items():
        write_text_file(path, content)
        copied_paths.append(path.relative_to(release_root).as_posix())

    manifest_path = release_root / "RELEASE_MANIFEST.json"
    manifest = {
        "version_id": args.version_id,
        "package_version": PACKAGE_VERSION,
        "generated_at": datetime.now().astimezone().isoformat(),
        "release_root": release_root.as_posix(),
        "release_dir": release_root.name,
        "copied_paths": sorted(copied_paths + [manifest_path.relative_to(release_root).as_posix()]),
    }
    write_text_file(
        manifest_path,
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
    )
    write_text_file(
        repo_root / "release" / "LATEST_RELEASE.txt",
        (
            f"version_id={args.version_id}\n"
            f"package_version={PACKAGE_VERSION}\n"
            f"release_dir={release_root.name}\n"
        ),
    )

    print(release_root.as_posix())
    return 0


def sanitize_release_name(version_id: str) -> str:
    safe_name = version_id.strip().replace(" ", "_").replace("/", "_").replace("\\", "_")
    return f"video_summary_doc_{safe_name}"


def build_copy_rules(repo_root: Path, project_root: Path, docs_root: Path) -> list[CopyRule]:
    rules: list[CopyRule] = []

    for filename in ("README.md", "CODEX.md", "AGENTS.md", "CHANGELOG.md", ".gitignore"):
        rules.append(
            CopyRule(
                source=repo_root / filename,
                target=project_root / filename,
            )
        )

    rules.extend(
        [
            CopyRule(repo_root / ".codex", project_root / ".codex"),
            CopyRule(repo_root / "prj" / "src", project_root / "prj" / "src"),
            CopyRule(repo_root / "prj" / "tests", project_root / "prj" / "tests"),
            CopyRule(repo_root / "prj" / "pyproject.toml", project_root / "prj" / "pyproject.toml"),
            CopyRule(repo_root / "prj" / "pytest.ini", project_root / "prj" / "pytest.ini"),
            CopyRule(repo_root / "prj" / "README.md", project_root / "prj" / "README.md"),
            CopyRule(repo_root / "tools" / "package_release.py", project_root / "tools" / "package_release.py"),
            CopyRule(repo_root / "tools" / "verify_release.py", project_root / "tools" / "verify_release.py"),
            CopyRule(
                repo_root / "docs" / "release" / "2026-03-23-stable-release.md",
                docs_root / "stable-release.md",
            ),
            CopyRule(repo_root / "docs" / "plans" / "INDEX.md", docs_root / "plans" / "INDEX.md"),
            CopyRule(
                repo_root / "docs" / "plans" / "2026-03-22-visual-caption-binding-master-checklist.md",
                docs_root / "plans" / "2026-03-22-visual-caption-binding-master-checklist.md",
            ),
            CopyRule(
                repo_root / "docs" / "plans" / "2026-03-22-visual-caption-binding-quality-checklist.md",
                docs_root / "plans" / "2026-03-22-visual-caption-binding-quality-checklist.md",
            ),
            CopyRule(
                repo_root / "docs" / "plans" / "2026-03-22-visual-caption-binding-skill-maintenance.md",
                docs_root / "plans" / "2026-03-22-visual-caption-binding-skill-maintenance.md",
            ),
            CopyRule(
                repo_root / "docs" / "plans" / "2026-03-22-project-workflow-skills-optimization.md",
                docs_root / "plans" / "2026-03-22-project-workflow-skills-optimization.md",
            ),
            CopyRule(
                repo_root / "docs" / "research" / "2026-03-21-bilibili-youtube-video-to-markdown-methods.md",
                docs_root / "research" / "2026-03-21-bilibili-youtube-video-to-markdown-methods.md",
            ),
            CopyRule(
                repo_root / "docs" / "datasets" / "2026-03-21-sample-video-dataset.md",
                docs_root / "datasets" / "2026-03-21-sample-video-dataset.md",
            ),
        ]
    )
    return rules


def copy_latest_sample_output(repo_root: Path, sample_root: Path) -> list[str]:
    output_root = repo_root / "docs" / "output"
    sample_folder = next(
        path
        for path in output_root.iterdir()
        if path.is_dir() and (path / "versions").exists() and path.name.endswith("BV1kfkkBwEHZ_p1")
    )
    release_sample_root = sample_root / sample_folder.name
    release_sample_root.mkdir(parents=True, exist_ok=True)

    latest_version_dir = max(
        [path for path in (sample_folder / "versions").iterdir() if path.is_dir()],
        key=lambda item: item.name,
    )

    copied_paths: list[str] = []
    root_markdown_files = sorted(
        path for path in sample_folder.glob("*.md") if path.is_file() and path.name != "summary.md"
    )
    for source_path in [sample_folder / "metadata.json", sample_folder / "transcript.txt", *root_markdown_files]:
        if not source_path.exists():
            continue
        target_path = release_sample_root / source_path.name
        copy_path(source_path, target_path)
        copied_paths.append(target_path.relative_to(sample_root.parent).as_posix())

    for filename in ("summary.md",):
        source_path = sample_folder / filename
        if source_path.exists():
            target_path = release_sample_root / filename
            copy_path(source_path, target_path)
            copied_paths.append(target_path.relative_to(sample_root.parent).as_posix())

    target_version_root = release_sample_root / "versions" / latest_version_dir.name
    for filename in ("metadata.json", "transcript.txt", "summary.md", "chapters.json", "screenshot_caption_blocks.json"):
        source_path = latest_version_dir / filename
        if source_path.exists():
            target_path = target_version_root / filename
            copy_path(source_path, target_path)
            copied_paths.append(target_path.relative_to(sample_root.parent).as_posix())

    source_manifest = sample_folder / "versions" / "manifest.json"
    if source_manifest.exists():
        target_manifest = release_sample_root / "versions" / "manifest.json"
        copy_path(source_manifest, target_manifest)
        copied_paths.append(target_manifest.relative_to(sample_root.parent).as_posix())

    for image_source_root in (sample_folder / "img", latest_version_dir / "img"):
        if not image_source_root.exists():
            continue
        target_image_root = (
            release_sample_root / image_source_root.relative_to(sample_folder)
            if sample_folder in image_source_root.parents or image_source_root == sample_folder / "img"
            else target_version_root / image_source_root.relative_to(latest_version_dir)
        )
        copy_tree(
            source_root=image_source_root,
            target_root=target_image_root,
            ignore_suffixes={".mp4", ".m4a"},
        )
        copied_paths.append(target_image_root.relative_to(sample_root.parent).as_posix())

    return copied_paths


def export_requirements(repo_root: Path, output_path: Path) -> None:
    python_path = repo_root / "prj" / ".venv" / "Scripts" / "python.exe"
    completed = subprocess.run(
        [str(python_path), "-m", "pip", "freeze"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=True,
    )
    filtered_lines = [
        line
        for line in completed.stdout.splitlines()
        if line.strip()
        and not line.startswith("# Editable install")
        and not line.startswith("-e ")
        and "@ file:///" not in line
    ]
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text("\n".join(filtered_lines) + "\n", encoding="utf-8")


def copy_path(source_path: Path, target_path: Path) -> None:
    target_path.parent.mkdir(parents=True, exist_ok=True)
    if source_path.is_dir():
        copy_tree(source_path, target_path)
        return
    shutil.copy2(source_path, target_path)


def copy_tree(source_root: Path, target_root: Path, ignore_suffixes: set[str] | None = None) -> None:
    ignore_suffixes = ignore_suffixes or set()
    ignored_directory_names = {
        ".git",
        ".venv",
        ".pytest_cache",
        "__pycache__",
        ".mypy_cache",
        "build",
    }
    for source_path in source_root.rglob("*"):
        if source_path.is_dir():
            continue
        if any(
            part in ignored_directory_names or part.endswith(".egg-info")
            for part in source_path.parts
        ):
            continue
        if source_path.suffix.lower() in ignore_suffixes:
            continue
        relative_path = source_path.relative_to(source_root)
        target_path = target_root / relative_path
        target_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source_path, target_path)


def build_release_readme(version_id: str) -> str:
    return f"""# 视频总结文档 Stable Release

## 版本
- `{version_id}`
- 包版本：`{PACKAGE_VERSION}`

## 包含内容
- `project/`：可运行源码、测试、项目级 Codex 工作流文档、`.codex` 工作流与项目 skills
- `sample_output/`：已生成好的 B 站样本教程笔记，可直接查看 Markdown 和截图
- `requirements-lock.txt`：当前稳定环境导出的第三方依赖锁定约束
- `scripts/setup_windows.ps1`：Windows 初始化脚本
- `scripts/setup_windows.bat`：PowerShell 初始化脚本的批处理入口
- `scripts/run_bilibili_sample.ps1`：B 站样本运行示例
- `scripts/run_bilibili_sample.bat`：B 站样本运行示例的批处理入口
- `start_web_ui.bat`：默认端口 `7860` 的本地 Web 工作台启动入口
- `start_web_ui_7861.bat`：`7860` 被占用时的备用端口启动入口
- `start_web_ui_debug.bat`：保留日志窗口的调试启动入口
- `project/tools/verify_release.py`：对当前 release 做结构校验、样本校验和可选 Web 烟测
- `docs/`：当前稳定计划、发布说明、调研与数据集入口

## 目标机器前置条件
- Windows 10/11
- Python 3.11+
- 建议已安装 `ffmpeg`
- 如需抓取 B 站登录态字幕，请准备自己的 cookies 文件

## 快速开始
1. 复制整个 release 文件夹到目标电脑
2. 进入当前 release 根目录
3. 运行：
   `scripts\\setup_windows.bat`
4. 准备好 cookies 后运行：
   `scripts\\run_bilibili_sample.bat <你的 cookies 文件>`
 5. 如果要启动前端工作台，优先直接双击 release 根目录下的 `start_web_ui.bat`
 6. 如果 `7860` 端口被占用，改用：
    `start_web_ui_7861.bat`
 7. 如果需要保留启动日志排查问题，改用：
    `start_web_ui_debug.bat`
 8. 如果要验证当前 release 结构是否完整，运行：
    `project\\prj\\.venv\\Scripts\\python.exe project\\tools\\verify_release.py --release-dir .`

## 样本输出位置
- `sample_output/嵌入式方法论-你的学习方法-配得上这个时代吗-BV1kfkkBwEHZ_p1/嵌入式方法论-你的学习方法-配得上这个时代吗-BV1kfkkBwEHZ_p1.md`

## 说明
- release 中不包含个人 cookies
- release 中不打包历史大体积音视频缓存
- 如果只想复用本项目工作流，可以查看 `project/CODEX.md`、`project/AGENTS.md`、`project/.codex/` 和 `docs/plans/`
"""


def build_setup_script() -> str:
    return """$ErrorActionPreference = 'Stop'

$release_root = Split-Path -Parent $PSScriptRoot
$project_root = Join-Path $release_root 'project'
$prj_root = Join-Path $project_root 'prj'
$venv_root = Join-Path $prj_root '.venv'
$requirements_path = Join-Path $release_root 'requirements-lock.txt'

function New-ReleaseVenv {
  param(
    [string]$TargetVenv
  )

  if (Get-Command py -ErrorAction SilentlyContinue) {
    & py -3.11 -m venv $TargetVenv
    if ($LASTEXITCODE -eq 0) {
      return
    }

    & py -3 -m venv $TargetVenv
    if ($LASTEXITCODE -eq 0) {
      return
    }
  }

  if (Get-Command python -ErrorAction SilentlyContinue) {
    & python -m venv $TargetVenv
    if ($LASTEXITCODE -eq 0) {
      return
    }
  }

  throw 'Python 3.11+ was not found. Please install Python first.'
}

if (-not (Test-Path -LiteralPath $venv_root)) {
  New-ReleaseVenv -TargetVenv $venv_root
}

$python_exe = Join-Path $venv_root 'Scripts\\python.exe'
& $python_exe -m pip install --upgrade pip setuptools wheel

$install_target = "$prj_root[dev,asr,media,web]"
& $python_exe -m pip install -c $requirements_path $install_target

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  Write-Warning 'ffmpeg was not found. Install ffmpeg if audio extraction or ASR fails.'
}

Write-Host ''
Write-Host 'Setup complete.'
Write-Host "Next step: powershell -ExecutionPolicy Bypass -File $release_root\\scripts\\run_bilibili_sample.ps1 -CookiesPath <cookies.txt>"
"""


def build_run_script() -> str:
    return """param(
  [Parameter(Mandatory = $true)]
  [string]$CookiesPath,

  [string]$Url = 'https://b23.tv/1SzaT3c'
)

$ErrorActionPreference = 'Stop'

$release_root = Split-Path -Parent $PSScriptRoot
$project_root = Join-Path $release_root 'project'
$prj_root = Join-Path $project_root 'prj'
$python_exe = Join-Path $prj_root '.venv\\Scripts\\python.exe'
$output_dir = Join-Path $release_root 'output'

if (-not (Test-Path -LiteralPath $python_exe)) {
  throw 'Virtual environment was not found. Run scripts/setup_windows.ps1 first.'
}

$cookies_full_path = (Resolve-Path -LiteralPath $CookiesPath).Path
New-Item -ItemType Directory -Force -Path $output_dir | Out-Null

& $python_exe -m video_summary_cli.cli summarize `
  --url $Url `
  --output-dir $output_dir `
  --cookies $cookies_full_path `
  --transcriber auto `
  --whisper-model tiny `
  --screenshot-mode smart `
  --screenshot-count 3 `
  --summary-style tutorial-note
"""


def build_setup_bat() -> str:
    return """@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0setup_windows.ps1"
"""


def build_run_bat() -> str:
    return """@echo off
setlocal
if "%~1"=="" (
  echo Usage: run_bilibili_sample.bat ^<cookies.txt^>
  exit /b 1
)
powershell -ExecutionPolicy Bypass -File "%~dp0run_bilibili_sample.ps1" -CookiesPath "%~1"
"""


def build_release_root_launchers() -> dict[str, str]:
    return {
        "start_web_ui.bat": build_release_web_ui_bat(),
        "start_web_ui_7861.bat": build_release_web_ui_bat(port=7861),
        "start_web_ui_debug.bat": build_release_web_ui_bat(debug=True),
    }


def build_release_web_ui_bat(port: int = 7860, debug: bool = False) -> str:
    startup_title = "调试模式启动本地 Web 工作台..." if debug else "正在启动本地 Web 工作台..."
    status_lines = [
        'echo [信息] ' + startup_title,
        'echo [信息] 启动地址：http://%WEB_HOST%:%WEB_PORT%/',
    ]
    if debug:
        status_lines.insert(1, 'echo [信息] 当前目录：%PROJECT_DIR%')
        status_lines.insert(2, 'echo [信息] Python：%PYTHON_EXE%')
        status_lines.append('echo [信息] 该窗口会保留日志输出，便于排查问题。')
        command_line = '"%PYTHON_EXE%" -X dev -m video_summary_cli.cli web --host %WEB_HOST% --port %WEB_PORT%'
        exit_block = """echo.
echo [信息] Web 工作台已退出，退出码：%EXIT_CODE%
pause
exit /b %EXIT_CODE%"""
    else:
        status_lines.append('echo [信息] 如需停止服务，关闭当前窗口即可。')
        command_line = '"%PYTHON_EXE%" -m video_summary_cli.cli web --host %WEB_HOST% --port %WEB_PORT%'
        exit_block = """if not "%EXIT_CODE%"=="0" (
  echo.
  echo [错误] Web 工作台启动失败，退出码：%EXIT_CODE%
  pause
)

exit /b %EXIT_CODE%"""

    status_block = "\n".join(status_lines)
    python_prefix = 'set "PYTHONUNBUFFERED=1"\n' if debug else ""
    return f"""@echo off
setlocal
chcp 65001 >nul

set "ROOT_DIR=%~dp0"
set "PROJECT_DIR=%ROOT_DIR%project\\prj"
set "PYTHON_EXE=%PROJECT_DIR%\\.venv\\Scripts\\python.exe"
set "WEB_HOST=127.0.0.1"
set "WEB_PORT={port}"

if not exist "%PYTHON_EXE%" (
  echo [错误] 未找到虚拟环境：%PYTHON_EXE%
  echo [提示] 请先运行：
  echo   scripts\\setup_windows.bat
  pause
  exit /b 1
)

cd /d "%PROJECT_DIR%"
{status_block}
echo.

{python_prefix}{command_line}
set "EXIT_CODE=%ERRORLEVEL%"

{exit_block}
"""


def write_text_file(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())

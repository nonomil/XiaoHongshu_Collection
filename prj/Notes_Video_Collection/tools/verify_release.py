from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path


sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")


ROOT_REQUIRED_FILES = (
    "README.md",
    "VERSION",
    "RELEASE_MANIFEST.json",
    "requirements-lock.txt",
    "start_web_ui.bat",
    "start_web_ui_7861.bat",
    "start_web_ui_debug.bat",
    "scripts/setup_windows.ps1",
    "scripts/setup_windows.bat",
    "scripts/run_bilibili_sample.ps1",
    "scripts/run_bilibili_sample.bat",
)

PROJECT_REQUIRED_PATHS = (
    "project/prj/src",
    "project/prj/tests",
    "project/prj/pyproject.toml",
    "project/.codex",
    "project/tools/package_release.py",
    "project/tools/verify_release.py",
)

DOC_REQUIRED_PATHS = (
    "docs/plans",
    "docs/research",
    "docs/datasets",
)

STABLE_RELEASE_DOC = "docs/release/2026-03-23-stable-release.md"
CODEX_README_REQUIRED_REFERENCES = (
    "release/LATEST_RELEASE.txt",
    STABLE_RELEASE_DOC,
)

LEGACY_RELEASE_REQUIRED_FILES = (
    "README.md",
    "VERSION",
    "RELEASE_MANIFEST.json",
    "requirements-lock.txt",
    "start_web_ui.bat",
    "start_web_ui_7861.bat",
    "start_web_ui_debug.bat",
)


@dataclass(slots=True)
class ReleaseVerificationResult:
    release_root: Path
    version_id: str | None = None
    checked_items: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)

    @property
    def is_success(self) -> bool:
        return not self.errors

    def add_ok(self, message: str) -> None:
        self.checked_items.append(message)

    def add_warning(self, message: str) -> None:
        self.warnings.append(message)

    def add_error(self, message: str) -> None:
        self.errors.append(message)


def load_latest_release_metadata(repo_root: Path) -> dict[str, str]:
    latest_release_path = repo_root / "release" / "LATEST_RELEASE.txt"
    metadata: dict[str, str] = {}
    for line in latest_release_path.read_text(encoding="utf-8").splitlines():
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        metadata[key.strip()] = value.strip()
    return metadata


def collect_release_directory_failures(release_root: Path) -> list[str]:
    result = verify_release_directory(
        release_root=release_root,
        repo_root=None,
        check_repo_indexes=False,
        check_web_smoke=False,
    )
    return result.errors


def collect_repository_release_failures(repo_root: Path) -> list[str]:
    repo_root = repo_root.resolve()
    latest_release_metadata = load_latest_release_metadata(repo_root)
    release_dir = latest_release_metadata.get("release_dir", "").strip()
    if not release_dir:
        return ["release/LATEST_RELEASE.txt 缺少 release_dir"]
    release_root = repo_root / "release" / release_dir
    result = verify_release_directory(
        release_root=release_root,
        repo_root=repo_root,
        check_repo_indexes=True,
        check_web_smoke=False,
    )
    return result.errors


def detect_default_release_directory(script_path: Path) -> tuple[Path | None, Path | None]:
    release_candidate = script_path.resolve().parents[2]
    if (release_candidate / "RELEASE_MANIFEST.json").exists():
        return release_candidate, None

    repo_root = script_path.resolve().parents[1]
    latest_release_path = repo_root / "release" / "LATEST_RELEASE.txt"
    if latest_release_path.exists():
        metadata = load_latest_release_metadata(repo_root)
        release_dir = metadata.get("release_dir")
        if release_dir:
            return repo_root / "release" / release_dir, repo_root
    return None, None


def verify_release_directory(
    release_root: Path,
    repo_root: Path | None = None,
    check_repo_indexes: bool = True,
    check_web_smoke: bool = False,
) -> ReleaseVerificationResult:
    release_root = release_root.resolve()
    result = ReleaseVerificationResult(release_root=release_root)

    if not release_root.exists():
        result.add_error(f"release 目录不存在：{release_root}")
        return result
    if not release_root.is_dir():
        result.add_error(f"release 路径不是目录：{release_root}")
        return result
    result.add_ok(f"release 目录存在：{release_root}")

    for relative_path in [*ROOT_REQUIRED_FILES, *PROJECT_REQUIRED_PATHS, *DOC_REQUIRED_PATHS]:
        check_path = release_root / relative_path
        if check_path.exists():
            result.add_ok(f"存在：{relative_path}")
        else:
            result.add_error(f"缺少必要路径：{relative_path}")

    verify_launcher_contents(release_root=release_root, result=result)

    manifest_path = release_root / "RELEASE_MANIFEST.json"
    manifest_data: dict[str, object] | None = None
    if manifest_path.exists():
        try:
            manifest_data = json.loads(manifest_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            result.add_error(f"RELEASE_MANIFEST.json 解析失败：{exc}")
    else:
        result.add_error("缺少 RELEASE_MANIFEST.json")

    if manifest_data is not None:
        result.version_id = str(manifest_data.get("version_id") or "")
        verify_manifest(release_root=release_root, manifest_data=manifest_data, result=result)

    verify_sample_output(release_root=release_root, result=result)

    if repo_root is not None and check_repo_indexes:
        verify_repo_indexes(repo_root=repo_root.resolve(), release_root=release_root, result=result)

    if check_web_smoke:
        run_web_smoke_test(release_root=release_root, result=result)

    return result


def verify_launcher_contents(release_root: Path, result: ReleaseVerificationResult) -> None:
    expected_lines = {
        "start_web_ui.bat": ("project\\prj", "WEB_PORT=7860"),
        "start_web_ui_7861.bat": ("project\\prj", "WEB_PORT=7861"),
        "start_web_ui_debug.bat": ("project\\prj", "-X dev -m video_summary_cli.cli web"),
    }
    for filename, markers in expected_lines.items():
        launcher_path = release_root / filename
        if not launcher_path.exists():
            continue
        launcher_text = launcher_path.read_text(encoding="utf-8", errors="replace")
        for marker in markers:
            if marker in launcher_text:
                result.add_ok(f"{filename} 包含关键标记：{marker}")
            else:
                result.add_error(f"{filename} 缺少关键标记：{marker}")


def verify_manifest(release_root: Path, manifest_data: dict[str, object], result: ReleaseVerificationResult) -> None:
    manifest_release_dir = str(manifest_data.get("release_dir") or "")
    if manifest_release_dir == release_root.name:
        result.add_ok("manifest.release_dir 与实际目录名一致")
    else:
        result.add_error(
            f"manifest.release_dir 与实际目录名不一致：{manifest_release_dir} != {release_root.name}"
        )

    version_id = str(manifest_data.get("version_id") or "").strip()
    version_text = (release_root / "VERSION").read_text(encoding="utf-8").strip() if (release_root / "VERSION").exists() else ""
    if version_id and version_text == version_id:
        result.add_ok("VERSION 与 manifest.version_id 一致")
    else:
        result.add_error(f"VERSION 与 manifest.version_id 不一致：{version_text} != {version_id}")

    release_root_text = str(manifest_data.get("release_root") or "")
    if release_root_text.replace("\\", "/").rstrip("/") == release_root.as_posix().rstrip("/"):
        result.add_ok("manifest.release_root 与实际路径一致")
    else:
        result.add_warning("manifest.release_root 与实际路径字符串不完全一致，请人工确认是否可接受")

    copied_paths = manifest_data.get("copied_paths")
    if not isinstance(copied_paths, list):
        result.add_error("manifest.copied_paths 不是列表")
        return

    for copied_path in copied_paths:
        copied_path_text = str(copied_path)
        target_path = release_root / copied_path_text
        if target_path.exists():
            result.add_ok(f"manifest 路径存在：{copied_path_text}")
        else:
            result.add_error(f"manifest 路径缺失：{copied_path_text}")


def verify_sample_output(release_root: Path, result: ReleaseVerificationResult) -> None:
    sample_root = release_root / "sample_output"
    if not sample_root.exists():
        result.add_error("缺少 sample_output 目录")
        return

    sample_directories = [path for path in sample_root.iterdir() if path.is_dir()]
    if not sample_directories:
        result.add_error("sample_output 下没有样本目录")
        return

    result.add_ok(f"sample_output 样本目录数量：{len(sample_directories)}")
    for sample_dir in sample_directories:
        verify_single_sample_directory(sample_dir=sample_dir, result=result)


def verify_single_sample_directory(sample_dir: Path, result: ReleaseVerificationResult) -> None:
    for filename in ("metadata.json", "transcript.txt"):
        check_path = sample_dir / filename
        if check_path.exists():
            result.add_ok(f"{sample_dir.name} 存在：{filename}")
        else:
            result.add_error(f"{sample_dir.name} 缺少：{filename}")

    root_markdown_files = sorted(path for path in sample_dir.glob("*.md") if path.is_file())
    if root_markdown_files:
        result.add_ok(f"{sample_dir.name} 根目录 Markdown 数量：{len(root_markdown_files)}")
    else:
        result.add_error(f"{sample_dir.name} 根目录缺少 Markdown 文档")

    img_root = sample_dir / "img"
    if img_root.exists():
        result.add_ok(f"{sample_dir.name} 存在 img 目录")
    else:
        result.add_error(f"{sample_dir.name} 缺少 img 目录")

    version_manifest_path = sample_dir / "versions" / "manifest.json"
    if version_manifest_path.exists():
        result.add_ok(f"{sample_dir.name} 存在 versions/manifest.json")
    else:
        result.add_error(f"{sample_dir.name} 缺少 versions/manifest.json")

    version_dirs = sorted(path for path in (sample_dir / "versions").glob("*") if path.is_dir())
    if not version_dirs:
        result.add_error(f"{sample_dir.name} 没有版本快照目录")
        return

    latest_version_dir = version_dirs[-1]
    for filename in ("metadata.json", "transcript.txt", "summary.md", "chapters.json", "screenshot_caption_blocks.json"):
        check_path = latest_version_dir / filename
        if check_path.exists():
            result.add_ok(f"{sample_dir.name} 最新版本存在：{latest_version_dir.name}/{filename}")
        else:
            result.add_error(f"{sample_dir.name} 最新版本缺少：{latest_version_dir.name}/{filename}")


def verify_repo_indexes(repo_root: Path, release_root: Path, result: ReleaseVerificationResult) -> None:
    latest_release_metadata = load_latest_release_metadata(repo_root)
    latest_release_dir = latest_release_metadata.get("release_dir", "")
    latest_version_id = latest_release_metadata.get("version_id", "")
    if latest_release_dir == release_root.name:
        result.add_ok("release/LATEST_RELEASE.txt 与当前 release 目录一致")
    else:
        result.add_error(
            f"release/LATEST_RELEASE.txt 指向不一致：{latest_release_dir} != {release_root.name}"
        )

    readme_path = repo_root / "release" / "README.md"
    verify_text_contains_path(readme_path, release_root.name, result, "release/README.md")
    codex_readme_path = repo_root / ".codex" / "README.md"
    for expected_text in CODEX_README_REQUIRED_REFERENCES:
        verify_text_contains_path(codex_readme_path, expected_text, result, ".codex/README.md")

    release_doc_paths = sorted((repo_root / "docs" / "release").glob("*.md"))
    if not release_doc_paths:
        result.add_warning("docs/release 下没有可校验的稳定版说明文档")
        return

    matched_doc = next((path for path in release_doc_paths if release_root.name in path.read_text(encoding="utf-8")), None)
    if matched_doc is None:
        result.add_error(f"docs/release/*.md 中未找到当前 release 目录：{release_root.name}")
    else:
        result.add_ok(f"稳定版说明文档已引用当前 release：{matched_doc.name}")
        if latest_version_id:
            verify_text_contains_path(
                matched_doc,
                latest_version_id,
                result,
                matched_doc.relative_to(repo_root).as_posix(),
            )


def verify_text_contains_path(path: Path, expected_text: str, result: ReleaseVerificationResult, label: str) -> None:
    if not path.exists():
        result.add_error(f"缺少索引文档：{label}")
        return

    text = path.read_text(encoding="utf-8")
    if expected_text in text:
        result.add_ok(f"{label} 已引用当前 release 目录")
    else:
        result.add_error(f"{label} 未引用当前 release 目录：{expected_text}")


def run_web_smoke_test(release_root: Path, result: ReleaseVerificationResult) -> None:
    python_exe = release_root / "project" / "prj" / ".venv" / "Scripts" / "python.exe"
    if not python_exe.exists():
        result.add_error("无法执行 Web smoke test：release 内尚未完成 setup_windows.bat")
        return

    process = subprocess.Popen(
        ["cmd.exe", "/c", "start_web_ui_7861.bat"],
        cwd=release_root,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        deadline = time.time() + 30
        while time.time() < deadline:
            try:
                with urllib.request.urlopen("http://127.0.0.1:7861/", timeout=3) as response:
                    if response.status == 200:
                        result.add_ok("Web smoke test 通过：http://127.0.0.1:7861/ 返回 200")
                        return
            except (urllib.error.URLError, TimeoutError):
                time.sleep(0.8)
        result.add_error("Web smoke test 失败：7861 端口在超时时间内未返回 200")
    finally:
        subprocess.run(
            ["taskkill", "/PID", str(process.pid), "/T", "/F"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="验证 stable release 目录的结构、索引和可选运行态。")
    parser.add_argument(
        "--release-root",
        "--release-dir",
        dest="release_dir",
        help="要验证的 release 目录。未传时优先自动解析当前最新 release。",
    )
    parser.add_argument("--repo-root", help="仓库根目录。传入后会额外校验 release 索引与说明文档。")
    parser.add_argument(
        "--check-web-smoke",
        action="store_true",
        help="如果 release 内已经准备好 .venv，则额外启动 7861 端口做一次 HTTP 200 探活。",
    )
    parser.add_argument("--json", action="store_true", help="以 JSON 输出验证结果。")
    return parser.parse_args()


def resolve_release_and_repo_root(args: argparse.Namespace) -> tuple[Path, Path | None]:
    if args.release_dir:
        release_root = Path(args.release_dir).resolve()
        repo_root = Path(args.repo_root).resolve() if args.repo_root else None
        return release_root, repo_root

    detected_release_root, detected_repo_root = detect_default_release_directory(Path(__file__))
    if detected_release_root is None:
        raise RuntimeError("未能自动定位 release 目录，请显式传入 --release-dir。")

    if args.repo_root:
        detected_repo_root = Path(args.repo_root).resolve()
    return detected_release_root, detected_repo_root


def print_result(result: ReleaseVerificationResult, as_json: bool) -> None:
    if as_json:
        payload = {
            "release_root": result.release_root.as_posix(),
            "version_id": result.version_id,
            "is_success": result.is_success,
            "checked_items": result.checked_items,
            "warnings": result.warnings,
            "errors": result.errors,
        }
        print(json.dumps(payload, ensure_ascii=False, indent=2))
        return

    print(f"[INFO] release_root={result.release_root.as_posix()}")
    if result.version_id:
        print(f"[INFO] version_id={result.version_id}")
    for message in result.checked_items:
        print(f"[OK] {message}")
    for message in result.warnings:
        print(f"[WARN] {message}")
    for message in result.errors:
        print(f"[ERROR] {message}")
    print(f"[SUMMARY] success={result.is_success} checked={len(result.checked_items)} warnings={len(result.warnings)} errors={len(result.errors)}")


def main() -> int:
    args = parse_args()
    release_root, repo_root = resolve_release_and_repo_root(args)
    result = verify_release_directory(
        release_root=release_root,
        repo_root=repo_root,
        check_repo_indexes=repo_root is not None,
        check_web_smoke=args.check_web_smoke,
    )
    print_result(result=result, as_json=args.json)
    return 0 if result.is_success else 1


def collect_release_directory_failures(release_root: Path) -> list[str]:
    release_root = release_root.resolve()
    failures: list[str] = []

    if not release_root.exists():
        return [f"release 目录不存在：{release_root}"]

    for relative_path in LEGACY_RELEASE_REQUIRED_FILES:
        if not (release_root / relative_path).exists():
            failures.append(f"缺少 release 文件：{relative_path}")

    manifest_path = release_root / "RELEASE_MANIFEST.json"
    if manifest_path.exists():
        try:
            manifest_data = json.loads(manifest_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            failures.append(f"RELEASE_MANIFEST.json 解析失败：{exc}")
            manifest_data = None
        if isinstance(manifest_data, dict):
            copied_paths = manifest_data.get("copied_paths", [])
            if isinstance(copied_paths, list):
                for copied_path in copied_paths:
                    if not (release_root / str(copied_path)).exists():
                        failures.append(f"manifest 路径缺失：{copied_path}")
            else:
                failures.append("manifest.copied_paths 不是列表")

    return failures


def collect_repository_release_failures(repo_root: Path) -> list[str]:
    repo_root = repo_root.resolve()
    failures: list[str] = []

    latest_release_path = repo_root / "release" / "LATEST_RELEASE.txt"
    release_readme_path = repo_root / "release" / "README.md"
    codex_readme_path = repo_root / ".codex" / "README.md"
    stable_release_doc_path = repo_root / "docs" / "release" / "2026-03-23-stable-release.md"

    required_repo_files = (
        latest_release_path,
        release_readme_path,
        codex_readme_path,
        stable_release_doc_path,
    )
    for path in required_repo_files:
        if not path.exists():
            failures.append(f"缺少仓库级 release 索引：{path.relative_to(repo_root).as_posix()}")

    if failures:
        return failures

    latest_release_metadata = load_latest_release_metadata(repo_root)
    release_dir = latest_release_metadata.get("release_dir", "")
    if not release_dir:
        failures.append("LATEST_RELEASE.txt 缺少 release_dir")
        return failures

    release_root = repo_root / "release" / release_dir
    failures.extend(collect_release_directory_failures(release_root))

    expected_markers = {
        release_readme_path: release_dir,
        codex_readme_path: "release/LATEST_RELEASE.txt",
        stable_release_doc_path: release_dir,
    }
    for path, marker in expected_markers.items():
        text = path.read_text(encoding="utf-8")
        if marker not in text:
            failures.append(f"{path.relative_to(repo_root).as_posix()} 中缺少标记：{marker}")

    return failures


if __name__ == "__main__":
    raise SystemExit(main())

import os
from pathlib import Path
import socket
import subprocess
import time

import pytest


ROOT_BATCH_FILES = (
    "start_web_ui.bat",
    "start_web_ui_7861.bat",
    "start_web_ui_debug.bat",
)


def _contains_bare_lf(data: bytes) -> bool:
    normalized = data.replace(b"\r\n", b"")
    return b"\n" in normalized


def test_root_batch_scripts_use_crlf_line_endings() -> None:
    repo_root = Path(__file__).resolve().parents[2]

    for relative_path in ROOT_BATCH_FILES:
        batch_path = repo_root / relative_path
        batch_bytes = batch_path.read_bytes()

        assert b"\r\n" in batch_bytes, f"{relative_path} 缺少 CRLF 换行。"
        assert not _contains_bare_lf(batch_bytes), f"{relative_path} 包含裸 LF，cmd.exe 会解析异常。"


def _pick_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe_socket:
        probe_socket.bind(("127.0.0.1", 0))
        return int(probe_socket.getsockname()[1])


def _can_connect(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as client_socket:
        client_socket.settimeout(0.5)
        try:
            client_socket.connect(("127.0.0.1", port))
        except OSError:
            return False
        return True


@pytest.mark.skipif(os.name != "nt", reason="仅在 Windows 下验证 BAT 启动行为。")
def test_start_web_ui_bat_falls_back_to_backup_port_when_default_port_is_busy() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    busy_port = _pick_free_port()
    fallback_port = _pick_free_port()
    hold_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    process = None

    try:
        hold_socket.bind(("127.0.0.1", busy_port))
        hold_socket.listen(1)

        env = os.environ.copy()
        env["WEB_HOST"] = "127.0.0.1"
        env["WEB_PORT"] = str(busy_port)
        env["FALLBACK_WEB_PORT"] = str(fallback_port)

        process = subprocess.Popen(
            ["cmd", "/c", "start_web_ui.bat"],
            cwd=repo_root,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            encoding="utf-8",
            errors="replace",
        )

        deadline = time.time() + 20
        while time.time() < deadline:
            if _can_connect(fallback_port):
                break
            time.sleep(0.5)
        else:
            captured_output = ""
            if process.stdout is not None:
                captured_output = process.stdout.read()
            raise AssertionError(f"备用端口 {fallback_port} 未启动成功。输出：{captured_output}")
    finally:
        hold_socket.close()
        if process is not None:
            subprocess.run(
                ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                check=False,
            )
            process.wait(timeout=10)

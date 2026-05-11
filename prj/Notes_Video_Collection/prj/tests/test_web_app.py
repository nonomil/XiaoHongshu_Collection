import time
from pathlib import Path

import pytest


pytest.importorskip("fastapi")
from fastapi.testclient import TestClient

from video_summary_cli.web_batch import WebBatchRunner
from video_summary_cli.web_app import create_app


def test_web_app_serves_index_and_default_config(tmp_path: Path) -> None:
    app = create_app(config_path=tmp_path / "web-ui-config.json")
    client = TestClient(app, base_url="http://127.0.0.1:7861")

    response = client.get("/")
    config_response = client.get("/api/config")

    assert response.status_code == 200
    assert "视频总结工作台" in response.text
    assert "小红书视频笔记通常需要 cookies" in response.text
    assert "当前访问地址" in response.text
    assert "http://127.0.0.1:7861" in response.text
    assert config_response.status_code == 200
    assert config_response.json()["summary_style"] == "tutorial-note"


def test_web_app_can_save_config(tmp_path: Path) -> None:
    config_path = tmp_path / "web-ui-config.json"
    app = create_app(config_path=config_path)
    client = TestClient(app)

    response = client.post(
        "/api/config",
        json={
            "output_dir": str(tmp_path / "批量产物"),
            "cookies_path": "ref/Data/www.bilibili.com_cookies.txt",
            "transcriber": "auto",
            "whisper_model": "tiny",
            "screenshot_mode": "smart",
            "screenshot_count": 10,
            "summary_style": "tutorial-note",
            "openai": {
                "enabled": True,
                "base_url": "https://api.example.com/v1",
                "api_key": "demo-key",
                "model": "gpt-4.1-mini",
                "temperature": 0.2,
            },
        },
    )

    assert response.status_code == 200
    assert response.json()["openai"]["enabled"] is True
    assert "demo-key" in config_path.read_text(encoding="utf-8")


def test_web_app_job_api_runs_batch_and_reads_markdown(tmp_path: Path) -> None:
    def fake_single_run_callable(*, url, output_root, **kwargs):
        title = "前端验收视频"
        output_dir = output_root / "frontend-audit"
        assets_dir = output_dir / "img" / "前端验收视频.assets"
        output_dir.mkdir(parents=True, exist_ok=True)
        assets_dir.mkdir(parents=True, exist_ok=True)
        (assets_dir / "frame-001.jpg").write_bytes(b"fake-image")
        (output_dir / "前端验收视频.md").write_text(
            "# 前端验收视频\n\n![配图](img/前端验收视频.assets/frame-001.jpg)\n",
            encoding="utf-8",
        )
        (output_dir / "metadata.json").write_text(
            '{"title":"前端验收视频","video_id":"frontend-audit"}',
            encoding="utf-8",
        )
        (output_dir / "transcript.txt").write_text("测试转写", encoding="utf-8")
        (output_dir / "versions").mkdir(exist_ok=True)
        return output_dir

    app = create_app(
        config_path=tmp_path / "web-ui-config.json",
        batch_runner=WebBatchRunner(single_run_callable=fake_single_run_callable),
    )
    client = TestClient(app)

    create_response = client.post(
        "/api/jobs",
        data={
            "urls_text": "https://b23.tv/1SzaT3c",
            "output_root": str(tmp_path / "web-batches"),
            "batch_name": "前端验收批次",
            "summary_style": "tutorial-note",
            "screenshot_mode": "smart",
            "screenshot_count": 6,
            "transcriber": "auto",
            "whisper_model": "tiny",
        },
    )

    assert create_response.status_code == 200
    job_id = create_response.json()["job_id"]

    job_payload = None
    for _ in range(40):
        poll_response = client.get(f"/api/jobs/{job_id}")
        assert poll_response.status_code == 200
        job_payload = poll_response.json()
        if job_payload["status"] in {"succeeded", "partial", "failed"}:
            break
        time.sleep(0.05)

    assert job_payload is not None
    assert job_payload["status"] == "succeeded"
    assert job_payload["batch_directory"].endswith("前端验收批次")
    assert job_payload["items"][0]["summary_path"].endswith("前端验收视频.md")

    markdown_response = client.get(f"/api/jobs/{job_id}/items/0/markdown")

    assert markdown_response.status_code == 200
    assert "# 前端验收视频" in markdown_response.text

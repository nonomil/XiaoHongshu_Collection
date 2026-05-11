import json
from pathlib import Path

from video_summary_cli.web_config import WebUiConfigStore
from video_summary_cli.web_models import OpenAiCompatibleConfig, WebUiSettings, parse_video_urls


def test_parse_video_urls_deduplicates_and_preserves_order() -> None:
    urls = parse_video_urls(
        """
        https://b23.tv/1SzaT3c
        https://www.youtube.com/watch?v=demo-001

        https://b23.tv/1SzaT3c
        https://example.com/video/42
        """
    )

    assert urls == [
        "https://b23.tv/1SzaT3c",
        "https://www.youtube.com/watch?v=demo-001",
        "https://example.com/video/42",
    ]


def test_web_ui_config_store_round_trips_settings(tmp_path: Path) -> None:
    config_path = tmp_path / "web-ui-config.json"
    store = WebUiConfigStore(config_path)
    settings = WebUiSettings(
        output_dir=str(tmp_path / "批量输出"),
        batch_name="批量任务-A",
        cookies_path="ref/Data/www.bilibili.com_cookies.txt",
        transcriber="faster-whisper",
        whisper_model="small",
        screenshot_mode="smart",
        screenshot_count=12,
        summary_style="tutorial-note",
        remember_api_key=True,
        openai=OpenAiCompatibleConfig(
            enabled=True,
            base_url="https://api.example.com/v1",
            api_key="secret-key",
            model="gpt-4.1-mini",
            temperature=0.1,
        ),
    )

    store.save(settings)
    loaded = store.load()
    payload = json.loads(config_path.read_text(encoding="utf-8"))

    assert loaded.output_dir == str(tmp_path / "批量输出")
    assert loaded.batch_name == "批量任务-A"
    assert loaded.cookies_path == "ref/Data/www.bilibili.com_cookies.txt"
    assert loaded.transcriber == "faster-whisper"
    assert loaded.remember_api_key is True
    assert loaded.openai.enabled is True
    assert loaded.openai.base_url == "https://api.example.com/v1"
    assert loaded.openai.api_key == "secret-key"
    assert loaded.openai.model == "gpt-4.1-mini"
    assert payload["summary_style"] == "tutorial-note"
    assert payload["batch_name"] == "批量任务-A"
    assert payload["remember_api_key"] is True
    assert payload["openai"]["api_key"] == "secret-key"


def test_web_ui_config_store_omits_api_key_when_not_remembered(tmp_path: Path) -> None:
    config_path = tmp_path / "web-ui-config.json"
    store = WebUiConfigStore(config_path)
    settings = WebUiSettings(
        output_dir=str(tmp_path / "批量输出"),
        remember_api_key=False,
        openai=OpenAiCompatibleConfig(
            enabled=True,
            base_url="https://api.example.com/v1",
            api_key="secret-key",
            model="gpt-4.1-mini",
        ),
    )

    store.save(settings)
    loaded = store.load()
    payload = json.loads(config_path.read_text(encoding="utf-8"))

    assert payload["remember_api_key"] is False
    assert payload["openai"]["api_key"] == ""
    assert loaded.remember_api_key is False
    assert loaded.openai.api_key == ""


def test_web_ui_config_store_preserves_zero_temperature(tmp_path: Path) -> None:
    config_path = tmp_path / "web-ui-config.json"
    store = WebUiConfigStore(config_path)
    settings = WebUiSettings(
        output_dir=str(tmp_path / "批量输出"),
        openai=OpenAiCompatibleConfig(
            enabled=True,
            base_url="https://api.example.com/v1",
            api_key="secret-key",
            model="gpt-4.1-mini",
            temperature=0.0,
        ),
    )

    store.save(settings)
    loaded = store.load()

    assert loaded.openai.temperature == 0.0

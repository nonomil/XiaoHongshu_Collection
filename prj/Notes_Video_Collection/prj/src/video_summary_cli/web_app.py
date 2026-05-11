from __future__ import annotations

import argparse
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass, field
from datetime import datetime
from pathlib import Path
from threading import Lock
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, Form, HTTPException, Request
from fastapi.responses import HTMLResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from video_summary_cli.openai_compatible import OpenAICompatibleConfig
from video_summary_cli.web_batch import BatchRequest, BatchRunResult, WebBatchRunner, parse_batch_urls
from video_summary_cli.web_config import (
    WebUiConfigStore,
    WebUiPreferences,
    default_web_config_path,
    load_web_ui_preferences,
    save_web_ui_preferences,
)
from video_summary_cli.web_models import OpenAiCompatibleConfig, WebUiSettings


@dataclass(slots=True)
class JobItemState:
    """前端任务中的单项状态。"""

    url: str
    status: str = "queued"
    title: str = ""
    message: str = ""
    summary_path: str = ""
    assets_directory: str = ""
    record_directory: str = ""
    summary_source: str = ""
    error: str = ""


@dataclass(slots=True)
class JobState:
    """前端任务状态快照。"""

    job_id: str
    status: str
    created_at: str
    started_at: str = ""
    finished_at: str = ""
    batch_directory: str = ""
    logs: list[str] = field(default_factory=list)
    items: list[JobItemState] = field(default_factory=list)
    error: str = ""


class WebJobManager:
    """本地 Web UI 的任务队列。"""

    def __init__(self, batch_runner: WebBatchRunner) -> None:
        self.batch_runner = batch_runner
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="video-summary-web")
        self.lock = Lock()
        self.jobs: dict[str, JobState] = {}

    def submit(self, batch_request: BatchRequest) -> str:
        job_id = uuid4().hex
        job_state = JobState(
            job_id=job_id,
            status="queued",
            created_at=current_timestamp(),
            items=[JobItemState(url=url) for url in batch_request.urls],
            logs=["任务已创建，等待执行。"],
        )
        with self.lock:
            self.jobs[job_id] = job_state
        self.executor.submit(self._run_job, job_id, batch_request)
        return job_id

    def get(self, job_id: str) -> JobState:
        with self.lock:
            job_state = self.jobs.get(job_id)
            if job_state is None:
                raise KeyError(job_id)
            return _clone_job_state(job_state)

    def _run_job(self, job_id: str, batch_request: BatchRequest) -> None:
        self._update_job(job_id, status="running", started_at=current_timestamp())
        self._append_log(job_id, f"开始处理 {len(batch_request.urls)} 个视频链接。")
        try:
            result = self.batch_runner.run_batch(
                batch_request,
                progress_callback=lambda event: self._apply_progress_event(job_id, event),
            )
            self._finalize_job(job_id, result)
        except Exception as exc:
            self._update_job(
                job_id,
                status="failed",
                finished_at=current_timestamp(),
                error=str(exc),
            )
            self._append_log(job_id, f"任务失败：{exc}")

    def _apply_progress_event(self, job_id: str, event: dict[str, Any]) -> None:
        event_type = str(event.get("type") or "")
        item_index = int(event.get("index", -1))
        message = str(event.get("message") or "")
        with self.lock:
            job_state = self.jobs[job_id]
            if 0 <= item_index < len(job_state.items):
                item_state = job_state.items[item_index]
                if event_type == "item_started":
                    item_state.status = "running"
                if event_type == "item_succeeded":
                    item_state.status = "succeeded"
                if event_type == "item_failed":
                    item_state.status = "failed"
                item_state.title = str(event.get("title") or item_state.title)
                item_state.message = message or item_state.message
                item_state.summary_path = str(event.get("summary_path") or item_state.summary_path)
                item_state.assets_directory = str(
                    event.get("assets_directory") or item_state.assets_directory
                )
                item_state.record_directory = str(
                    event.get("record_directory") or item_state.record_directory
                )
                item_state.summary_source = str(event.get("summary_source") or item_state.summary_source)
                item_state.error = str(event.get("error") or item_state.error)
            if message:
                job_state.logs.append(message)

    def _finalize_job(self, job_id: str, result: BatchRunResult) -> None:
        with self.lock:
            job_state = self.jobs[job_id]
            job_state.status = result.status
            job_state.finished_at = current_timestamp()
            job_state.batch_directory = str(result.batch_directory)
            job_state.items = [
                JobItemState(
                    url=item.url,
                    status=item.status,
                    title=item.title,
                    summary_path=str(item.summary_path or ""),
                    assets_directory=str(item.assets_directory or ""),
                    record_directory=str(item.record_directory or ""),
                    summary_source=item.summary_source,
                    error=item.error,
                    message="处理完成" if item.status == "succeeded" else item.error,
                )
                for item in result.items
            ]
            success_count = sum(item.status == "succeeded" for item in result.items)
            job_state.logs.append(
                f"任务结束：{success_count}/{len(result.items)} 个视频成功导出。"
            )

    def _update_job(self, job_id: str, **updates: Any) -> None:
        with self.lock:
            job_state = self.jobs[job_id]
            for key, value in updates.items():
                setattr(job_state, key, value)

    def _append_log(self, job_id: str, message: str) -> None:
        with self.lock:
            self.jobs[job_id].logs.append(message)


def create_app(
    *,
    config_path: Path | None = None,
    batch_runner: WebBatchRunner | None = None,
) -> FastAPI:
    """创建本地 Web UI 应用。"""

    app = FastAPI(title="视频总结工作台")
    template_directory = Path(__file__).resolve().parent / "web" / "templates"
    static_directory = Path(__file__).resolve().parent / "web" / "static"
    templates = Jinja2Templates(directory=str(template_directory))

    app.mount("/static", StaticFiles(directory=str(static_directory)), name="static")
    app.state.config_path = config_path or default_web_config_path()
    app.state.job_manager = WebJobManager(batch_runner or WebBatchRunner())

    @app.get("/", response_class=HTMLResponse)
    async def index(request: Request):
        preferences = load_web_ui_preferences(app.state.config_path)
        launch_origin = str(request.base_url).rstrip("/")
        return templates.TemplateResponse(
            request,
            "index.html",
            {
                "request": request,
                "preferences": build_preferences_payload(preferences),
                "launch_origin": launch_origin,
            },
        )

    @app.get("/api/config")
    async def get_config():
        store = WebUiConfigStore(app.state.config_path)
        settings = store.load()
        return settings.to_dict(include_api_key=True)

    @app.post("/api/config")
    async def save_config(request: Request):
        payload = await request.json()
        store = WebUiConfigStore(app.state.config_path)
        settings = WebUiSettings(
            output_dir=str(
                payload.get("output_dir")
                or payload.get("output_root")
                or load_web_ui_preferences(app.state.config_path).output_root
            ),
            batch_name=str(payload.get("batch_name") or ""),
            cookies_path=str(payload.get("cookies_path") or ""),
            transcriber=str(payload.get("transcriber") or "auto"),
            whisper_model=str(payload.get("whisper_model") or "tiny"),
            screenshot_mode=str(payload.get("screenshot_mode") or "smart"),
            screenshot_count=max(int(payload.get("screenshot_count") or 8), 1),
            summary_style=str(payload.get("summary_style") or "tutorial-note"),
            remember_api_key=bool(payload.get("remember_api_key", True)),
            openai=OpenAiCompatibleConfig.from_dict(payload.get("openai")),
        )
        store.save(settings)
        return settings.to_dict(include_api_key=True)

    @app.post("/api/jobs")
    async def create_job(
        urls_text: str = Form(""),
        output_root: str = Form(""),
        batch_name: str = Form(""),
        cookies_path: str = Form(""),
        transcriber: str = Form("auto"),
        whisper_model: str = Form("tiny"),
        screenshot_mode: str = Form("smart"),
        screenshot_count: int = Form(8),
        summary_style: str = Form("tutorial-note"),
        ai_enabled: str = Form(""),
        ai_base_url: str = Form("https://api.openai.com/v1"),
        ai_api_key: str = Form(""),
        ai_model: str = Form(""),
        remember_api_key: str = Form(""),
    ):
        parsed_urls = parse_batch_urls(urls_text)
        if not parsed_urls:
            raise HTTPException(status_code=400, detail="请至少输入一个有效视频链接。")

        ai_is_enabled = checkbox_to_bool(ai_enabled)
        remember_api_key_enabled = checkbox_to_bool(remember_api_key)
        openai_config = OpenAICompatibleConfig(
            enabled=ai_is_enabled,
            base_url=ai_base_url.strip() or "https://api.openai.com/v1",
            api_key=ai_api_key.strip(),
            model=ai_model.strip(),
        )
        if ai_is_enabled and not openai_config.is_ready():
            raise HTTPException(
                status_code=400,
                detail="启用 OpenAI 兼容摘要时，必须填写 Base URL、API Key 和模型名。",
            )

        preferences = WebUiPreferences(
            output_root=output_root.strip(),
            batch_name=batch_name.strip(),
            cookies_path=cookies_path.strip(),
            transcriber=transcriber,
            whisper_model=whisper_model.strip() or "tiny",
            screenshot_mode=screenshot_mode,
            screenshot_count=max(int(screenshot_count), 1),
            summary_style=summary_style,
            remember_api_key=remember_api_key_enabled,
            openai_compatible=OpenAiCompatibleConfig.from_dict(asdict(openai_config)),
        )
        save_web_ui_preferences(preferences, app.state.config_path)

        output_root_path = preferences.output_root or load_web_ui_preferences(app.state.config_path).output_root
        batch_request = BatchRequest(
            urls=parsed_urls,
            output_root=Path(output_root_path).expanduser(),
            batch_name=preferences.batch_name,
            cookies_path=Path(preferences.cookies_path).expanduser()
            if preferences.cookies_path
            else None,
            transcriber_name=preferences.transcriber,
            whisper_model=preferences.whisper_model,
            screenshot_mode=preferences.screenshot_mode,
            screenshot_count=preferences.screenshot_count,
            summary_style=preferences.summary_style,
            openai_compatible=openai_config,
        )
        job_id = app.state.job_manager.submit(batch_request)
        return {
            "job_id": job_id,
            "status_url": f"/api/jobs/{job_id}",
        }

    @app.get("/api/jobs/{job_id}")
    async def get_job(job_id: str):
        try:
            job_state = app.state.job_manager.get(job_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="任务不存在。") from exc
        return serialize_job_state(job_state)

    @app.get("/api/jobs/{job_id}/items/{item_index}/markdown")
    async def get_markdown(job_id: str, item_index: int):
        try:
            job_state = app.state.job_manager.get(job_id)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="任务不存在。") from exc
        if item_index < 0 or item_index >= len(job_state.items):
            raise HTTPException(status_code=404, detail="结果项不存在。")
        summary_path = Path(job_state.items[item_index].summary_path)
        if not summary_path.exists():
            raise HTTPException(status_code=404, detail="Markdown 文件不存在。")
        return PlainTextResponse(
            summary_path.read_text(encoding="utf-8"),
            media_type="text/markdown; charset=utf-8",
        )

    return app


def build_preferences_payload(preferences: WebUiPreferences) -> dict[str, Any]:
    """把配置转成模板可直接使用的对象。"""

    settings = WebUiSettings(
        output_dir=preferences.output_root,
        batch_name=preferences.batch_name,
        cookies_path=preferences.cookies_path,
        transcriber=preferences.transcriber,
        whisper_model=preferences.whisper_model,
        screenshot_mode=preferences.screenshot_mode,
        screenshot_count=preferences.screenshot_count,
        summary_style=preferences.summary_style,
        remember_api_key=preferences.remember_api_key,
        openai=OpenAiCompatibleConfig.from_dict(asdict(preferences.openai_compatible)),
    )
    payload = settings.to_dict(include_api_key=True)
    payload["output_root"] = payload["output_dir"]
    payload["openai_compatible"] = payload["openai"]
    return payload


def checkbox_to_bool(raw_value: str) -> bool:
    """把 HTML checkbox 值转成布尔值。"""

    return raw_value.lower() not in {"", "0", "false", "off"}


def serialize_job_state(job_state: JobState) -> dict[str, Any]:
    """把任务状态转成 JSON 可序列化结构。"""

    return json.loads(json.dumps(asdict(job_state), ensure_ascii=False))


def current_timestamp() -> str:
    """返回当前 ISO 时间戳。"""

    return datetime.now().astimezone().isoformat(timespec="seconds")


def _clone_job_state(job_state: JobState) -> JobState:
    return JobState(
        job_id=job_state.job_id,
        status=job_state.status,
        created_at=job_state.created_at,
        started_at=job_state.started_at,
        finished_at=job_state.finished_at,
        batch_directory=job_state.batch_directory,
        logs=list(job_state.logs),
        items=[
            JobItemState(
                url=item.url,
                status=item.status,
                title=item.title,
                message=item.message,
                summary_path=item.summary_path,
                assets_directory=item.assets_directory,
                record_directory=item.record_directory,
                summary_source=item.summary_source,
                error=item.error,
            )
            for item in job_state.items
        ],
        error=job_state.error,
    )


def main(argv: list[str] | None = None) -> int:
    """启动本地 Web UI。"""

    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser(description="启动视频总结本地 Web UI。")
    parser.add_argument("--host", default="127.0.0.1", help="监听地址")
    parser.add_argument("--port", type=int, default=7860, help="监听端口")
    parser.add_argument("--config-path", type=Path, help="配置文件路径")
    args = parser.parse_args(argv)

    try:
        import uvicorn
    except ImportError as exc:  # pragma: no cover - 依赖缺失时的运行期保护
        raise RuntimeError("未安装 uvicorn，请先安装 `video-summary-cli[web]`。") from exc

    uvicorn.run(
        create_app(config_path=args.config_path),
        host=args.host,
        port=args.port,
        log_level="info",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

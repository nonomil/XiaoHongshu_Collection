from __future__ import annotations

from http.cookiejar import MozillaCookieJar
from pathlib import Path
from urllib.request import HTTPCookieProcessor, Request, build_opener, urlopen

from yt_dlp import YoutubeDL

from video_summary_cli.fetcher import build_ydl_options, build_video_download_format
from video_summary_cli.models import TranscriptSegment, VideoMetadata, VideoPlatform
from video_summary_cli.paths import slugify_text
from video_summary_cli.xiaohongshu_parser import XiaohongshuVideoPage, parse_xiaohongshu_video_page


DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/135.0.0.0 Safari/537.36"
)


class XiaohongshuMediaDownloader:
    """负责下载小红书视频媒体。"""

    def __init__(self, cookies_path: Path | None = None) -> None:
        self.cookies_path = Path(cookies_path) if cookies_path else None

    def download(
        self,
        *,
        media_url: str,
        target_dir: Path,
        file_stub: str,
        media_kind: str,
    ) -> Path:
        target_dir.mkdir(parents=True, exist_ok=True)
        output_template = str((target_dir / f"{file_stub}.%(ext)s").resolve())
        format_selector = "bestaudio/best" if media_kind == "audio" else build_video_download_format()
        options = {
            **build_ydl_options(cookies_path=self.cookies_path),
            "format": format_selector,
            "outtmpl": output_template,
        }
        with YoutubeDL(options) as downloader:
            result = downloader.extract_info(media_url, download=True)
            if result is None:
                raise RuntimeError("小红书媒体下载失败。")
            prepared = downloader.prepare_filename(result)
        return Path(prepared)


class XiaohongshuVideoFetcher:
    """基于页面状态解析的小红书视频抓取器。"""

    def __init__(
        self,
        cookies_path: Path | None = None,
        page_loader=None,
        media_downloader: XiaohongshuMediaDownloader | None = None,
    ) -> None:
        self.cookies_path = Path(cookies_path) if cookies_path else None
        self.page_loader = page_loader or self._load_page_html
        self.media_downloader = media_downloader or XiaohongshuMediaDownloader(self.cookies_path)
        self._page_cache: dict[str, XiaohongshuVideoPage] = {}

    def extract_metadata(self, url: str) -> VideoMetadata:
        page = self._get_page(url)
        return VideoMetadata(
            source_url=url,
            canonical_url=page.canonical_url,
            title=page.title,
            uploader=page.uploader,
            description=page.description,
            video_id=page.note_id,
            platform=VideoPlatform.XIAOHONGSHU,
            published_at=page.published_at,
            tags=list(page.tags),
        )

    def fetch_transcript_segments(self, metadata: VideoMetadata) -> list[TranscriptSegment]:
        return []

    def download_audio(self, metadata: VideoMetadata, target_dir: Path) -> Path:
        page = self._get_page_for_metadata(metadata)
        return self.media_downloader.download(
            media_url=page.video_url,
            target_dir=target_dir,
            file_stub=f"{slugify_text(metadata.title)}-{metadata.video_id}",
            media_kind="audio",
        )

    def download_video(self, metadata: VideoMetadata, target_dir: Path) -> Path:
        page = self._get_page_for_metadata(metadata)
        return self.media_downloader.download(
            media_url=page.video_url,
            target_dir=target_dir,
            file_stub=f"{slugify_text(metadata.title)}-{metadata.video_id}",
            media_kind="video",
        )

    def _get_page(self, url: str) -> XiaohongshuVideoPage:
        cached_page = self._page_cache.get(url)
        if cached_page is not None:
            return cached_page

        html = self.page_loader(url)
        page = parse_xiaohongshu_video_page(html=html, source_url=url)
        self._page_cache[url] = page
        self._page_cache[page.canonical_url] = page
        self._page_cache[page.note_id] = page
        return page

    def _get_page_for_metadata(self, metadata: VideoMetadata) -> XiaohongshuVideoPage:
        return (
            self._page_cache.get(metadata.source_url)
            or self._page_cache.get(metadata.canonical_url)
            or self._page_cache.get(metadata.video_id)
            or self._get_page(metadata.source_url)
        )

    def _load_page_html(self, url: str) -> str:
        headers = {
            "User-Agent": DEFAULT_USER_AGENT,
            "Referer": "https://www.xiaohongshu.com/",
        }
        request = Request(url, headers=headers)
        if self.cookies_path is None:
            with urlopen(request) as response:
                return response.read().decode("utf-8", errors="replace")

        cookie_jar = MozillaCookieJar(str(self.cookies_path))
        cookie_jar.load(ignore_discard=True, ignore_expires=True)
        opener = build_opener(HTTPCookieProcessor(cookie_jar))
        with opener.open(request) as response:
            return response.read().decode("utf-8", errors="replace")

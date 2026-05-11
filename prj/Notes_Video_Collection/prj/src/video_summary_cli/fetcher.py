from __future__ import annotations

from http.cookiejar import MozillaCookieJar
from dataclasses import dataclass
from pathlib import Path
from urllib.request import HTTPCookieProcessor, build_opener, urlopen

from yt_dlp import YoutubeDL

from video_summary_cli.models import TranscriptSegment, VideoMetadata
from video_summary_cli.settings import AppSettings
from video_summary_cli.source_detector import detect_platform
from video_summary_cli.storage import slugify_text
from video_summary_cli.subtitle_parser import parse_subtitle_content


@dataclass(slots=True)
class SubtitleCandidate:
    """候选字幕文件信息。"""

    language: str
    extension: str
    url: str
    is_automatic: bool


class YtDlpVideoFetcher:
    """基于 yt-dlp 的统一视频抓取器。"""

    def __init__(
        self,
        preferred_subtitle_languages: list[str] | None = None,
        preferred_subtitle_extensions: list[str] | None = None,
        cookies_path: Path | None = None,
    ) -> None:
        settings = AppSettings()
        self.preferred_subtitle_languages = (
            preferred_subtitle_languages or settings.preferred_subtitle_languages
        )
        self.preferred_subtitle_extensions = (
            preferred_subtitle_extensions or settings.preferred_subtitle_extensions
        )
        self.cookies_path = Path(cookies_path) if cookies_path else None
        self._info_cache: dict[str, dict] = {}

    def extract_metadata(self, url: str) -> VideoMetadata:
        info = self._get_info(url)
        canonical_url = info.get("webpage_url") or info.get("original_url") or url
        return VideoMetadata(
            source_url=url,
            canonical_url=canonical_url,
            title=info.get("title") or info.get("id") or "untitled",
            uploader=info.get("uploader") or info.get("channel") or "unknown",
            description=info.get("description") or "",
            video_id=info.get("id") or "unknown-video",
            platform=detect_platform(canonical_url),
            published_at=info.get("upload_date"),
            duration_seconds=info.get("duration"),
        )

    def fetch_transcript_segments(self, metadata: VideoMetadata) -> list[TranscriptSegment]:
        info = self._get_info(metadata.source_url)
        requested_subtitles = info.get("requested_subtitles") or {}
        for requested_subtitle in requested_subtitles.values():
            subtitle_data = requested_subtitle.get("data")
            subtitle_extension = requested_subtitle.get("ext")
            if subtitle_data and subtitle_extension:
                return parse_subtitle_content(subtitle_data, subtitle_extension)

        candidate = pick_subtitle_candidate(
            info=info,
            preferred_languages=self.preferred_subtitle_languages,
            preferred_extensions=self.preferred_subtitle_extensions,
        )
        if candidate is None:
            return []

        content = _download_text(candidate.url, self.cookies_path)
        return parse_subtitle_content(content, candidate.extension)

    def download_audio(self, metadata: VideoMetadata, target_dir: Path) -> Path:
        target_dir.mkdir(parents=True, exist_ok=True)
        file_stub = f"{slugify_text(metadata.title)}-{metadata.video_id}"
        output_template = str((target_dir / f"{file_stub}.%(ext)s").resolve())
        options = {
            **build_ydl_options(cookies_path=self.cookies_path),
            "format": "bestaudio/best",
            "outtmpl": output_template,
        }
        with YoutubeDL(options) as downloader:
            result = downloader.extract_info(metadata.source_url, download=True)
            if result is None:
                raise RuntimeError("音频下载失败。")
            prepared = downloader.prepare_filename(result)
        return Path(prepared)

    def download_video(self, metadata: VideoMetadata, target_dir: Path) -> Path:
        """下载用于截图的视频文件。"""

        target_dir.mkdir(parents=True, exist_ok=True)
        file_stub = f"{slugify_text(metadata.title)}-{metadata.video_id}"
        output_template = str((target_dir / f"{file_stub}.%(ext)s").resolve())
        options = {
            **build_ydl_options(cookies_path=self.cookies_path),
            "format": build_video_download_format(),
            "outtmpl": output_template,
        }
        with YoutubeDL(options) as downloader:
            result = downloader.extract_info(metadata.source_url, download=True)
            if result is None:
                raise RuntimeError("视频下载失败。")
            prepared = downloader.prepare_filename(result)
        return Path(prepared)

    def _get_info(self, url: str) -> dict:
        if url in self._info_cache:
            return self._info_cache[url]

        options = build_ydl_options(
            skip_download=True,
            cookies_path=self.cookies_path,
            with_subtitles=True,
            preferred_subtitle_languages=self.preferred_subtitle_languages,
        )
        with YoutubeDL(options) as downloader:
            info = downloader.extract_info(url, download=False)
        if info is None:
            raise RuntimeError("无法获取视频元数据。")
        if "entries" in info:
            entries = [entry for entry in info.get("entries", []) if entry]
            if not entries:
                raise RuntimeError("未找到可用视频条目。")
            info = entries[0]
        self._info_cache[url] = info
        return info


def build_ydl_options(
    skip_download: bool = False,
    cookies_path: Path | None = None,
    with_subtitles: bool = False,
    preferred_subtitle_languages: list[str] | None = None,
) -> dict:
    """构建 yt-dlp 通用选项。"""

    options = {
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
    }
    if skip_download:
        options["skip_download"] = True
    if cookies_path is not None:
        options["cookiefile"] = str(cookies_path)
    if with_subtitles:
        options["writesubtitles"] = True
        options["writeautomaticsub"] = True
        if preferred_subtitle_languages:
            options["subtitleslangs"] = preferred_subtitle_languages
    return options


def build_video_download_format() -> str:
    """返回截图场景使用的视频下载格式。"""

    return "bestvideo[ext=mp4]/bestvideo/best[ext=mp4]/best"


def pick_subtitle_candidate(
    info: dict,
    preferred_languages: list[str],
    preferred_extensions: list[str] | None = None,
) -> SubtitleCandidate | None:
    """从元数据中选择最合适的字幕文件。"""

    extensions = preferred_extensions or AppSettings().preferred_subtitle_extensions
    sources = [
        (False, info.get("subtitles") or {}),
        (True, info.get("automatic_captions") or {}),
    ]

    for is_automatic, source_map in sources:
        for language in _iterate_candidate_languages(source_map, preferred_languages):
            entries = source_map.get(language, [])
            ordered_entries = sorted(
                entries,
                key=lambda item: _extension_rank(item.get("ext", ""), extensions),
            )
            for entry in ordered_entries:
                entry_url = entry.get("url")
                entry_extension = entry.get("ext")
                if not entry_url or not entry_extension:
                    continue
                return SubtitleCandidate(
                    language=language,
                    extension=entry_extension,
                    url=entry_url,
                    is_automatic=is_automatic,
                )
    return None


def _iterate_candidate_languages(source_map: dict, preferred_languages: list[str]) -> list[str]:
    available_languages = list(source_map.keys())
    ordered_languages: list[str] = []

    for preferred_language in preferred_languages:
        for available_language in available_languages:
            normalized_available = available_language.lower()
            normalized_preferred = preferred_language.lower()
            if normalized_available == normalized_preferred or normalized_available.startswith(
                normalized_preferred
            ):
                if available_language not in ordered_languages:
                    ordered_languages.append(available_language)

    for available_language in available_languages:
        if available_language not in ordered_languages:
            ordered_languages.append(available_language)
    return ordered_languages


def _extension_rank(extension: str, preferred_extensions: list[str]) -> int:
    normalized_extension = extension.lower().lstrip(".")
    try:
        return preferred_extensions.index(normalized_extension)
    except ValueError:
        return len(preferred_extensions)


def _download_text(url: str, cookies_path: Path | None) -> str:
    """按需带上 cookies 下载字幕正文。"""

    if cookies_path is None:
        with urlopen(url) as response:
            return response.read().decode("utf-8-sig", errors="replace")

    cookie_jar = MozillaCookieJar(str(cookies_path))
    cookie_jar.load(ignore_discard=True, ignore_expires=True)
    opener = build_opener(HTTPCookieProcessor(cookie_jar))
    with opener.open(url) as response:
        return response.read().decode("utf-8-sig", errors="replace")

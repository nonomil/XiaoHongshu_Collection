from __future__ import annotations

import shutil
import subprocess
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Protocol

from video_summary_cli.models import CapturedFrame


class HistogramSimilarityBackend(Protocol):
    """画面相似度比较后端。"""

    def histogram_similarity(self, left_frame, right_frame) -> float:
        """返回两个帧的直方图相似度。"""


class OcrBackend(Protocol):
    """OCR 文本提取后端。"""

    def extract_text(self, frame_payload) -> str:
        """从帧数据中提取文本。"""


class BlurBackend(Protocol):
    """画面清晰度评估后端。"""

    def blur_score(self, frame_payload) -> float:
        """返回画面清晰度分数，越大越清晰。"""


class ContentBackend(Protocol):
    """画面内容密度评估后端。"""

    def content_score(self, frame_payload) -> float:
        """返回更偏教程内容页的分数。"""


class OpenCvHistogramSimilarityBackend:
    """基于 OpenCV 颜色直方图的相似度比较。"""

    def histogram_similarity(self, left_frame, right_frame) -> float:
        cv2 = _load_cv2()
        left_hist = _build_histogram(cv2, left_frame)
        right_hist = _build_histogram(cv2, right_frame)
        return float(cv2.compareHist(left_hist, right_hist, cv2.HISTCMP_CORREL))


class TesseractCliOcrBackend:
    """基于 Tesseract CLI 的 OCR 后端。"""

    def __init__(self, languages: str = "chi_sim+eng", page_seg_mode: int = 6) -> None:
        self.languages = languages
        self.page_seg_mode = page_seg_mode

    def extract_text(self, frame_payload) -> str:
        cv2 = _load_cv2()
        success, encoded = cv2.imencode(".png", frame_payload)
        if not success:
            return ""

        completed = subprocess.run(
            [
                "tesseract",
                "stdin",
                "stdout",
                "-l",
                self.languages,
                "--psm",
                str(self.page_seg_mode),
            ],
            input=encoded.tobytes(),
            capture_output=True,
            check=False,
        )
        if completed.returncode != 0:
            return ""
        return completed.stdout.decode("utf-8", errors="ignore")


class OpenCvBlurBackend:
    """基于 Laplacian 方差的清晰度评估。"""

    def blur_score(self, frame_payload) -> float:
        cv2 = _load_cv2()
        grayscale_frame = cv2.cvtColor(frame_payload, cv2.COLOR_BGR2GRAY)
        return float(cv2.Laplacian(grayscale_frame, cv2.CV_64F).var())


class OpenCvContentBackend:
    """基于边缘密度与分布范围估计教程画面信息量。"""

    def content_score(self, frame_payload) -> float:
        cv2 = _load_cv2()
        grayscale_frame = cv2.cvtColor(frame_payload, cv2.COLOR_BGR2GRAY)
        edges = cv2.Canny(grayscale_frame, 80, 180)
        edge_density = float((edges > 0).mean())
        detail_score = _clamp_score(edge_density / 0.18)
        spread_score = _estimate_edge_spread(edges, grayscale_frame)
        contrast_score = _clamp_score(float(grayscale_frame.std()) / 72.0)
        return _clamp_score(spread_score * 0.50 + detail_score * 0.35 + contrast_score * 0.15)


@dataclass(slots=True)
class ScreenshotSelector:
    """从候选截图中筛选更有代表性的画面。"""

    similarity_backend: HistogramSimilarityBackend = field(default_factory=OpenCvHistogramSimilarityBackend)
    ocr_backend: OcrBackend | None = None
    blur_backend: BlurBackend | None = None
    content_backend: ContentBackend | None = None
    histogram_similarity_threshold: float = 0.99
    text_similarity_threshold: float = 0.95

    def select(
        self,
        candidates: list[CapturedFrame],
        screenshot_count: int,
    ) -> list[CapturedFrame]:
        if screenshot_count <= 0 or not candidates:
            return []

        filtered: list[CapturedFrame] = [candidates[0]]
        for candidate in candidates[1:]:
            decision = self._decide_candidate_action(filtered[-1], candidate)
            if decision == "keep":
                filtered.append(candidate)
            elif decision == "replace":
                filtered[-1] = candidate

        return _downsample_candidates(filtered, screenshot_count)

    def _decide_candidate_action(self, previous: CapturedFrame, current: CapturedFrame) -> str:
        histogram_similarity = self.similarity_backend.histogram_similarity(
            previous.frame_payload,
            current.frame_payload,
        )
        if histogram_similarity < self.histogram_similarity_threshold:
            return "keep"

        if self.ocr_backend is None:
            return self._prefer_sharper_frame(previous, current)

        previous_text = _normalize_text(self.ocr_backend.extract_text(previous.frame_payload))
        current_text = _normalize_text(self.ocr_backend.extract_text(current.frame_payload))
        if not previous_text and not current_text:
            return self._prefer_sharper_frame(previous, current)
        if not previous_text or not current_text:
            return "keep"

        if SequenceMatcher(None, previous_text, current_text).ratio() < self.text_similarity_threshold:
            return "keep"

        return self._prefer_sharper_frame(previous, current)

    def _prefer_sharper_frame(self, previous: CapturedFrame, current: CapturedFrame) -> str:
        previous_score = self._frame_quality_score(previous)
        current_score = self._frame_quality_score(current)
        if current_score > previous_score:
            return "replace"
        return "skip"

    def _frame_quality_score(self, candidate: CapturedFrame) -> float:
        blur_score = 0.0
        content_score = 0.0

        if self.blur_backend is not None:
            blur_score = self.blur_backend.blur_score(candidate.frame_payload)
        if self.content_backend is not None:
            content_score = self.content_backend.content_score(candidate.frame_payload)

        if self.blur_backend is None and self.content_backend is None:
            return 0.0
        if self.blur_backend is None:
            return content_score
        if self.content_backend is None:
            return blur_score

        return blur_score * 0.6 + content_score * 0.4


def _downsample_candidates(candidates: list[CapturedFrame], screenshot_count: int) -> list[CapturedFrame]:
    if len(candidates) <= screenshot_count:
        return candidates
    if screenshot_count == 1:
        return [candidates[len(candidates) // 2]]

    selected: list[CapturedFrame] = []
    last_index = len(candidates) - 1
    for index in range(screenshot_count):
        candidate_index = round(index * last_index / (screenshot_count - 1))
        selected.append(candidates[candidate_index])
    return selected


def _normalize_text(text: str) -> str:
    return " ".join(text.split()).strip().lower()


def _estimate_edge_spread(edges, grayscale_frame) -> float:
    height, width = grayscale_frame.shape[:2]
    row_boundaries = _build_grid_boundaries(height, 6)
    col_boundaries = _build_grid_boundaries(width, 6)

    active_tiles = 0
    total_tiles = 0
    for row_index in range(len(row_boundaries) - 1):
        for col_index in range(len(col_boundaries) - 1):
            top = row_boundaries[row_index]
            bottom = row_boundaries[row_index + 1]
            left = col_boundaries[col_index]
            right = col_boundaries[col_index + 1]

            edge_tile = edges[top:bottom, left:right]
            grayscale_tile = grayscale_frame[top:bottom, left:right]
            total_tiles += 1

            edge_density = float((edge_tile > 0).mean())
            local_contrast = float(grayscale_tile.std())
            if edge_density >= 0.035 or local_contrast >= 18.0:
                active_tiles += 1

    if total_tiles <= 0:
        return 0.0
    return active_tiles / total_tiles


def _build_grid_boundaries(length: int, bucket_count: int) -> list[int]:
    if length <= 0:
        return [0, 0]

    boundaries = [round(length * index / bucket_count) for index in range(bucket_count + 1)]
    boundaries[0] = 0
    boundaries[-1] = length
    return boundaries


def _clamp_score(score: float) -> float:
    return max(0.0, min(1.0, score))


def _build_histogram(cv2, frame_payload):
    histogram = cv2.calcHist([frame_payload], [0, 1, 2], None, [8, 8, 8], [0, 256, 0, 256, 0, 256])
    cv2.normalize(histogram, histogram)
    return histogram


def _load_cv2():
    try:
        import cv2
    except ImportError as exc:  # pragma: no cover - 依赖缺失属于环境问题
        raise RuntimeError(
            "截图智能模式依赖 opencv-python-headless，请先安装 `pip install -e .[media]`。"
        ) from exc
    return cv2


def build_default_ocr_backend() -> OcrBackend | None:
    """按环境自动选择可用 OCR 后端。"""

    if shutil.which("tesseract"):
        return TesseractCliOcrBackend()
    return None

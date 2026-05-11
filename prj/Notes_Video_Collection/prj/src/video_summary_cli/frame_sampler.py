from __future__ import annotations

from difflib import SequenceMatcher
from math import ceil
from pathlib import Path
from typing import Protocol

from video_summary_cli.models import CapturedFrame, ScreenshotAsset, SummaryChapter
from video_summary_cli.screenshot_selector import ScreenshotSelector


DEFAULT_CHAPTER_VISUAL_SPACING_SECONDS = 45.0
LONG_CHAPTER_FULL_SPAN_THRESHOLD_SECONDS = 180.0
MAX_CHAPTER_VISUAL_COUNT = 18
MAX_CHAPTER_CANDIDATE_COUNT = 24
SHORT_CHAPTER_SCENE_BANDS: tuple[tuple[float, int], ...] = (
    (30.0, 1),
    (60.0, 2),
    (90.0, 3),
)


class FrameCaptureBackend(Protocol):
    """截图后端协议。"""

    def capture_frame(self, video_path: Path, timestamp_seconds: float) -> object:
        """从视频指定时间点抓取单帧数据。"""

    def write_frame(self, frame_payload: object, output_path: Path) -> None:
        """把单帧数据落盘。"""


class OpenCvFrameCaptureBackend:
    """基于 OpenCV 的截图实现。"""

    def capture_frame(self, video_path: Path, timestamp_seconds: float) -> object:
        cv2 = _load_cv2()
        capture = cv2.VideoCapture(str(video_path))
        if not capture.isOpened():
            capture.release()
            raise RuntimeError(f"无法打开视频文件：{video_path}")

        try:
            capture.set(cv2.CAP_PROP_POS_MSEC, max(timestamp_seconds, 0.0) * 1000)
            success, frame = capture.read()
            if not success or frame is None:
                raise RuntimeError(f"无法在 {timestamp_seconds:.2f} 秒处截取画面。")
            return frame
        finally:
            capture.release()

    def write_frame(self, frame_payload: object, output_path: Path) -> None:
        cv2 = _load_cv2()
        success, encoded = cv2.imencode(".jpg", frame_payload)
        if not success:
            raise RuntimeError("截图编码失败。")

        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(encoded.tobytes())


class VideoFrameSampler:
    """按固定间隔采样视频帧。"""

    def __init__(
        self,
        screenshot_count: int = 3,
        capture_backend: FrameCaptureBackend | None = None,
        relative_directory: Path | None = None,
    ) -> None:
        self.screenshot_count = screenshot_count
        self.capture_backend = capture_backend or OpenCvFrameCaptureBackend()
        self.relative_directory = relative_directory or Path("img")

    def sample(
        self,
        video_path: Path,
        output_dir: Path,
        duration_seconds: float | None,
    ) -> list[ScreenshotAsset]:
        timestamps = build_sampling_points(
            duration_seconds=duration_seconds,
            screenshot_count=self.screenshot_count,
        )
        if not timestamps:
            return []

        candidates = self.capture_candidates(video_path=video_path, timestamps=timestamps)
        return self.write_screenshots(candidates=candidates, output_dir=output_dir)

    def capture_candidates(self, video_path: Path, timestamps: list[float]) -> list[CapturedFrame]:
        """抓取候选帧到内存。"""

        candidates: list[CapturedFrame] = []
        for timestamp_seconds in timestamps:
            frame_payload = self.capture_backend.capture_frame(video_path, timestamp_seconds)
            candidates.append(
                CapturedFrame(
                    timestamp_seconds=timestamp_seconds,
                    frame_payload=frame_payload,
                )
            )
        return candidates

    def write_screenshots(
        self,
        candidates: list[CapturedFrame],
        output_dir: Path,
    ) -> list[ScreenshotAsset]:
        """把候选帧按顺序写入 img 目录。"""

        output_dir.mkdir(parents=True, exist_ok=True)
        screenshots: list[ScreenshotAsset] = []
        for index, candidate in enumerate(candidates, 1):
            filename = build_screenshot_filename(index, candidate.timestamp_seconds)
            output_path = output_dir / filename
            self.capture_backend.write_frame(candidate.frame_payload, output_path)
            screenshots.append(
                ScreenshotAsset(
                    timestamp_seconds=candidate.timestamp_seconds,
                    relative_path=(self.relative_directory / filename).as_posix(),
                    alt_text=f"关键画面 {index}",
                    ocr_text=candidate.ocr_text,
                    visual_difference_score=candidate.visual_difference_score,
                    text_difference_score=candidate.text_difference_score,
                    blur_score=candidate.blur_score,
                    content_score=candidate.content_score,
                    information_density_score=candidate.information_density_score,
                )
            )
        return screenshots


class SmartVideoFrameSampler(VideoFrameSampler):
    """按更高密度采样后，通过选择器过滤重复截图。"""

    def __init__(
        self,
        screenshot_count: int = 3,
        candidate_multiplier: int = 4,
        chapter_probe_count: int = 5,
        selector: ScreenshotSelector | None = None,
        capture_backend: FrameCaptureBackend | None = None,
        relative_directory: Path | None = None,
    ) -> None:
        super().__init__(
            screenshot_count=screenshot_count,
            capture_backend=capture_backend,
            relative_directory=relative_directory,
        )
        self.candidate_multiplier = max(candidate_multiplier, 1)
        self.chapter_probe_count = max(chapter_probe_count, 1)
        self.selector = selector or ScreenshotSelector()

    def sample(
        self,
        video_path: Path,
        output_dir: Path,
        duration_seconds: float | None,
    ) -> list[ScreenshotAsset]:
        candidate_count = max(self.screenshot_count, self.screenshot_count * self.candidate_multiplier)
        timestamps = build_sampling_points(
            duration_seconds=duration_seconds,
            screenshot_count=candidate_count,
        )
        if not timestamps:
            return []

        candidates = self.capture_candidates(video_path=video_path, timestamps=timestamps)
        selected_candidates = self.selector.select(candidates, screenshot_count=self.screenshot_count)
        annotated_candidates = self._annotate_selected_candidates(selected_candidates)
        return self.write_screenshots(candidates=annotated_candidates, output_dir=output_dir)

    def sample_for_chapters(
        self,
        video_path: Path,
        output_dir: Path,
        chapters: list[SummaryChapter],
        duration_seconds: float | None = None,
    ) -> list[ScreenshotAsset]:
        """围绕章节锚点做局部搜索，保留章节探针图供后续章节绑图挑选主图。"""

        if not chapters:
            return []

        probe_candidates: list[CapturedFrame] = []

        for chapter in chapters:
            target_visual_count = estimate_chapter_visual_count(
                start_seconds=chapter.anchor_start_seconds,
                end_seconds=chapter.anchor_end_seconds,
                base_count=self.chapter_probe_count,
            )
            if target_visual_count <= 0:
                continue

            candidate_probe_count = target_visual_count
            if target_visual_count > self.chapter_probe_count:
                candidate_probe_count = min(
                    MAX_CHAPTER_CANDIDATE_COUNT,
                    max(target_visual_count, target_visual_count * self.candidate_multiplier),
                )

            timestamps = build_chapter_sampling_points(
                start_seconds=chapter.anchor_start_seconds,
                end_seconds=chapter.anchor_end_seconds,
                probe_count=candidate_probe_count,
            )
            if not timestamps:
                continue

            chapter_candidates = self.capture_candidates(video_path=video_path, timestamps=timestamps)
            selected_candidates = self._select_chapter_candidates(
                chapter_candidates=chapter_candidates,
                target_visual_count=target_visual_count,
            )
            probe_candidates.extend(selected_candidates)

        ordered_probe_candidates = sorted(probe_candidates, key=lambda item: item.timestamp_seconds)
        annotated_probe_candidates = self._annotate_selected_candidates(ordered_probe_candidates)
        return self.write_screenshots(candidates=annotated_probe_candidates, output_dir=output_dir)

    def _annotate_selected_candidates(self, candidates: list[CapturedFrame]) -> list[CapturedFrame]:
        """为最终保留的截图补充 OCR 与画面差异信息。"""

        if not candidates:
            return []

        annotated_candidates: list[CapturedFrame] = []
        previous_candidate: CapturedFrame | None = None
        for candidate in candidates:
            annotated_candidate = self._annotate_candidate(candidate, previous_candidate)
            annotated_candidates.append(annotated_candidate)
            previous_candidate = annotated_candidate
        return annotated_candidates

    def _select_chapter_candidates(
        self,
        chapter_candidates: list[CapturedFrame],
        target_visual_count: int,
    ) -> list[CapturedFrame]:
        """按时间桶覆盖整章，再在桶内挑选信息量更高的截图。"""

        ordered_candidates = sorted(chapter_candidates, key=lambda item: item.timestamp_seconds)
        if target_visual_count <= 0:
            return []
        if len(ordered_candidates) <= target_visual_count:
            return ordered_candidates

        annotated_candidates = self._annotate_selected_candidates(ordered_candidates)
        bucket_ranges = _build_bucket_ranges(len(annotated_candidates), target_visual_count)
        selected_candidates: list[CapturedFrame] = []

        for start_index, end_index in bucket_ranges:
            bucket_candidates = annotated_candidates[start_index:end_index]
            if not bucket_candidates:
                continue
            bucket_midpoint_seconds = (
                bucket_candidates[0].timestamp_seconds + bucket_candidates[-1].timestamp_seconds
            ) / 2
            best_candidate = max(
                bucket_candidates,
                key=lambda item: _score_candidate_for_bucket(item, bucket_midpoint_seconds),
            )
            if best_candidate not in selected_candidates:
                selected_candidates.append(best_candidate)

        if len(selected_candidates) < target_visual_count:
            remaining_candidates = [
                candidate
                for candidate in annotated_candidates
                if candidate not in selected_candidates
            ]
            remaining_candidates.sort(
                key=lambda item: _score_candidate_for_bucket(item, item.timestamp_seconds),
                reverse=True,
            )
            for candidate in remaining_candidates:
                selected_candidates.append(candidate)
                if len(selected_candidates) >= target_visual_count:
                    break

        return sorted(selected_candidates, key=lambda item: item.timestamp_seconds)

    def _annotate_candidate(
        self,
        candidate: CapturedFrame,
        previous_candidate: CapturedFrame | None = None,
    ) -> CapturedFrame:
        ocr_text = candidate.ocr_text
        if self.selector.ocr_backend is not None and not ocr_text:
            ocr_text = _normalize_text(self.selector.ocr_backend.extract_text(candidate.frame_payload))

        blur_score = candidate.blur_score
        if self.selector.blur_backend is not None and blur_score <= 0.0:
            blur_score = self.selector.blur_backend.blur_score(candidate.frame_payload)

        information_density_score = candidate.information_density_score
        if information_density_score <= 0.0:
            information_density_score = _estimate_information_density(candidate.frame_payload)

        content_score = candidate.content_score
        if self.selector.content_backend is not None:
            content_score = self.selector.content_backend.content_score(candidate.frame_payload)
        elif content_score <= 0.0:
            content_score = information_density_score

        visual_difference_score = candidate.visual_difference_score
        text_difference_score = candidate.text_difference_score
        if previous_candidate is not None:
            histogram_similarity = self.selector.similarity_backend.histogram_similarity(
                previous_candidate.frame_payload,
                candidate.frame_payload,
            )
            visual_difference_score = _clamp_score(1.0 - histogram_similarity)

            if self.selector.ocr_backend is not None:
                previous_ocr_text = previous_candidate.ocr_text
                if previous_ocr_text and ocr_text:
                    text_difference_score = _clamp_score(
                        1.0 - SequenceMatcher(None, previous_ocr_text, ocr_text).ratio()
                    )
                elif previous_ocr_text or ocr_text:
                    text_difference_score = 1.0

        return CapturedFrame(
            timestamp_seconds=candidate.timestamp_seconds,
            frame_payload=candidate.frame_payload,
            ocr_text=ocr_text,
            visual_difference_score=visual_difference_score,
            text_difference_score=text_difference_score,
            blur_score=blur_score,
            content_score=content_score,
            information_density_score=information_density_score,
        )


def build_sampling_points(duration_seconds: float | None, screenshot_count: int) -> list[float]:
    """按时长等距生成采样点。"""

    if duration_seconds is None or duration_seconds <= 0 or screenshot_count <= 0:
        return []

    interval = duration_seconds / (screenshot_count + 1)
    return [round(interval * index, 2) for index in range(1, screenshot_count + 1)]


def build_chapter_sampling_points(
    start_seconds: float,
    end_seconds: float,
    probe_count: int = 5,
) -> list[float]:
    """围绕章节中点生成局部采样点，尽量避开瞬时弹窗或过渡页。"""

    if probe_count <= 0 or end_seconds <= start_seconds:
        return []

    chapter_span = end_seconds - start_seconds
    adaptive_probe_count = max(
        probe_count,
        min(MAX_CHAPTER_VISUAL_COUNT, ceil(chapter_span / DEFAULT_CHAPTER_VISUAL_SPACING_SECONDS)),
    )
    should_use_full_span_sampling = (
        chapter_span >= LONG_CHAPTER_FULL_SPAN_THRESHOLD_SECONDS
        or adaptive_probe_count > probe_count
        or probe_count <= 3
    )

    if should_use_full_span_sampling:
        effective_probe_count = adaptive_probe_count
        padding_seconds = min(max(chapter_span * 0.04, 4.0), 18.0)
        usable_start_seconds = min(max(start_seconds + padding_seconds, start_seconds), end_seconds)
        usable_end_seconds = max(min(end_seconds - padding_seconds, end_seconds), start_seconds)
        if usable_end_seconds <= usable_start_seconds:
            usable_start_seconds = start_seconds
            usable_end_seconds = end_seconds

        if effective_probe_count == 1:
            return [round((usable_start_seconds + usable_end_seconds) / 2, 2)]

        interval = (usable_end_seconds - usable_start_seconds) / max(effective_probe_count - 1, 1)
        timestamps: list[float] = []
        for index in range(effective_probe_count):
            timestamp = round(usable_start_seconds + interval * index, 2)
            if timestamp not in timestamps:
                timestamps.append(timestamp)
        return timestamps

    chapter_midpoint = (start_seconds + end_seconds) / 2

    if probe_count == 1:
        return [round(chapter_midpoint, 2)]

    half_window = min(max(chapter_span / 10.0, 5.0), 36.0)
    step = (half_window * 2) / max(probe_count - 1, 1)

    timestamps: list[float] = []
    for index in range(probe_count):
        offset = -half_window + step * index
        timestamp = round(min(max(chapter_midpoint + offset, start_seconds), end_seconds), 2)
        if timestamp not in timestamps:
            timestamps.append(timestamp)
    return timestamps


def estimate_chapter_visual_count(
    start_seconds: float,
    end_seconds: float,
    base_count: int = 5,
) -> int:
    """按章节时长估算应该保留的画面数。"""

    chapter_span = end_seconds - start_seconds
    if base_count <= 0 or chapter_span <= 0:
        return 0

    for span_limit_seconds, visual_count in SHORT_CHAPTER_SCENE_BANDS:
        if chapter_span <= span_limit_seconds:
            return min(base_count, visual_count)

    adaptive_count = ceil(chapter_span / DEFAULT_CHAPTER_VISUAL_SPACING_SECONDS)
    return max(base_count, min(MAX_CHAPTER_VISUAL_COUNT, adaptive_count))


def _build_bucket_ranges(total_items: int, bucket_count: int) -> list[tuple[int, int]]:
    if total_items <= 0 or bucket_count <= 0:
        return []

    base_size, remainder = divmod(total_items, bucket_count)
    ranges: list[tuple[int, int]] = []
    start_index = 0
    for index in range(bucket_count):
        current_size = base_size + (1 if index < remainder else 0)
        end_index = start_index + max(current_size, 1)
        ranges.append((start_index, min(end_index, total_items)))
        start_index = end_index
        if start_index >= total_items:
            break
    return ranges


def _score_candidate_for_bucket(
    candidate: CapturedFrame,
    bucket_midpoint_seconds: float,
) -> float:
    timing_penalty = abs(candidate.timestamp_seconds - bucket_midpoint_seconds) / 240.0
    blur_score = candidate.blur_score
    if blur_score > 1.0:
        blur_score = min(blur_score / 2048.0, 1.0)
    blur_score = _clamp_score(blur_score)
    return (
        candidate.content_score * 0.35
        + candidate.information_density_score * 0.2
        + candidate.visual_difference_score * 0.18
        + candidate.text_difference_score * 0.14
        + blur_score * 0.13
        - timing_penalty
    )


def build_screenshot_filename(index: int, timestamp_seconds: float) -> str:
    """生成截图文件名。"""

    return f"frame-{index:03d}-{int(timestamp_seconds):06d}.jpg"


def _normalize_text(text: str) -> str:
    return " ".join(text.split()).strip().lower()


def _clamp_score(score: float) -> float:
    return max(0.0, min(1.0, score))


def _select_best_chapter_candidate(
    chapter: SummaryChapter,
    candidates: list[CapturedFrame],
) -> CapturedFrame | None:
    if not candidates:
        return None

    max_blur_score = max((candidate.blur_score for candidate in candidates), default=0.0)
    return max(
        candidates,
        key=lambda candidate: _score_chapter_candidate(
            chapter=chapter,
            candidate=candidate,
            max_blur_score=max_blur_score,
        ),
    )


def _score_chapter_candidate(
    chapter: SummaryChapter,
    candidate: CapturedFrame,
    max_blur_score: float,
) -> float:
    chapter_midpoint = (chapter.anchor_start_seconds + chapter.anchor_end_seconds) / 2
    chapter_span = max(chapter.anchor_end_seconds - chapter.anchor_start_seconds, 1.0)
    time_distance = abs(candidate.timestamp_seconds - chapter_midpoint)
    time_score = max(0.0, 1.0 - (time_distance / max(chapter_span / 2, 1.0)))
    blur_component = candidate.blur_score / max_blur_score if max_blur_score > 0 else 0.0
    content_component = max(candidate.content_score, candidate.information_density_score)

    if candidate.ocr_text:
        return (
            time_score * 0.28
            + content_component * 0.32
            + blur_component * 0.15
            + candidate.visual_difference_score * 0.15
            + candidate.text_difference_score * 0.10
        )
    return (
        time_score * 0.32
        + content_component * 0.38
        + blur_component * 0.15
        + candidate.visual_difference_score * 0.15
    )


def _estimate_information_density(frame_payload: object) -> float:
    """估算画面信息密度，尽量优先选择教程内容页。"""

    if not hasattr(frame_payload, "shape"):
        return 0.0

    cv2 = _load_cv2()
    grayscale_frame = cv2.cvtColor(frame_payload, cv2.COLOR_BGR2GRAY)
    frame_height, frame_width = grayscale_frame.shape[:2]
    if frame_height <= 1 or frame_width <= 1:
        return 0.0

    top_crop = min(max(int(frame_height * 0.12), 1), frame_height - 1)
    side_crop = min(max(int(frame_width * 0.04), 1), max(frame_width // 2 - 1, 1))
    content_region = grayscale_frame[top_crop:, side_crop : frame_width - side_crop]
    if content_region.size == 0:
        content_region = grayscale_frame

    blurred_region = cv2.GaussianBlur(content_region, (3, 3), 0)
    edges = cv2.Canny(blurred_region, 60, 160)
    edge_density = float(edges.mean() / 255.0)
    variance_score = float(min(content_region.std() / 96.0, 1.0))

    center_top = int(content_region.shape[0] * 0.15)
    center_bottom = max(center_top + 1, int(content_region.shape[0] * 0.85))
    center_left = int(content_region.shape[1] * 0.15)
    center_right = max(center_left + 1, int(content_region.shape[1] * 0.85))
    center_region = content_region[center_top:center_bottom, center_left:center_right]
    center_variance_score = float(min(center_region.std() / 96.0, 1.0)) if center_region.size else variance_score

    return _clamp_score(edge_density * 0.50 + variance_score * 0.25 + center_variance_score * 0.25)


def _load_cv2():
    try:
        import cv2
    except ImportError as exc:  # pragma: no cover - 依赖缺失属于环境问题
        raise RuntimeError(
            "截图快速模式依赖 opencv-python-headless，请先安装 `pip install -e .[media]`。"
        ) from exc
    return cv2

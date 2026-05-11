from video_summary_cli.models import CapturedFrame
from video_summary_cli.screenshot_selector import ScreenshotSelector


class FakeHistogramBackend:
    def __init__(self, similarities: dict[tuple[str, str], float]) -> None:
        self.similarities = similarities

    def histogram_similarity(self, left_frame, right_frame) -> float:
        key = (str(left_frame), str(right_frame))
        reverse_key = (str(right_frame), str(left_frame))
        return self.similarities.get(key, self.similarities.get(reverse_key, 0.0))


class FakeOcrBackend:
    def __init__(self, texts: dict[str, str]) -> None:
        self.texts = texts

    def extract_text(self, frame_payload) -> str:
        return self.texts.get(str(frame_payload), "")


class FakeBlurBackend:
    def __init__(self, scores: dict[str, float]) -> None:
        self.scores = scores

    def blur_score(self, frame_payload) -> float:
        return self.scores.get(str(frame_payload), 0.0)


def _candidate(timestamp_seconds: float, payload: str) -> CapturedFrame:
    return CapturedFrame(
        timestamp_seconds=timestamp_seconds,
        frame_payload=payload,
    )


def test_screenshot_selector_skips_histogram_duplicates() -> None:
    selector = ScreenshotSelector(
        similarity_backend=FakeHistogramBackend(
            {
                ("frame-a", "frame-b"): 0.995,
                ("frame-a", "frame-c"): 0.10,
            }
        ),
        histogram_similarity_threshold=0.99,
    )

    selected = selector.select(
        [_candidate(10.0, "frame-a"), _candidate(20.0, "frame-b"), _candidate(30.0, "frame-c")],
        screenshot_count=3,
    )

    assert [item.timestamp_seconds for item in selected] == [10.0, 30.0]


def test_screenshot_selector_uses_ocr_to_skip_nearly_identical_text() -> None:
    selector = ScreenshotSelector(
        similarity_backend=FakeHistogramBackend(
            {
                ("frame-a", "frame-b"): 0.992,
                ("frame-a", "frame-c"): 0.20,
            }
        ),
        ocr_backend=FakeOcrBackend(
            {
                "frame-a": "第1章 GPIO 初始化",
                "frame-b": "第1章 GPIO 初始化",
                "frame-c": "第2章 定时器中断",
            }
        ),
        histogram_similarity_threshold=0.99,
        text_similarity_threshold=0.95,
    )

    selected = selector.select(
        [_candidate(5.0, "frame-a"), _candidate(10.0, "frame-b"), _candidate(20.0, "frame-c")],
        screenshot_count=3,
    )

    assert [item.timestamp_seconds for item in selected] == [5.0, 20.0]


def test_screenshot_selector_keeps_frames_when_ocr_text_changes() -> None:
    selector = ScreenshotSelector(
        similarity_backend=FakeHistogramBackend(
            {
                ("frame-a", "frame-b"): 0.993,
            }
        ),
        ocr_backend=FakeOcrBackend(
            {
                "frame-a": "主函数流程图",
                "frame-b": "串口状态机流程图",
            }
        ),
        histogram_similarity_threshold=0.99,
        text_similarity_threshold=0.95,
    )

    selected = selector.select(
        [_candidate(15.0, "frame-a"), _candidate(25.0, "frame-b")],
        screenshot_count=2,
    )

    assert [item.timestamp_seconds for item in selected] == [15.0, 25.0]


def test_screenshot_selector_prefers_sharper_frame_for_near_duplicate_text_frames() -> None:
    selector = ScreenshotSelector(
        similarity_backend=FakeHistogramBackend(
            {
                ("frame-a", "frame-b"): 0.994,
            }
        ),
        ocr_backend=FakeOcrBackend(
            {
                "frame-a": "GPIO 初始化",
                "frame-b": "GPIO 初始化",
            }
        ),
        blur_backend=FakeBlurBackend(
            {
                "frame-a": 0.2,
                "frame-b": 0.9,
            }
        ),
        histogram_similarity_threshold=0.99,
        text_similarity_threshold=0.95,
    )

    selected = selector.select(
        [_candidate(10.0, "frame-a"), _candidate(12.0, "frame-b")],
        screenshot_count=2,
    )

    assert [item.timestamp_seconds for item in selected] == [12.0]


def test_screenshot_selector_prefers_sharper_frame_without_ocr_when_histogram_is_close() -> None:
    selector = ScreenshotSelector(
        similarity_backend=FakeHistogramBackend(
            {
                ("frame-a", "frame-b"): 0.993,
            }
        ),
        blur_backend=FakeBlurBackend(
            {
                "frame-a": 0.1,
                "frame-b": 0.8,
            }
        ),
        histogram_similarity_threshold=0.99,
    )

    selected = selector.select(
        [_candidate(30.0, "frame-a"), _candidate(35.0, "frame-b")],
        screenshot_count=2,
    )

    assert [item.timestamp_seconds for item in selected] == [35.0]


def test_screenshot_selector_downsamples_to_single_middle_frame() -> None:
    selector = ScreenshotSelector(
        similarity_backend=FakeHistogramBackend({}),
    )

    selected = selector.select(
        [
            _candidate(10.0, "frame-a"),
            _candidate(20.0, "frame-b"),
            _candidate(30.0, "frame-c"),
        ],
        screenshot_count=1,
    )

    assert [item.timestamp_seconds for item in selected] == [20.0]

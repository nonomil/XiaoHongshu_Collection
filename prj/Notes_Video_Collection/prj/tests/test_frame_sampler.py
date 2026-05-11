from pathlib import Path

from video_summary_cli.frame_sampler import (
    SmartVideoFrameSampler,
    VideoFrameSampler,
    build_sampling_points,
    estimate_chapter_visual_count,
)
from video_summary_cli.models import SummaryChapter
from video_summary_cli.screenshot_selector import ScreenshotSelector


class FakeCaptureBackend:
    def __init__(self) -> None:
        self.calls: list[tuple[Path, float]] = []
        self.saved: list[tuple[object, Path]] = []

    def capture_frame(self, video_path: Path, timestamp_seconds: float) -> object:
        self.calls.append((video_path, timestamp_seconds))
        return f"frame@{timestamp_seconds:.2f}"

    def write_frame(self, frame_payload: object, output_path: Path) -> None:
        self.saved.append((frame_payload, output_path))
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(b"fake-jpeg")


class FakeContentBackend:
    def __init__(self, scores: dict[str, float]) -> None:
        self.scores = scores

    def content_score(self, frame_payload) -> float:
        return self.scores.get(str(frame_payload), 0.0)


class FakeBlurBackend:
    def __init__(self, scores: dict[str, float]) -> None:
        self.scores = scores

    def blur_score(self, frame_payload) -> float:
        return self.scores.get(str(frame_payload), 0.0)


def test_build_sampling_points_returns_evenly_spaced_points() -> None:
    points = build_sampling_points(duration_seconds=120.0, screenshot_count=3)

    assert points == [30.0, 60.0, 90.0]


def test_video_frame_sampler_saves_frames_into_img_directory(tmp_path: Path) -> None:
    backend = FakeCaptureBackend()
    sampler = VideoFrameSampler(screenshot_count=3, capture_backend=backend)
    video_path = tmp_path / "demo.mp4"
    video_path.write_bytes(b"fake-video")

    screenshots = sampler.sample(
        video_path=video_path,
        output_dir=tmp_path / "img",
        duration_seconds=120.0,
    )

    assert [round(item[1], 2) for item in backend.calls] == [30.0, 60.0, 90.0]
    assert [item.relative_path for item in screenshots] == [
        "img/frame-001-000030.jpg",
        "img/frame-002-000060.jpg",
        "img/frame-003-000090.jpg",
    ]
    assert (tmp_path / "img" / "frame-001-000030.jpg").exists()
    assert screenshots[0].alt_text == "关键画面 1"


def test_smart_video_frame_sampler_uses_selector_to_filter_duplicates(tmp_path: Path) -> None:
    backend = FakeCaptureBackend()
    selector = ScreenshotSelector(
        similarity_backend=type(
            "HistBackend",
            (),
            {
                "histogram_similarity": staticmethod(
                    lambda left, right: 0.995 if left != "frame@10.00" and right == "frame@20.00" else 0.1
                )
            },
        )(),
        histogram_similarity_threshold=0.99,
    )
    sampler = SmartVideoFrameSampler(
        screenshot_count=2,
        candidate_multiplier=2,
        selector=selector,
        capture_backend=backend,
    )
    video_path = tmp_path / "demo.mp4"
    video_path.write_bytes(b"fake-video")

    screenshots = sampler.sample(
        video_path=video_path,
        output_dir=tmp_path / "img",
        duration_seconds=40.0,
    )

    assert len(backend.calls) == 4
    assert len(screenshots) == 2


def test_smart_video_frame_sampler_samples_one_informative_frame_per_chapter(tmp_path: Path) -> None:
    backend = FakeCaptureBackend()
    selector = ScreenshotSelector(
        similarity_backend=type(
            "HistBackend",
            (),
            {
                "histogram_similarity": staticmethod(lambda left, right: 0.1),
            },
        )(),
        blur_backend=FakeBlurBackend(
            {
                "frame@40.00": 0.1,
                "frame@45.00": 0.3,
                "frame@50.00": 0.2,
                "frame@55.00": 0.4,
                "frame@60.00": 0.2,
                "frame@140.00": 0.1,
                "frame@145.00": 0.2,
                "frame@150.00": 0.2,
                "frame@155.00": 0.4,
                "frame@160.00": 0.1,
            }
        ),
        content_backend=FakeContentBackend(
            {
                "frame@40.00": 0.10,
                "frame@45.00": 0.20,
                "frame@50.00": 0.85,
                "frame@55.00": 0.30,
                "frame@60.00": 0.15,
                "frame@140.00": 0.10,
                "frame@145.00": 0.25,
                "frame@150.00": 0.20,
                "frame@155.00": 0.90,
                "frame@160.00": 0.10,
            }
        ),
    )
    sampler = SmartVideoFrameSampler(
        screenshot_count=2,
        selector=selector,
        capture_backend=backend,
    )
    video_path = tmp_path / "demo.mp4"
    video_path.write_bytes(b"fake-video")
    chapters = [
        SummaryChapter(
            title="章节一",
            goal="目标一",
            key_points=["要点一", "要点二"],
            example_or_case="案例一",
            caution="注意一",
            anchor_start_seconds=0.0,
            anchor_end_seconds=100.0,
        ),
        SummaryChapter(
            title="章节二",
            goal="目标二",
            key_points=["要点一", "要点二"],
            example_or_case="案例二",
            caution="注意二",
            anchor_start_seconds=100.0,
            anchor_end_seconds=200.0,
        ),
    ]

    screenshots = sampler.sample_for_chapters(
        video_path=video_path,
        output_dir=tmp_path / "img",
        duration_seconds=200.0,
        chapters=chapters,
    )

    screenshot_by_timestamp = {round(item.timestamp_seconds, 2): item for item in screenshots}

    assert 50.0 in screenshot_by_timestamp
    assert 155.0 in screenshot_by_timestamp
    assert screenshot_by_timestamp[50.0].content_score == 0.85
    assert screenshot_by_timestamp[155.0].content_score == 0.9
    assert len(backend.saved) >= 2


def test_smart_video_frame_sampler_samples_multiple_probes_per_chapter(tmp_path: Path) -> None:
    backend = FakeCaptureBackend()
    selector = ScreenshotSelector(
        similarity_backend=type(
            "HistBackend",
            (),
            {
                "histogram_similarity": staticmethod(lambda left, right: 0.1)
            },
        )(),
    )
    sampler = SmartVideoFrameSampler(
        screenshot_count=2,
        chapter_probe_count=3,
        selector=selector,
        capture_backend=backend,
    )
    video_path = tmp_path / "demo.mp4"
    video_path.write_bytes(b"fake-video")
    chapters = [
        SummaryChapter(
            title="章节一",
            goal="目标一",
            key_points=["要点一", "要点二"],
            example_or_case="案例一",
            caution="注意一",
            anchor_start_seconds=0.0,
            anchor_end_seconds=90.0,
        ),
        SummaryChapter(
            title="章节二",
            goal="目标二",
            key_points=["要点一", "要点二"],
            example_or_case="案例二",
            caution="注意二",
            anchor_start_seconds=90.0,
            anchor_end_seconds=180.0,
        ),
        SummaryChapter(
            title="章节三",
            goal="目标三",
            key_points=["要点一", "要点二"],
            example_or_case="案例三",
            caution="注意三",
            anchor_start_seconds=180.0,
            anchor_end_seconds=270.0,
        ),
    ]

    screenshots = sampler.sample_for_chapters(
        video_path=video_path,
        output_dir=tmp_path / "img",
        chapters=chapters,
    )

    assert [round(item[1], 2) for item in backend.calls] == [
        4.0,
        45.0,
        86.0,
        94.0,
        135.0,
        176.0,
        184.0,
        225.0,
        266.0,
    ]
    assert len(screenshots) == 9
    assert {45.0, 135.0, 225.0}.issubset({item.timestamp_seconds for item in screenshots})


def test_build_chapter_sampling_points_expands_for_long_chapter_span() -> None:
    from video_summary_cli.frame_sampler import build_chapter_sampling_points

    timestamps = build_chapter_sampling_points(
        start_seconds=0.0,
        end_seconds=492.0,
        probe_count=5,
    )

    assert len(timestamps) > 5
    assert timestamps[0] < 80.0
    assert timestamps[-1] > 400.0


def test_build_chapter_sampling_points_spreads_requested_probes_across_long_chapter() -> None:
    from video_summary_cli.frame_sampler import build_chapter_sampling_points

    timestamps = build_chapter_sampling_points(
        start_seconds=0.0,
        end_seconds=300.0,
        probe_count=12,
    )

    assert len(timestamps) == 12
    assert timestamps[0] < 40.0
    assert timestamps[-1] > 260.0
    gaps = [round(timestamps[index + 1] - timestamps[index], 2) for index in range(len(timestamps) - 1)]
    assert max(gaps) < 35.0


def test_build_chapter_sampling_points_spreads_three_probes_across_full_short_chapter() -> None:
    from video_summary_cli.frame_sampler import build_chapter_sampling_points

    timestamps = build_chapter_sampling_points(
        start_seconds=0.0,
        end_seconds=90.0,
        probe_count=3,
    )

    assert timestamps == [4.0, 45.0, 86.0]


def test_estimate_chapter_visual_count_reduces_short_chapter_probe_density() -> None:
    assert estimate_chapter_visual_count(0.0, 23.0, base_count=5) == 1
    assert estimate_chapter_visual_count(0.0, 42.0, base_count=5) == 2
    assert estimate_chapter_visual_count(0.0, 77.0, base_count=5) == 3


def test_smart_video_frame_sampler_expands_medium_long_chapter_output_count(tmp_path: Path) -> None:
    backend = FakeCaptureBackend()
    selector = ScreenshotSelector(
        similarity_backend=type(
            "HistBackend",
            (),
            {
                "histogram_similarity": staticmethod(lambda left, right: 0.1)
            },
        )(),
        histogram_similarity_threshold=0.99,
    )
    sampler = SmartVideoFrameSampler(
        screenshot_count=3,
        chapter_probe_count=5,
        candidate_multiplier=2,
        selector=selector,
        capture_backend=backend,
    )
    video_path = tmp_path / "demo.mp4"
    video_path.write_bytes(b"fake-video")
    chapters = [
        SummaryChapter(
            title="章节一",
            goal="目标一",
            key_points=["要点一", "要点二"],
            example_or_case="案例一",
            caution="注意一",
            anchor_start_seconds=0.0,
            anchor_end_seconds=240.0,
        ),
    ]

    screenshots = sampler.sample_for_chapters(
        video_path=video_path,
        output_dir=tmp_path / "img",
        chapters=chapters,
    )

    screenshot_timestamps = [item.timestamp_seconds for item in screenshots]
    assert len(screenshot_timestamps) > 5
    assert min(screenshot_timestamps) < 40.0
    assert max(screenshot_timestamps) > 200.0

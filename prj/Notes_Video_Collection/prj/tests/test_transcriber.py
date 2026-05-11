from video_summary_cli.transcriber import normalize_transcribed_segments


class FakeChunk:
    def __init__(self, start: float, end: float, text: str) -> None:
        self.start = start
        self.end = end
        self.text = text


def test_normalize_transcribed_segments_filters_empty_text() -> None:
    chunks = [
        FakeChunk(0.0, 1.0, " 第一段 "),
        FakeChunk(1.0, 2.0, " "),
    ]

    segments = normalize_transcribed_segments(chunks)

    assert len(segments) == 1
    assert segments[0].text == "第一段"

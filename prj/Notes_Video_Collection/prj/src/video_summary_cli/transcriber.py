from __future__ import annotations

from pathlib import Path

from video_summary_cli.models import TranscriptSegment


def normalize_transcribed_segments(chunks) -> list[TranscriptSegment]:
    """把 ASR 返回片段规范化为统一结构。"""

    segments: list[TranscriptSegment] = []
    for chunk in chunks:
        text = str(getattr(chunk, "text", "")).strip()
        if not text:
            continue
        segments.append(
            TranscriptSegment(
                start_seconds=float(getattr(chunk, "start", 0.0) or 0.0),
                end_seconds=float(getattr(chunk, "end", 0.0) or 0.0),
                text=text,
            )
        )
    return segments


class FasterWhisperTranscriber:
    """基于 faster-whisper 的本地 ASR 转写器。"""

    def __init__(
        self,
        model_size: str = "tiny",
        device: str = "cpu",
        compute_type: str = "int8",
    ) -> None:
        self.model_size = model_size
        self.device = device
        self.compute_type = compute_type
        self._model = None

    def transcribe(self, audio_path: Path) -> list[TranscriptSegment]:
        model = self._get_model()
        segments, _ = model.transcribe(str(audio_path), vad_filter=True)
        return normalize_transcribed_segments(segments)

    def _get_model(self):
        if self._model is None:
            try:
                from faster_whisper import WhisperModel
            except ImportError as exc:  # pragma: no cover - 依赖缺失时的运行期保护
                raise RuntimeError(
                    "未安装 faster-whisper，无法执行本地 ASR。请先安装 `faster-whisper`。"
                ) from exc
            self._model = WhisperModel(
                self.model_size,
                device=self.device,
                compute_type=self.compute_type,
            )
        return self._model


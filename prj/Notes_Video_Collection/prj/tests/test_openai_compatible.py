from video_summary_cli.models import TranscriptSegment, VideoMetadata, VideoPlatform


class FakeTransport:
    def __init__(self, payload):
        self.payload = payload
        self.requests = []

    def create_completion(self, endpoint_url, api_key, payload):
        self.requests.append(
            {
                "endpoint_url": endpoint_url,
                "api_key": api_key,
                "payload": payload,
            }
        )
        return self.payload


def build_metadata() -> VideoMetadata:
    return VideoMetadata(
        source_url="https://b23.tv/example",
        canonical_url="https://www.bilibili.com/video/BV1demo?p=1",
        title="AI 学习方法",
        uploader="测试作者",
        description="测试简介",
        video_id="BV1demo",
        platform=VideoPlatform.BILIBILI,
    )


def build_segments() -> list[TranscriptSegment]:
    return [
        TranscriptSegment(start_seconds=0.0, end_seconds=6.0, text="先明确学习目标。"),
        TranscriptSegment(start_seconds=6.0, end_seconds=12.0, text="再拆解关键问题。"),
        TranscriptSegment(start_seconds=12.0, end_seconds=18.0, text="最后通过输出巩固理解。"),
    ]


def test_openai_compatible_summarizer_prefers_remote_result() -> None:
    from video_summary_cli.openai_compatible import (
        OpenAICompatibleConfig,
        OpenAICompatibleSummarizer,
    )

    transport = FakeTransport(
        {
            "choices": [
                {
                    "message": {
                        "content": (
                            '{"abstract":"这是 AI 生成的摘要。",'
                            '"bullets":["先明确学习目标","再拆解关键问题","通过输出巩固理解"]}'
                        )
                    }
                }
            ]
        }
    )
    summarizer = OpenAICompatibleSummarizer(
        config=OpenAICompatibleConfig(
            enabled=True,
            base_url="https://example.com/v1",
            api_key="demo-key",
            model="demo-model",
        ),
        transport=transport,
    )

    abstract, bullets = summarizer.summarize(build_metadata(), build_segments())

    assert abstract == "这是 AI 生成的摘要。"
    assert bullets == ["先明确学习目标", "再拆解关键问题", "通过输出巩固理解"]
    assert summarizer.last_result_source == "openai-compatible"
    assert transport.requests[0]["endpoint_url"] == "https://example.com/v1/chat/completions"


def test_openai_compatible_summarizer_falls_back_to_extractive_when_payload_is_invalid() -> None:
    from video_summary_cli.openai_compatible import (
        OpenAICompatibleConfig,
        OpenAICompatibleSummarizer,
    )

    summarizer = OpenAICompatibleSummarizer(
        config=OpenAICompatibleConfig(
            enabled=True,
            base_url="https://example.com/v1",
            api_key="demo-key",
            model="demo-model",
        ),
        transport=FakeTransport(
            {
                "choices": [
                    {
                        "message": {
                            "content": "not-json"
                        }
                    }
                ]
            }
        ),
    )

    abstract, bullets = summarizer.summarize(build_metadata(), build_segments())

    assert abstract
    assert bullets
    assert summarizer.last_result_source == "extractive-fallback"

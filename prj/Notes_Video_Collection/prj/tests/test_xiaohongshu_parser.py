from video_summary_cli.xiaohongshu_parser import (
    XiaohongshuParserError,
    parse_xiaohongshu_video_page,
)


SAMPLE_VIDEO_HTML = """
<html>
  <head>
    <title>沉浸式编程工作流 - 小红书</title>
    <script>
      window.__INITIAL_STATE__={"note":{"noteDetailMap":{"680f14630000000021011b0e":{"note":{
        "type":"video",
        "title":"沉浸式编程工作流",
        "desc":"用 AI 改造工作流的完整演示",
        "time":1745212800000,
        "user":{"nickname":"测试作者"},
        "tagList":[{"name":"AI工作流"},{"name":"沉浸式编程"}],
        "video":{
          "consumer":{"originVideoKey":"demo-key"},
          "media":{"stream":{
            "h264":[{"masterUrl":"https://sns-video-bd.xhscdn.com/demo-video.m3u8"}],
            "h265":[{"masterUrl":"https://sns-video-bd.xhscdn.com/demo-video-h265.m3u8"}]
          }}
        }
      }}}}};
    </script>
  </head>
  <body></body>
</html>
"""


def test_parse_xiaohongshu_video_page_extracts_core_fields() -> None:
    page = parse_xiaohongshu_video_page(
        html=SAMPLE_VIDEO_HTML,
        source_url="https://www.xiaohongshu.com/explore/680f14630000000021011b0e?xsec_token=demo",
    )

    assert page.note_id == "680f14630000000021011b0e"
    assert page.title == "沉浸式编程工作流"
    assert page.description == "用 AI 改造工作流的完整演示"
    assert page.uploader == "测试作者"
    assert page.canonical_url == "https://www.xiaohongshu.com/explore/680f14630000000021011b0e"
    assert page.video_url == "https://sns-video-bd.xhscdn.com/demo-video.m3u8"
    assert page.tags == ["AI工作流", "沉浸式编程"]


def test_parse_xiaohongshu_video_page_normalizes_xhslink_to_official_domain() -> None:
    page = parse_xiaohongshu_video_page(
        html=SAMPLE_VIDEO_HTML,
        source_url="http://xhslink.com/o/AzAqWIsKgst",
    )

    assert page.canonical_url == "https://www.xiaohongshu.com/explore/680f14630000000021011b0e"


def test_parse_xiaohongshu_video_page_rejects_non_video_note() -> None:
    html = SAMPLE_VIDEO_HTML.replace('"type":"video"', '"type":"normal"')

    try:
        parse_xiaohongshu_video_page(
            html=html,
            source_url="https://www.xiaohongshu.com/explore/680f14630000000021011b0e",
        )
    except XiaohongshuParserError as exc:
        assert "不是视频笔记" in str(exc)
    else:  # pragma: no cover - 测试护栏
        raise AssertionError("非视频笔记应抛出解析错误")


def test_parse_xiaohongshu_video_page_reports_empty_note_detail() -> None:
    html = """
    <html>
      <head>
        <script>
          window.__INITIAL_STATE__={"note":{"noteDetailMap":{"null":{"note":{}}}}};
        </script>
      </head>
      <body></body>
    </html>
    """

    try:
        parse_xiaohongshu_video_page(
            html=html,
            source_url="https://www.xiaohongshu.com/explore/6851469a0000000021005ebe",
        )
    except XiaohongshuParserError as exc:
        assert "页面详情为空" in str(exc)
    else:  # pragma: no cover - 测试护栏
        raise AssertionError("空详情页应抛出解析错误")

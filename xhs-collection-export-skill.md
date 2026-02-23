# Skill: xhs-collection-export
> 小红书收藏夹导出到本地 Markdown
> 版本：v1.0 | 首次生成：手动创建模板，后续由 Claude 自动更新

---

## Skill 说明

当用户说以下任意一种话时，自动调用本 Skill：
- "帮我导出小红书收藏"
- "把小红书收藏夹存到 Obsidian"
- "导出我的小红书"
- "小红书收藏夹同步"

---

## 执行参数（可由用户覆盖）

```yaml
output_path: "D:/Obsidian/小红书收藏/"
max_scroll_wait: 1.5        # 每次滚动等待秒数
max_notes_per_board: 200    # 单专辑最大抓取条数（防止无限循环）
generate_summary: true      # 是否 AI 生成摘要
extract_location: true      # 是否提取地点信息
skip_short_notes: false     # 是否跳过正文<50字的笔记
```

---

## 小红书链接识别规则

⚠️ 这是血泪踩坑经验，每次执行必须遵守：

```
✅ 有效笔记链接：
   https://www.xiaohongshu.com/discovery/item/{noteId}

✅ 收藏夹内部链接：
   https://www.xiaohongshu.com/board/{boardId}

❌ 无效，跳过：
   /explore/...        （页面导航）
   /user/profile/...   （用户主页）
   /search_result/...  （搜索页）
```

**规则：提取链接后必须验证格式，不假设正确，点开一条确认后再批量处理。**

---

## 核心执行流程

```python
# 伪代码，供 Claude 参考执行逻辑

def export_xhs_collections():
    # 1. 检查登录态
    navigate("https://www.xiaohongshu.com")
    if not is_logged_in():
        pause("请先登录小红书，完成后告诉我")

    # 2. 获取所有专辑
    boards = get_all_boards()  # 导航到收藏页，提取专辑列表

    # 3. 逐专辑处理
    for board in boards:
        notes = scroll_and_extract(board, wait=1.5)
        for note in notes:
            content = fetch_note_detail(note.url)
            md = format_as_markdown(content)
            save_to_file(
                path=f"{OUTPUT_PATH}/{board.name}/{note.title}.md",
                content=md
            )
        report_progress(board.name, len(notes))

    # 4. 更新 Skill 文件
    update_skill_with_learnings()
```

---

## Markdown 文件模板

```markdown
---
title: "{title}"
source: "https://www.xiaohongshu.com/discovery/item/{noteId}"
author: "{authorName}"
author_url: "https://www.xiaohongshu.com/user/profile/{authorId}"
collection: "{boardName}"
saved_date: "{date}"
summary: "{AI生成的一句话摘要}"
location: "{地点，无则留空}"
tags: [小红书, {话题标签列表}]
short_note: {true/false}
---

{正文内容}

---
*来源：小红书 [@{authorName}]({authorUrl})*
```

---

## 异常处理经验

| 异常 | 原因 | 解决方式 |
|------|------|---------|
| 验证码弹出 | 滚动太快被检测 | 暂停等用户处理；增加等待时间到 2.5s |
| 笔记内容为空 | JS 未渲染完 | 等待 2s 后重试一次 |
| 链接提取错误 | 拿到了导航链接 | 严格校验 `/discovery/item/` 格式 |
| 专辑列表不完整 | 页面懒加载 | 滚动到底部后再提取 |
| 文件名非法字符 | 标题含 `/ \ : * ? " < > \|` | 全部替换为 `_` |
| 重复导出 | 同一笔记在多个专辑 | 检查 source URL 去重 |

---

## 学习记录

> ⚠️ 以下部分由 Claude 在每次执行后自动追加，记录新发现的规律和踩过的坑

### v1.0（模板初始化）
- 建立基础链接识别规则
- 确定 Markdown 输出格式

### [后续版本由 Claude 自动填写]
- 每次执行完成后，Claude 将新发现的 CSS 选择器、API 响应结构、踩坑经验追加到这里
- 格式：`### v1.x（日期）` + 具体学习内容

---

## 调用示例

用户说：**"帮我导出小红书收藏"**

Claude 执行：
1. 读取本 Skill 文件
2. 确认输出路径
3. 提示用户登录
4. 按流程执行
5. 完成后更新本文件的"学习记录"部分

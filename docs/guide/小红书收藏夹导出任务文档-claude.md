# 小红书收藏夹导出到 Obsidian

## 你的任务

把我小红书所有收藏专辑（Boards）里的笔记，按专辑名分类，导出为 Obsidian Markdown 文件保存到本地。

---

## 执行前：加载 Skill

首先检查以下路径是否存在 Skill 文件：

```
G:/UserCode/XiaoHongshu_Collection/xhs-collection-export.md
```

- **如果存在**：读取它，优先按 Skill 里的经验执行，跳过摸索阶段
- **如果不存在**：按本文档流程执行，完成后生成该 Skill 文件

---

## 环境信息

- 操作系统：Windows
- 输出路径：`D:/Obsidian/小红书收藏/`（不存在则自动创建）
- 工具：Chrome DevTools Protocol（CDP）控制 Chrome 浏览器

---

## 前置准备

我来做，你来确认：
1. 打开 Chrome，手动登录小红书：https://www.xiaohongshu.com
2. 登录成功后告诉我，我开始执行

---

按顺序做这三步：
第一步：彻底关掉所有 Chrome
打开 PowerShell（Win键搜"PowerShell"），粘贴运行：
powershelltaskkill /F /IM chrome.exe
第二步：用调试模式重新启动 Chrome
同一个 PowerShell 窗口，继续运行：
powershell& "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\ChromeDebug"

加了 --user-data-dir 是为了避免和你日常 Chrome 的数据冲突，用一个干净的独立窗口

第三步：在这个新 Chrome 里登录小红书
登录完成后回到 Claude Code 告诉它"已登录，继续"。

## 执行步骤

### Step 1：获取所有收藏专辑列表

- 导航到收藏页：`https://www.xiaohongshu.com/user/profile/[uid]/collect`
- 识别所有专辑名称和链接
- 链接识别规则（血泪经验，必须遵守）：
  - `/board/` = 收藏夹内部 ✅
  - `/discovery/item/` = 可分享笔记链接 ✅
  - `/explore/` = 页面导航，跳过 ❌
  - 提取后必须点开验证，不假设格式正确

### Step 2：逐专辑提取笔记

每个专辑：
- 滚动加载全部笔记（每次滚动等 1.5 秒，防风控）
- 提取每条笔记：标题、正文、链接、作者、时间、图片链接、话题标签

### Step 3：整理内容

每条笔记保存前：
- 生成一句话摘要 → `summary`
- 清理多余空行和乱码
- 探店/地点类笔记尝试提取地点 → `location`
- 正文少于 50 字标记 → `short_note: true`

### Step 4：写入 Markdown

**目录结构：**
```
D:/Obsidian/小红书收藏/
  ├── 美食探店/
  ├── 旅行攻略/
  ├── 穿搭灵感/
  └── 未分类/
```

**每个文件格式：**
```markdown
---
title: "笔记标题"
source: "https://www.xiaohongshu.com/discovery/item/xxxxxx"
author: "作者昵称"
collection: "所属专辑"
saved_date: "2025-01-01"
summary: "一句话概括"
location: "地点（如有）"
tags: [小红书, 话题标签]
short_note: false
---

正文内容...

---
*来源：小红书 [@作者](作者主页链接)*
```

---

## 异常处理

| 情况 | 处理 |
|------|------|
| 验证码/滑块 | 暂停，提示我处理后继续 |
| 笔记加载失败 | 跳过，记入 `_失败列表.md` |
| 标题含特殊字符 | 替换为下划线 |
| 重复笔记 | 跳过 |

---

## 进度汇报

每完成一个专辑报告：专辑名 / 成功条数 / 失败条数

全部完成后汇总：总专辑数、总笔记数、输出路径、失败列表

---

## 完成后：生成 Skill 文件

任务跑完后，把本次经验写入：
`D:/ClaudeSkills/xhs-collection-export.md`

格式见《xhs-collection-export Skill 文件》（另一个文档）。

---

## 开始

读完后回复"准备就绪"，等我完成登录。

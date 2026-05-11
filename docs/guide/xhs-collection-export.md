# xhs-collection-export Skill

## 概述
从小红书收藏专辑中提取笔记，按专辑分类导出为 Obsidian Markdown 文件。

## 前置条件
- Chrome 以 `--remote-debugging-port=9222` 启动（必须先 taskkill 所有 Chrome 进程）
- 建议加 `--user-data-dir="C:\ChromeDebug"` 避免与日常 Chrome 冲突
- 用户已在该 Chrome 中登录小红书

## 关键经验（血泪教训）

### 链接类型识别
- `/board/` = 收藏夹/专辑页面 ✅
- `/discovery/item/` = 可分享笔记链接 ✅
- `/explore/` = 页面导航链接，直接访问会 403/404 ❌
- `/explore/` 链接必须带 `xsec_token` 参数才能访问

### CDP 连接
- 必须先 `taskkill /F /IM chrome.exe` 再启动，否则调试端口不生效
- 用 `http://localhost:9222/json/version` 验证连接
- PowerShell 中执行外部程序需要加 `&` 前缀

### 笔记提取方式（核心）
- ❌ 直接访问 `/explore/` 链接 → 被安全机制拦截（error_code=300031）
- ❌ 直接调用 XHS 内部 API → 需要签名（X-s/X-t），fetch 会返回非 JSON
- ✅ 正确方式：在 board 页面用 CDP `Input.dispatchMouseEvent` 模拟鼠标点击笔记卡片
  - 点击后页面 URL 变为 `/explore/xxx?xsec_token=xxx`（自动带 token）
  - 页面会渲染笔记详情（modal 或全页）
  - 从渲染后的页面 DOM 提取内容

### DOM 选择器
- 标题: `#detail-title` 或 `[class*="detail"] [class*="title"]`
- 正文: `#detail-desc` 或 `[class*="detail"] [class*="desc"]`
- 作者: `[class*="detail"] [class*="name"]`（注意去掉末尾"关注"二字）
- 日期: `[class*="detail"] [class*="date"]`
- 标签: `a[href*="keyword="]`
- 图片: `[class*="slider"] img, [class*="swiper"] img`
- Modal 检测: `[class*="note-detail"], [class*="mask-paper"]`

## 执行流程

### Step 1: 验证 CDP 连接
```js
http.get('http://localhost:9222/json/version', ...)
```

### Step 2: 获取用户 UID
- 在小红书页面执行 JS 查找 `a[href*="/user/profile/"]` 获取 profileLink
- 从中提取 UID

### Step 3: 获取收藏专辑列表
- 导航到 `https://www.xiaohongshu.com/user/profile/{UID}`
- 点击"收藏"标签，再点击"专辑"子标签
- URL 变为 `?tab=fav&subTab=board`
- 提取所有 `a[href*="/board/"]` 链接

### Step 4: 逐专辑提取笔记
- 导航到 board 页面
- 获取所有 `section` 元素的位置坐标
- 用 `Input.dispatchMouseEvent` 模拟点击每个卡片
- 等待 3.5 秒让页面渲染
- 从 DOM 提取笔记详情
- 按 Escape 关闭弹窗，回到 board 页面继续下一条
- 每条笔记间隔 1.5-3 秒（防风控）

### Step 5: 写入 Markdown
- 目录结构: `output/{专辑名}/{笔记标题}.md`
- 清理: 作者去掉"关注"后缀，正文去掉重复标题和末尾标签行
- Frontmatter 包含: title, source, author, collection, saved_date, summary, tags, short_note

## 防风控策略
- 每次滚动/翻页间隔 1.5 秒以上
- 笔记间加随机延迟 1.5-3 秒
- 不并发请求
- 遇到验证码暂停等用户处理

## 依赖
- Node.js
- npm 包: `ws`（WebSocket 客户端）、`tesseract.js`（本地 OCR）

### Step 6: 图片 OCR 识别
- 小红书笔记大量内容在图片中，必须 OCR 提取文字
- 使用 Tesseract.js 本地识别，语言 `chi_sim+eng`
- 只处理内容图片（URL 含 `spectrum/` 或 `notes_pre_post/`），跳过头像等
- OCR 后必须清理文字（见下方清理规则）

### OCR 文字清理规则（关键经验）
Tesseract 识别中文会产生大量噪声，必须后处理：
1. 去除中文字符间多余空格：`/([\u4e00-\u9fff])\s+([\u4e00-\u9fff])/g` → `$1$2`（需执行两次，处理重叠匹配）
2. 去除中文与标点间空格：`/([\u4e00-\u9fff])\s+([，。、；：！？])/g`
3. 保留英文单词间空格（2+ 字符的英文词）
4. 行首 `。` 转为列表符 `- `（Tesseract 把列表圆点识别为句号）
5. 修复双句号 `。。` → `。`
6. 不要把所有 `.` 替换为 `。`，会破坏英文文件名、URL、版本号

## 文件结构
```
src/           # 源代码脚本
output/        # Markdown 输出 + raw_notes.json
output/_images # OCR 用的下载图片
```

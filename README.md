# 小红书收藏夹导出与整理

把小红书收藏夹导出为本地 Markdown，并支持 OCR + AI 自动摘要/标签。

## 统一任务管线（当前架构）
核心流程统一为：`input -> fetch -> enrich -> write -> report`。

- **input**：将 CLI / UI 输入规范化为任务对象
- **fetch**：从 Chrome/CDP 抓取笔记或收藏数据
- **enrich**：评论提炼 / OCR / AI 摘要等增强（失败时允许退化）
- **write**：落盘 Markdown 与评论归档
- **report**：生成统一 report（UI 输出 JSON，CLI 输出 summary）

## 快速开始（最短流程）

### 1) 准备环境
- Windows
- Node.js（已安装）
- Chrome（使用 CDP 调试端口）

### 2) 启动 Chrome（CDP 模式）
```powershell
# 关闭所有 Chrome
taskkill /F /IM chrome.exe

# 以调试模式启动
& "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\ChromeDebug"
```
在新打开的 Chrome 中登录小红书。

### 2.1) Chrome 146+ 复用当前浏览器（实验增强）
如果你已经在日常使用的 Chrome 146+ 里登录好了，也可以直接复用当前会话：

1. 在地址栏打开 `chrome://inspect/#remote-debugging`
2. 打开 Remote debugging
3. 保持目标小红书页面处于当前浏览器中
4. 执行单笔记保存时加上：

```powershell
node scripts/save_note.js --browser-mode current-browser https://www.xiaohongshu.com/explore/abc123
```

可选参数：

- `--browser-channel stable|beta|canary`
- `--browser-url http://127.0.0.1:9222`

说明：

- `current-browser` 更适合单条保存、调试、人工预热评论后继续抓取
- 收藏夹批量导出默认仍建议使用隔离调试浏览器
- 当前浏览器模式主要改善登录态复用，不会自动修复评论懒加载、风控或接口限流

### 2.2) 项目自己保存登录态，后续后台复用（推荐）
如果你不想每次手动开调试 Chrome，也不想依赖导出 cookies 插件，现在可以直接用项目自己的独立 profile：

```powershell
# 第一次：打开项目登录浏览器
node scripts/login_browser.js
```

说明：

1. 会自动打开一个项目专用 Chrome 会话
2. 登录态保存在 `./.cache/chrome-debug/`
3. 登录完成后，直接关闭这个浏览器窗口即可

后续单条保存可直接复用同一登录态：

```powershell
# 默认仍是有头模式
node scripts/save_note.js https://www.xiaohongshu.com/explore/abc123

# 需要后台运行时，可开启无头模式（实验）
node scripts/save_note.js --browser-headless https://mp.weixin.qq.com/s/demo
```

补充说明：

- `--browser-headless` 目前主要对项目专用隔离浏览器生效
- 更适合“首次人工登录一次，后面后台跑链接保存”的日常流程
- 遇到验证码、评论风控、账号异常时，仍可能需要切回有头模式人工处理
- UI 设置页也新增了“打开项目登录浏览器”和“后台无头运行（实验）”

### 3) 抓取与导出
```powershell
# 抓取收藏夹（示例使用 extract_v4）
node scripts/extract_v4.js

# OCR + 生成 Markdown
node scripts/ocr_and_write.js
```

输出文件会生成在 `output/{昵称_uid}/`。

## 主要入口
- 单笔记保存（CLI）：`node scripts/save_note.js <笔记链接>`、`node scripts/save_note.js --current`
- 单笔记保存（项目登录态复用）：`node scripts/login_browser.js` 后，再执行 `node scripts/save_note.js --browser-headless <链接>`
- 单笔记保存（当前浏览器增强）：`node scripts/save_note.js --browser-mode current-browser <笔记链接>`
- 知乎收藏夹导出（实验 CLI）：`node scripts/save_zhihu_favorites.js <收藏夹链接> --cookie "<知乎 Cookie>"`
- Pushbullet 收件箱同步：`npm run inbox:sync -- --mode recent --limit 50`
- 统一 ingress 立即执行：`POST /api/ingress/save-link`
- 统一 ingress 仅入队：`POST /api/ingress/enqueue-link`
- 飞书 webhook 入队：`POST /api/ingress/webhook/feishu`
- 收件箱双库核对：`npm run inbox:verify -- --limit 50`
- 收藏夹导出（CLI）：`node scripts/extract_v4.js` + `node scripts/ocr_and_write.js`
- UI 入口：运行 `启动小红书保存入口.bat`，浏览器访问 `http://127.0.0.1:3030/`

## 实验功能：知乎收藏夹导出（CLI）

当前已经有一个第一阶段 CLI，可用于把知乎收藏夹里的文章 / 回答 URL 收集出来，并复用现有单篇保存链路逐条写入本地目录。

最小用法：

```powershell
node scripts/save_zhihu_favorites.js https://www.zhihu.com/collection/123456789 --cookie "d_c0=..."
```

如果你没有手工传 `--cookie`，CLI 现在会自动按下面优先级尝试拿知乎登录态：

1. `ZHIHU_COOKIE` 环境变量
2. 项目自己的 Chrome 调试会话（`node scripts/login_browser.js` 打开并登录过）
3. 当前普通 Chrome 会话（Chrome 146+ 开启 `chrome://inspect/#remote-debugging`）

如果收藏夹标题没有手工传 `--title`，CLI 也会自动请求收藏夹页面并探测标题；失败时再回退为 `收藏夹 <id>`。

可选参数：

- `--title "AI 收藏"`：指定导出目录名，默认使用 `收藏夹 <id>`
- `--output-root G:\UserCode\XiaoHongshu_Collection\output`：指定输出根目录
- `--limit 10`：指定每页抓取数量

当前状态：

- 已支持收藏夹 URL 识别
- 已支持分页 URL 构造、响应归一化、进度文件持久化
- 已支持失败页 warning 记录和按页续跑
- 已支持从活动 Chrome 会话自动提取知乎 Cookie
- 已支持自动探测收藏夹标题
- UI 入口还在下一阶段

## Pushbullet 收件箱同步与双库核对

如果你想直接验证“最近 N 条里的公众号 / 知乎链接，是否同时写入了分类库和总库镜像”，现在可以直接使用两条命令：

```powershell
# 首次全量补历史（推荐第一次执行）
npm run inbox:sync -- --mode bootstrap --max-pages 200

# 日常增量同步
npm run inbox:sync -- --mode latest

# 拉取最近 50 条消息到本地 inbox，便于做核对
npm run inbox:sync -- --mode recent --limit 50

# 核对最近 50 条中的公众号 / 知乎链接，是否同时存在分类稿和总库镜像稿
npm run inbox:verify -- --limit 50
```

说明：

- `inbox:sync` 支持 `--mode latest|recent|all`
- 现在额外支持 `--mode bootstrap`
- `recent` 模式下支持 `--limit 10|20|30|40|50|60`
- `bootstrap` / `all` 可配合 `--max-pages 200` 这类参数拉更深历史
- `inbox:verify` 会扫描 `output/收件箱同步/**/*.md`
- 目前核对目标限定为：
  - `mp.weixin.qq.com`
  - `zhihu.com`
- 判定通过的标准是每个目标链接至少找到两份稿件：
  - 1 份分类稿
  - 1 份总库镜像稿（`收件箱同步/全部`）
- 如果同步结果被截断，系统会显式给出 warning，并且不会错误推进 `lastModified`
- 收件箱保存现在会按年月归档，例如：
  - `output/收件箱同步/2026/2026-04/AI/...`
  - `output/收件箱同步/2026/2026-04/全部/...`
- 新增的原始月归档镜像位于：
  - `data/inbox_archive/2026/2026-04.jsonl`

## 统一 ingress 与飞书 webhook

当前项目已经有三条统一入口：

- `POST /api/ingress/save-link`
  - 立即执行保存
  - 适合浏览器插件、本地工具直接把当前页送进执行器
- `POST /api/ingress/enqueue-link`
  - 只写入收件箱，不立即执行
  - 适合手机分享桥接、云端收集和后续补跑
- `POST /api/ingress/webhook/feishu`
  - 处理飞书事件订阅回调
  - `url_verification` 会直接回传 `challenge`
  - 消息事件会从消息文本里提取第一个 `http(s)` 链接，并按 `source=feishu`、`delivery_mode=queue` 入队

本地 `ui_config` 现在支持 `ingress` 段：

```json
{
  "ingress": {
    "localBaseUrl": "http://127.0.0.1:3030",
    "cloudBaseUrl": "https://example.com",
    "defaultRoute": "local"
  }
}
```

说明：

- `localBaseUrl`：浏览器插件或本地工具默认访问地址
- `cloudBaseUrl`：未来云端入口地址，占位后续公网部署
- `defaultRoute`：外部入口默认路由，推荐本地环境用 `local`，云端环境改为 `cloud`

如果准备把 webhook 暴露到公网，必须额外配置：

```powershell
$env:XHS_INGRESS_WEBHOOK_TOKEN="replace_me"
```

说明：

- 本地默认不强制 token，便于调试
- 一旦公网暴露，建议立即启用 `XHS_INGRESS_WEBHOOK_TOKEN`
- `config/ingress.example.json` 继续作为云端部署占位配置示例，外部 JSON 用 `snake_case`，内部 `ui_config` 仍用 `camelCase`

## 目录结构
```
/
├─ README.md
├─ docs/
│  ├─ guide/        # 使用指南
│  ├─ skill/        # Skill 定义
│  └─ legacy/       # 旧文档归档
├─ scripts/         # 抓取 / OCR / 导出脚本
├─ config/          # 配置文件示例
├─ data/            # 中间数据（raw_notes.json）
├─ output/          # 输出目录（按账号分组）
└─ assets/          # 静态资源（如 tesseract 训练数据）
```

## 脚本说明
**主流程**
- `scripts/extract_v4.js`：通过 CDP 抓取收藏夹笔记，输出 `data/raw_notes.json`
- `scripts/ocr_and_write.js`：OCR 图片并生成 Markdown

**辅助脚本**
- `scripts/check_cdp.js`：检查 CDP 连接
- `scripts/get_uid.js` / `get_uid2.js`：获取用户 UID
- `scripts/get_boards.js`：获取收藏夹专辑
- `scripts/write_markdown.js`：不含 OCR 的基础导出

## AI 摘要/标签（本地配置）
1. 复制示例文件：
   - `config/openrouter.example.json` → `config/openrouter.json`
2. 填入你的 OpenRouter API Key：
```json
{
  "enabled": true,
  "apiKey": "YOUR_OPENROUTER_API_KEY",
  "model": "openrouter/free",
  "baseUrl": "https://openrouter.ai/api/v1",
  "timeoutMs": 30000
}
```
3. 运行 `scripts/ocr_and_write.js` 时会自动读取配置。

> `config/openrouter.json` 已在 `.gitignore` 中忽略。

## 常见错误与退化策略
- **Chrome 9222 不可用**：提示启动参数并引导重新打开
- **首次需要登录**：先运行 `node scripts/login_browser.js`，在项目专用浏览器里登录一次
- **当前浏览器接管失败**：确认 Chrome 146+ 已开启 `chrome://inspect/#remote-debugging`
- **当前标签页不是笔记页**：提示打开正确页面
- **Vision OCR 失败**：默认回退到 Tesseract（可配置关闭）
- **AI 摘要失败**：回退到本地 summary/tags，不影响导出
- **评论显示很多但抓取为 0**：优先区分评论区仍在加载、网页端评论虚拟列表、登录失效或账号风控；`current-browser` 只改善会话复用，不替代评论等待与滚动扫描逻辑

**OCR 纠错（可选）**
在 `config/openrouter.json` 里可追加以下字段（可选）：
```json
{
  "ocrPostCorrect": true,
  "ocrPostCorrectThreshold": 0.55,
  "ocrPostCorrectMaxChars": 1200
}
```
- 会先做常见 OCR 错字替换，再对“明显不通顺”的文本调用 AI 纠错。

## 多账号输出与迁移
- 输出结构：
  - `output/{昵称_uid}/{收藏夹}/xxx.md`
  - `output/{昵称_uid}/_images/{noteId}/...`
- 账号信息默认从当前页面自动识别（昵称 + uid）。
- 如果检测到旧目录 `output/AI` 或 `output/笔记`，会自动迁移到当前账号目录下。

## 常见问题
- **403/无法访问**：确保使用 CDP 模式打开的小红书页面，且已登录。
- **OCR 失败**：检查 `assets/tesseract/` 的训练数据是否存在。
- **摘要为空**：检查 `config/openrouter.json` 是否正确填写。

## 文档索引
- 使用指南：`docs/guide/`
- Skill 定义：`docs/skill/`
- 旧文档：`docs/legacy/`

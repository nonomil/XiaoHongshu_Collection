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

### 3) 抓取与导出
```powershell
# 抓取收藏夹（示例使用 extract_v4）
node scripts/extract_v4.js

# OCR + 生成 Markdown
node scripts/ocr_and_write.js
```

输出文件会生成在 `output/{昵称_uid}/`。

## 主要入口
- 单笔记保存（CLI）：`node scripts/save_note.js <笔记链接>` 或 `node scripts/save_note.js --current`
- 收藏夹导出（CLI）：`node scripts/extract_v4.js` + `node scripts/ocr_and_write.js`
- UI 入口：运行 `启动小红书保存入口.bat`，浏览器访问 `http://127.0.0.1:3030/`

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
- **当前标签页不是笔记页**：提示打开正确页面
- **Vision OCR 失败**：默认回退到 Tesseract（可配置关闭）
- **AI 摘要失败**：回退到本地 summary/tags，不影响导出

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

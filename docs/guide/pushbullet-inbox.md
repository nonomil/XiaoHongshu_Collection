# Pushbullet 收件箱同步使用说明

## 作用
用于把手机端收藏或转发的链接批量拉取到本地“收件箱”，再统一保存。

## 获取 Pushbullet Access Token
1. 登录 Pushbullet 官网。
2. 进入账号设置（Settings / Account）。
3. 找到 **Access Tokens**，创建一个新 Token。
4. 复制该 Token。

## UI 使用方式
1. 打开 UI，点击右上角“设置”。
2. 在“收件箱同步”中勾选 **启用 Pushbullet**。
3. 粘贴 Access Token（保存后不明文回显）。
4. 可选：设置“收件箱落盘路径”。
5. 保存设置。
6. 点击主界面的 **同步收件箱** 按钮。

同步完成后会显示新增/跳过/总数统计，并写入收件箱文件。

## CLI 使用方式
```bash
npm run inbox:sync
```

CLI 会读取 `config/pushbullet.json` 内的 Pushbullet 设置与收件箱路径。

## 收件箱批量保存为 Markdown
```bash
npm run inbox:save
```

会读取收件箱里的链接并逐条保存为 Markdown。运行时需要 Chrome 远程调试可用（与手动保存链接一致）。

## 收件箱保存输出与分类
默认输出目录为：
```text
output/收件箱同步
```

保存时会按分类落盘，例如：
```text
output/收件箱同步/AI
output/收件箱同步/理财
output/收件箱同步/未分类
```

在 UI 设置中可以编辑“收件箱分类规则 (JSON)”，用于覆盖默认关键词分类。

## 收件箱落盘路径
默认路径：
```text
data/inbox_links.jsonl
```

可在设置中修改为相对路径或绝对路径。

## 注意事项
- Access Token 会保存在 `config/pushbullet.json`，请勿随意分享。
- 同步使用 `lastModified` 做增量拉取，避免重复处理。

## 扩展入口规范（预留）
- InboxItem 统一字段：`source` / `url` / `title` / `timestamp` / `raw`
- Provider 统一接口：`pull({ since }) -> { items, nextModified }`
- 新来源（IFTTT/OpenClaw/飞书）只需实现 Provider，并复用收件箱存储与批处理流程。

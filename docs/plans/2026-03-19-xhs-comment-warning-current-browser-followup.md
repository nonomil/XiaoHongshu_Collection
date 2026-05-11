# 小红书评论告警结构化与 Chrome 146 接管复盘

日期：2026-03-19

## 本次新增结论

评论采集失败不能再只看成一种问题，当前至少要分成三类：

1. `note_unavailable` / `300031`
   - 笔记详情页网页端本身不可见。
   - 即使接管 Chrome 146 当前浏览器，也不会自动恢复这类页面。

2. `comment_login_required`
   - 笔记正文可打开，但评论区剩余部分被网页端“登录查看全部评论内容”门槛拦截。
   - 这类情况不是采集循环逻辑失效，而是网页权限边界。

3. `comment_incomplete` / `comment_warning`
   - 普通未加载完整、接口异常、账号异常、频率限制等其他评论问题。

## 本次代码调整

已把“网页登录门槛”从采集层传递到导出层与 UI：

- `scripts/lib/cdp_note.js`
  - 新增 `commentWarningCode`
  - 采集到登录门槛时写入 `comment_login_required`

- `scripts/lib/note_export.js`
  - 导出 warning 时优先使用结构化 `commentWarningCode`
  - 对旧数据仍保留基于文案的兜底识别

- `ui/ui_helpers.js`
  - 新增 warning 文案映射

- `ui/app.js`
  - 成功结果如果带 warning，不再只显示“成功”
  - 汇总区增加“采集提示”展示

## 已完成验证

### 自动化测试

- `node --test scripts/ai/__tests__/note_export.test.js`
- `node --test scripts/ai/__tests__/ui_app_warnings.test.js`
- `node --test scripts/ai/__tests__/cdp_note_comments.test.js`
- `node --test scripts/ai/__tests__/save_note.test.js`
- `node --test scripts/ai/__tests__/ui_app_error_banner.test.js scripts/ai/__tests__/ui_server.test.js`
- `npm test`

结果：全部通过，当前全量为 `227/227` 通过。

### 真实浏览器验证

- 已确认本机 DevTools 端口可用：
  - Chrome 版本：`146.0.7680.80`
  - 端口：`http://127.0.0.1:9222`

- 真实样例验证结果：
  - `69b564ad000000002200d4f5` 现已转为网页端 `300031`
  - 从当前首页 feed 抓取的新样例 `69a3f5020000000026030755` 也落到 `300031`
- `--current` 路径在当前活动标签不是笔记详情页时会返回 `Current tab is not a Xiaohongshu note detail page`
- `--current` 路径现在会明确提示：
  - `请先切到小红书笔记详情页，再使用 --current 或当前浏览器接管模式重试。`

结论：Chrome 146 接管链路是通的，但当前会话里缺少一个“网页端仍可打开的详情页样本”，所以这次真实冒烟没有再次命中 `comment_login_required`，而是连续命中 `300031`。

## 对 Chrome 146 接管方案的最新判断

Chrome 146 接管当前浏览器，适合做这些事：

- 复用你手工登录后的真实会话
- 在已有页面上下文里继续操作
- 让“先手动打开，再让脚本接管”成为可行工作流

但它不能替代这些问题本身：

- 笔记网页端不可见
- 评论剩余内容需要网页登录
- 账号异常或接口频控

也就是说，Chrome 146 接管是“浏览器接入方式优化”，不是“权限边界消失”。

## 下一步建议

1. 增加结果面板中的 warning 筛选或图标
   - 让 `comment_login_required`、`300031`、`account abnormal` 一眼区分。

2. 为 `--current` 增加更明确提示
   - 当当前标签不是笔记详情页时，直接提示“请先切到小红书笔记详情页再重试”。

3. 增加一次“已登录网页端”的真人样本复测
   - 目标是拿到一条正文可见、评论显示“登录查看全部评论内容”的真实笔记，确认结构化 warning 在真实导出 JSON 中出现。

4. 如果后续要继续提升评论完整率
   - 先解决网页登录态复用和账号稳定性
   - 再考虑是否补充接口侧策略
   - 不建议继续在“纯 DOM 无限滚动”上投入过多时间

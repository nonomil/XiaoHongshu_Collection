---
name: xhs-browser-automation-governor
description: Use when 在 XiaoHongshu_Collection 项目中处理浏览器接入、Chrome 调试会话、登录态复用、评论抓取不完整、反爬判断、或评估是否引入 Playwright/stealth/Patchright。触发信号：用户提到“浏览器连接失败”“评论抓不到/抓不全”“current-browser”“isolated”“CDP”“Playwright”“storageState”“sessionStorage”“反爬”“验证码”“风控”“AutomationControlled”“Chrome for Testing”。
---

# xhs-browser-automation-governor

## 目标

在这个仓库里，优先做出稳定的浏览器自动化技术决策，而不是盲目追新工具。

默认目标：
- 保持主线可用
- 优先定位失败层级
- 允许退化，不轻易推翻当前架构

## 先读参考

触发后先读：
- `ref/浏览器爬网页-0405.md`
- `ref/浏览器爬网页-0405-续.md`

如果任务直接涉及评论抓取，再读：
- `scripts/lib/cdp_note.js`
- `scripts/ai/__tests__/cdp_note_comments.test.js`
- `scripts/ai/__tests__/cdp_note.test.js`

## 路由建议

如果问题明确属于现有主线排障与优化，继续交给：
- `xhs-cdp-mainline-ops`

如果问题明确属于新技术路线实验，继续交给：
- `xhs-playwright-experiment-lane`

## 当前最值得继续优化的 4 类

### 1. 诊断能力

优先把失败分层显示清楚：
- 连接浏览器失败
- 打开详情页失败
- 评论加载失败
- 评论接口受限
- 登录门槛 / 风控

这是低成本高收益优化，优先级高于更换技术栈。

### 2. 评论可观测性

优先让用户看见这次评论为什么没抓全：
- `commentWarningCode`
- `commentTotal`
- 实际抓到条数
- 是否触发登录门槛或风控提示

### 3. 人工接管点

对以下情况不要继续伪装成“全自动”：
- 验证码
- 登录查看全部评论
- 评论风控
- 账号异常

更好的模式是：
- 自动识别
- 明确停下
- 引导用户在当前浏览器人工处理
- 再回来继续

### 4. 实验分支

如果后面确实要做 Playwright：
- 不替换主线
- 单开实验分支
- 使用品牌 Chrome 或 Chrome for Testing
- 使用独立 `user_data_dir`
- 认证状态优先 `storageState`
- 必要时补 `sessionStorage`
- `stealth` 只做附加层，不做核心依赖

## 核心结论

### 1. 主线默认继续走当前方案

默认主线：
- 项目浏览器 / 独立 profile
- 现有 CDP 抓取链路
- 当前评论滚动、展开、累积器方案

不要默认把主线迁到 Playwright。

### 2. 把问题先分层

先判断问题属于哪一层：

| 层级 | 典型现象 | 默认动作 |
|------|---------|---------|
| 浏览器接入层 | 9222 不通、current-browser 失联、未检测到调试会话 | 先修浏览器接入 |
| 页面访问层 | 详情页打不开、跳 404、需要登录 | 先修登录态/访问方式 |
| 评论加载层 | 页面有评论但抓到 0 条或很少 | 先查懒加载、虚拟列表、滚动窗口 |
| 评论权限层 | “登录查看全部评论内容”、406、-101、300011 | 明确标记为登录门槛/风控/账号异常 |
| 架构试验层 | 用户明确要评估 Playwright / stealth / Patchright | 单独走实验支线 |

不要把不同层级的问题混成一个“反爬失败”。

### 3. 反爬补丁不是主方案

对 `stealth`、`AutomationControlled`、`Patchright` 的默认态度：
- 可以视为补丁层
- 不要视为主架构
- 不要在没有复现证据时强行引入

### 4. Playwright 只开实验支线

只有在以下情况才考虑 Playwright：
- 需要更复杂的页面流程控制
- 需要更高的测试可重复性
- 用户明确要求做技术路线实验

实验支线默认要求：
- 使用品牌 Chrome 或 Chrome for Testing
- 使用非默认 `user_data_dir`
- 认证状态优先 `storageState`
- 必要时补 `sessionStorage`
- 所有 stealth patch 收敛到一份 `add_init_script`

## 工作流

### 工作流 A：浏览器接入问题

1. 先确认当前模式是 `current-browser` 还是 `isolated`
2. 如果是 `current-browser` 且接入失败：
   - 先尝试切回项目浏览器 / 隔离 profile
   - 给用户明确的修复动作，不只给错误文案
3. 如果是 `isolated` 且失败：
   - 检查项目浏览器是否成功拉起
   - 检查调试端口和登录态

### 工作流 B：评论抓取问题

1. 先确认是否已经到评论容器可读状态
2. 再确认是：
   - 没等到评论加载
   - 虚拟列表覆盖
   - 顶层评论还没滚完
   - 网页端登录门槛
   - 评论接口限流 / 账号异常
3. 如果属于登录门槛或风控：
   - 明确告诉用户“不能承诺自动抓全”
   - 引导切到人工接管
4. 如果属于加载或虚拟列表：
   - 优先增强等待、滚动、快照累积、错误提示

### 工作流 C：技术路线评估

1. 先问自己：当前问题是否真的需要新技术栈
2. 若当前 CDP 主线还能继续优化：
   - 优先补诊断、反馈、人工接管点
3. 若必须开实验：
   - 明确标记为实验分支
   - 不要直接替换主线

## 必须遵守的护栏

- 不要自动化默认 Chrome profile
- 不要把 `connect_over_cdp()` 当成最高保真方案
- 不要声称 stealth 一定能解决站点检测
- 不要把评论抓取不完整都归咎于“代码 bug”
- 不要在没有证据时把登录失败归因到 “Playwright 自带 Chromium 残缺”

## 输出建议

处理这类任务时，优先输出：
- 问题所在层级
- 当前证据
- 建议沿主线优化，还是开实验支线
- 若是评论问题，明确“可自动修复”和“必须人工处理”的边界

## 适合沉淀成代码改进的方向

- 浏览器接入失败的一键修复
- 评论失败原因分层提示
- 评论抓取总数 / 实际条数 / warning code 的 UI 展示
- 人工接管后的继续执行入口

## 不要在这个 skill 里做的事

- 不要直接给出通用爬虫教程
- 不要把仓库主线强制改成 Playwright
- 不要把二手博客当成最终证据

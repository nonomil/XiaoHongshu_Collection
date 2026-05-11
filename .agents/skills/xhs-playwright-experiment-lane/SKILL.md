---
name: xhs-playwright-experiment-lane
description: Use when 在 XiaoHongshu_Collection 项目中评估、设计或实现 Playwright 实验支线，包括品牌 Chrome/Chrome for Testing、独立 user_data_dir、storageState、sessionStorage 回灌、add_init_script、stealth、AutomationControlled、Patchright，以及判断“是否值得从现有 CDP 主线分叉做实验”。触发信号：用户提到“Playwright”“storageState”“sessionStorage”“Chrome for Testing”“add_init_script”“stealth”“AutomationControlled”“Patchright”“实验分支”“技术路线评估”。
---

# xhs-playwright-experiment-lane

## 目标

把 Playwright 相关探索约束在“实验支线”，为未来能力扩展做准备，但不破坏当前主线稳定性。

默认立场：
- 先证明需要实验
- 实验与主线隔离
- 认证状态优先官方方案
- 反检测补丁只做附加层

## 先读文件

- `ref/浏览器爬网页-0405.md`
- `ref/浏览器爬网页-0405-续.md`

如果评估和现有主线差异，再补读：
- `scripts/lib/cdp_note.js`
- `scripts/save_note.js`

## 默认结论

### 1. Playwright 不默认替换主线

只有在以下情况才开实验支线：
- 需要更复杂页面流程
- 需要更高的自动化可重复性
- 当前 CDP 主线在架构上确实不够用

### 2. 默认实验基线

实验基线应是：
- 品牌 Chrome 或 Chrome for Testing
- 非默认 `user_data_dir`
- `storageState`
- 必要时补 `sessionStorage`
- 一份统一 `add_init_script`

### 3. 对补丁层的态度

- `stealth`：轻量补丁，不是主架构
- `AutomationControlled`：真实 feature 点，但不是万能开关
- `Patchright`：社区实验路线，不应直接进主线

### 4. 实验分支约束

实验分支必须满足：
- 不替换当前主线
- 使用品牌 Chrome 或 Chrome for Testing
- 使用独立 `user_data_dir`
- 认证状态优先 `storageState`
- 必要时补 `sessionStorage`
- `stealth` 只做附加层，不做核心依赖

## 默认工作流

### A. 判断是否值得开实验

1. 先判断当前问题是否真是“技术栈不够”
2. 如果现有 CDP 主线还能靠等待、滚动、提示、人工接管解决：
   - 不开实验
3. 如果需求超出当前主线边界：
   - 明确标记为实验支线

### B. 设计实验支线

1. 浏览器基座：
   - 优先 `Chrome for Testing` 或品牌 Chrome
   - 不自动化默认 profile
2. 认证状态：
   - 优先 `storageState`
   - 若站点依赖 `sessionStorage`，再用 `add_init_script` 回灌
3. 预注入脚本：
   - 只保留一份统一脚本
   - 不依赖多个 init script 的执行顺序
4. 反检测补丁：
   - 作为可开关实验项
   - 不与认证或浏览器基座耦死

### C. 实验输出

实验结论要明确写出：
- 为什么开实验
- 与主线相比解决了什么
- 没解决什么
- 能否回收为主线能力

## 建议优先沉淀的实验资产

- 单独的实验目录或 worktree
- 本地敏感认证状态目录
- 一份统一 `init script`
- 一份浏览器启动参数模板

## 禁止事项

- 不要自动化默认 Chrome 用户目录
- 不要只靠单个 cookie 就宣称认证方案稳定
- 不要把 stealth 当成主解决方案
- 不要未经验证就把 Patchright 引入主线

# Collection Pipeline Unification Design

日期：2026-03-18

## 背景

当前仓库已经把单笔记保存收敛到共享内核，但收藏夹导出仍然依赖：

- `scripts/extract_v4.js`
- `scripts/ocr_and_write.js`
- UI 中对子进程双脚本的串行调用

这导致“统一管线”只在单笔记路径成立，收藏夹仍然是旧架构孤岛。

## 目标

把收藏夹导出收敛到共享导出能力之上，同时保持现有 CLI / UI 使用方式不明显退化。

本轮只解决“小红书收藏夹主链路收敛”，不扩新平台，不重做 inbox provider。

## 设计决策

### 方案 A：继续保留双脚本，只在 UI 层做适配

优点：

- 改动最小
- 风险最低

缺点：

- 只是把问题包起来，没有真正消除分叉
- 共享导出内核仍无法直接承接收藏夹路径

结论：

不推荐。

### 方案 B：一次性删除旧脚本，直接完全重构

优点：

- 架构最干净

缺点：

- 回归风险大
- 当前收藏抓取逻辑复杂，整包替换代价高

结论：

本轮不推荐。

### 方案 C：新增共享收藏导出服务，旧入口兼容转发

做法：

- 新增共享收藏导出服务模块
- 服务模块负责：
  - 抓取收藏夹 note 数据
  - 落原始 raw 数据
  - 逐条调用共享 `processSingleNoteExport`
  - 输出统一 report
- CLI / UI 改为优先调用共享服务
- 旧脚本保留为兼容入口或轻包装

结论：

推荐采用。

## 架构设计

### 1. 新增共享服务层

新增模块建议：

- `scripts/lib/collection_export.js`

职责：

- 接收 collection task 与运行选项
- 调用抓取函数拿到 `{ boards, failed }`
- 将原始数据写入 `raw_notes.json`
- 遍历每条 note，调用 `processSingleNoteExport`
- 汇总每条结果，生成统一 report

### 2. 抓取层与写入层解耦

保留 `extract_v4.js` 中成熟的抓取逻辑，但尽量把它限定为“采集层”。

新的数据流：

`collection task -> collectCollectionData -> persist raw snapshot -> export each note -> build report`

而不是旧的：

`extract_v4.js -> raw_notes.json -> ocr_and_write.js`

### 3. UI 改成调用服务，而不是 spawn 两个脚本

`scripts/ui_server.js` 的收藏导出入口应直接调用共享收藏导出服务。

好处：

- UI 真正成为薄壳
- 收藏导出与单笔记导出返回更接近的 report shape
- 以后 inbox 或手工 URL 批量保存都能复用同一层

### 4. CLI 兼容策略

本轮不强制删除旧命令，而是：

- 新增一个面向统一内核的 CLI 入口，例如 `scripts/save_collection.js`
- `package.json` 增加新命令
- 旧 `extract` / `ocr` 保留一段时间，作为兼容路径

## 数据与结果对象

收藏导出服务建议输出：

- `rawPath`
- `reportPath`
- `total`
- `successCount`
- `failureCount`
- `boardSummaries`
- `results`
- `warnings`

其中 `results` 每项至少包含：

- `board`
- `noteId`
- `title`
- `status`
- `filepath`
- `commentArchivePath`
- `error`
- `warnings`

## 非目标

本轮不做：

- 动态发现全部收藏夹 UI
- 多平台文章归档
- inbox schema 重构
- Pushbullet / IFTTT / 飞书 provider 扩展
- 收藏夹抓取逻辑的大规模重写

## 风险与控制

### 风险 1：新服务与旧导出结果不一致

控制：

- 先为共享服务写契约测试
- 用现有 `processSingleNoteExport` 作为唯一导出器

### 风险 2：UI 改造引入行为回退

控制：

- 先加 UI server 测试
- 保持 `/api/save-collection` 返回结构稳定

### 风险 3：收藏抓取复杂，改动波及过大

控制：

- 本轮只抽服务编排，不重写抓取细节
- 优先复用现有 `collectCollectionData`

## 测试策略

本轮至少新增：

- 共享收藏导出服务契约测试
- 收藏导出逐条调用 `processSingleNoteExport` 的测试
- UI server 收藏导出不再依赖双脚本的测试
- CLI 包装入口测试或最小 smoke test

## 结论

本轮最优解不是重写收藏夹抓取，而是新增共享收藏导出服务，把收藏夹链路先拉回统一内核，再逐步淘汰旧式双脚本流程。

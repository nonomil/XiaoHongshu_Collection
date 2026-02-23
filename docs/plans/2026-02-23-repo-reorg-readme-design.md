# 2026-02-23 项目重构与 README 设计

## 背景
当前项目根目录文件较多、流程分散、文档混杂（Skill 定义、提示词、流程说明等），使用门槛高。用户希望重度整理目录结构、清空 output、删除 node_modules，并新增 README 说明。

## 目标
- 采用功能分区目录结构，清晰区分脚本、配置、文档、资产、输出。
- 明确区分 Skill 定义文档 与 使用/流程文档。
- 根目录新增 README（面向使用者 + 维护者）。
- 清空 `output/`，删除 `node_modules/`。

## 非目标
- 不改变抓取与 OCR 的核心逻辑（仅做路径适配）。
- 不引入新的功能（如新的导出格式）。

## 目录结构（目标）
```
/
├─ README.md
├─ docs/
│  ├─ guide/        # 使用指南（流程/注意事项）
│  ├─ skill/        # Skill 定义文档
│  └─ legacy/       # 旧文档归档（历史计划/旧说明）
├─ scripts/         # 原 src/ 的脚本
├─ config/          # 配置与示例（如 openrouter.example.json）
├─ data/            # 原始/中间数据（如 raw_notes.json）
├─ output/          # 清空，作为新产出目录
└─ assets/          # 训练数据与其它静态资源
   └─ tesseract/
```

## 迁移映射
- `src/` → `scripts/`
- `xhs-collection-export-skill.md` → `docs/skill/xhs-collection-export-skill.md`
- `xhs-collection-export.md` → `docs/guide/xhs-collection-export.md`
- `小红书收藏夹导出任务文档-claude.md` → `docs/guide/小红书收藏夹导出任务文档-claude.md`
- `docs/plans/*` → `docs/legacy/plans/*`
- `chi_sim.traineddata`, `eng.traineddata` → `assets/tesseract/`
- `output/` 清空保留目录
- `node_modules/` 删除

## 路径适配
- `scripts/ocr_and_write.js` 内 `PROJECT_DIR`、`OUTPUT_DIR`、`IMG_DIR`、`RAW_PATH` 更新为新结构。
- 若其它脚本存在硬编码路径，同步调整为新目录。

## README 结构
1. 项目简介
2. 快速开始（最短流程：CDP → extract → OCR+写入）
3. 目录结构说明
4. 脚本说明（主流程详解，辅助脚本简述）
5. AI 摘要/标签配置（本地配置文件）
6. 常见问题/排障
7. 文档索引（guide/skill/legacy）

## 风险与对策
- 风险：路径更新不完整导致脚本失败。
  - 对策：逐脚本检查硬编码路径并统一调整。
- 风险：output 清空导致历史数据丢失。
  - 对策：用户已明确允许清空。

## 验收标准
- README 在根目录，且包含快速开始 + 结构说明。
- 脚本可在新目录结构下运行。
- `output/` 清空、`node_modules/` 删除。


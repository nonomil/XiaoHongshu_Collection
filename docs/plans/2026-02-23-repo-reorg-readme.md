# Repo Reorg + README Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 重构目录结构、清理产物、更新路径，并新增面向用户与维护者的 README。

**Architecture:** 将脚本移至 `scripts/`，文档分为 `docs/guide`、`docs/skill`、`docs/legacy`，配置放入 `config/`，资产集中在 `assets/`，数据在 `data/`。更新所有硬编码路径以适配新结构。

**Tech Stack:** Node.js, PowerShell, Git

---

### Task 1: 建立目标目录结构

**Files:**
- Create: `docs/guide/`
- Create: `docs/skill/`
- Create: `docs/legacy/plans/`
- Create: `scripts/`
- Create: `config/`
- Create: `data/`
- Create: `assets/tesseract/`

**Step 1: Create directories**

Run: `New-Item -ItemType Directory -Force docs\guide,docs\skill,docs\legacy\plans,scripts,config,data,assets\tesseract`
Expected: Directories created

**Step 2: Commit**

```bash
git add docs scripts config data assets
git commit -m "chore: add reorg directories"
```

---

### Task 2: 迁移文档与资产

**Files:**
- Move: `xhs-collection-export-skill.md` → `docs/skill/xhs-collection-export-skill.md`
- Move: `xhs-collection-export.md` → `docs/guide/xhs-collection-export.md`
- Move: `小红书收藏夹导出任务文档-claude.md` → `docs/guide/小红书收藏夹导出任务文档-claude.md`
- Move: `docs/plans/*` → `docs/legacy/plans/`
- Move: `chi_sim.traineddata`, `eng.traineddata` → `assets/tesseract/`

**Step 1: Move files**

```powershell
Move-Item xhs-collection-export-skill.md docs\skill\
Move-Item xhs-collection-export.md docs\guide\
Move-Item "小红书收藏夹导出任务文档-claude.md" docs\guide\
Move-Item docs\plans\* docs\legacy\plans\
Move-Item chi_sim.traineddata assets\tesseract\
Move-Item eng.traineddata assets\tesseract\
```

**Step 2: Commit**

```bash
git add docs assets
git commit -m "chore: move docs and assets"
```

---

### Task 3: 迁移脚本与数据

**Files:**
- Move: `src/` → `scripts/`
- Move: `src/raw_notes.json` → `data/raw_notes.json`

**Step 1: Move scripts**

```powershell
Move-Item src\* scripts\
Remove-Item src -Force
Move-Item scripts\raw_notes.json data\raw_notes.json
```

**Step 2: Commit**

```bash
git add scripts data
rm -rf src

git commit -m "chore: move scripts and data"
```

---

### Task 4: 清理产物与更新 .gitignore

**Files:**
- Modify: `.gitignore`
- Delete: `output/*`
- Delete: `node_modules/`

**Step 1: Update ignore rules**

Add/ensure:
- `node_modules/`
- `output/`
- `config/openrouter.json`

**Step 2: Clean output and node_modules**

```powershell
Remove-Item -Recurse -Force output\*
Remove-Item -Recurse -Force node_modules
```

**Step 3: Commit**

```bash
git add .gitignore

git commit -m "chore: clean artifacts and update gitignore"
```

---

### Task 5: 更新脚本路径

**Files:**
- Modify: `scripts/ocr_and_write.js`
- Inspect/Modify: other `scripts/*.js` with hardcoded paths

**Step 1: Update ocr_and_write.js paths**

Replace base paths to:
- `PROJECT_DIR` remains repo root
- `OUTPUT_DIR` → `output/`
- `IMG_DIR` → `output/_images`
- `RAW_PATH` → `data/raw_notes.json`

**Step 2: Scan for other hardcoded paths**

Run: `rg "G:/UserCode/XiaoHongshu_Collection" scripts -n`
Expected: update any absolute paths to new structure

**Step 3: Commit**

```bash
git add scripts

git commit -m "chore: update script paths"
```

---

### Task 6: 新增 README

**Files:**
- Create: `README.md`

**Step 1: Write README**

Include:
- 项目简介
- 快速开始（CDP → extract → OCR+写入）
- 目录结构说明
- 脚本说明（主流程 + 其他脚本简述）
- AI 配置（config/openrouter.json）
- 排障
- 文档索引

**Step 2: Commit**

```bash
git add README.md

git commit -m "docs: add README"
```

---

### Task 7: 轻量验证

**Files:**
- Inspect: `scripts/ocr_and_write.js`

**Step 1: Run a basic lint check (optional)**

Run: `node -c scripts/ocr_and_write.js`
Expected: no syntax errors

**Step 2: Commit any fixes**

```bash
git add scripts/ocr_and_write.js

git commit -m "chore: verify paths"
```

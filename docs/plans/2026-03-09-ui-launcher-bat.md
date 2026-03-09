# UI Launcher BAT Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a double-click Windows launcher that starts the local UI server and opens the browser to the existing HTML entry page.

**Architecture:** Keep the current `scripts/ui_server.js` and static `ui/` page unchanged. Add a root-level `.bat` launcher that runs from the repository root, starts the Node server only when needed, waits briefly, and opens `http://127.0.0.1:3030`.

**Tech Stack:** Windows BAT, existing Node.js local HTTP server, `node --test`.

---

### Task 1: Add BAT launcher coverage

**Files:**
- Create: `scripts/ai/__tests__/ui_launcher.test.js`
- Create: `启动小红书保存入口.bat`

**Step 1: Write the failing test**

Add a test that asserts the BAT file exists and contains:
- root-relative working directory handling
- the `node scripts\ui_server.js` launch command
- the `http://127.0.0.1:3030` browser entry

**Step 2: Run test to verify it fails**

Run: `node --test scripts/ai/__tests__/ui_launcher.test.js`
Expected: FAIL because the BAT launcher file does not exist yet.

**Step 3: Write minimal implementation**

Create `启动小红书保存入口.bat` that:
- switches to the repo root via `%~dp0`
- checks whether `http://127.0.0.1:3030` is already responding
- starts `node scripts\ui_server.js` in a separate window if needed
- opens the browser to the local UI

**Step 4: Run test to verify it passes**

Run: `node --test scripts/ai/__tests__/ui_launcher.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add "启动小红书保存入口.bat" scripts/ai/__tests__/ui_launcher.test.js docs/plans/2026-03-09-ui-launcher-bat.md
git commit -m "feat: add bat launcher for local ui"
```

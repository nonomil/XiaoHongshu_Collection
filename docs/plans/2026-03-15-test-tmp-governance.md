# 测试临时目录统一与自动清理 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redirect all test temp artifacts into `G:\UserCode\XiaoHongshu_Collection\tmp` and auto-clean it on every test run.

**Architecture:** Add a shared test temp helper, update tests to use it, add a cleanup script, wire `pretest/posttest`, and ignore `tmp/` in git.

**Tech Stack:** Node.js, node:test

---

### Task 1: Add test temp helper

**Files:**
- Create: `scripts/ai/__tests__/test_tmp.js`

**Step 1: Write the failing test**

No new test required (helper used by existing tests). Proceed to implementation.

**Step 2: Implement helper**

```js
const fs = require('fs');
const path = require('path');
const { resolveProjectPaths } = require('../../lib/config');

function resolveTestTmpRoot() {
  const paths = resolveProjectPaths(path.resolve(__dirname, '..', '..', '..'));
  return path.join(paths.primaryDir, 'tmp');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function resolveTestTmpDir(name) {
  const root = resolveTestTmpRoot();
  ensureDir(root);
  const target = path.join(root, name);
  ensureDir(target);
  return target;
}

function createTempDir(prefix) {
  const root = resolveTestTmpRoot();
  ensureDir(root);
  return fs.mkdtempSync(path.join(root, prefix));
}

module.exports = {
  resolveTestTmpRoot,
  resolveTestTmpDir,
  createTempDir
};
```

**Step 3: Commit**

```bash
git add scripts/ai/__tests__/test_tmp.js
git commit -m "test: add shared temp helper"
```

---

### Task 2: Migrate tests to new temp helper

**Files:**
- Modify: `scripts/ai/__tests__/ui_server.test.js`
- Modify: `scripts/ai/__tests__/ui_config.test.js`
- Modify: `scripts/ai/__tests__/inbox_save.test.js`
- Modify: `scripts/ai/__tests__/inbox_store.test.js`
- Modify: `scripts/ai/__tests__/inbox_sync.test.js`
- Modify: `scripts/ai/__tests__/output_naming.test.js`
- Modify: `scripts/ai/__tests__/pushbullet_config.test.js`
- Modify: `scripts/ai/__tests__/config.test.js`
- Modify: `scripts/ai/__tests__/extract_v4.test.js`
- Modify: `scripts/ai/__tests__/note_export.test.js`

**Step 1: Write the failing test**

No new tests required (path changes only). Proceed to implementation.

**Step 2: Update each test to use helper**

- Replace `process.cwd()` temp roots with `createTempDir('xhs-ui-config-')`.
- Replace `os.tmpdir()` temp roots with `createTempDir('xhs-...-')`.
- Replace `__tmp__` folders with `resolveTestTmpDir('inbox-save')`, etc.

**Step 3: Run tests**

Run: `npm test`
Expected: PASS

**Step 4: Commit**

```bash
git add scripts/ai/__tests__/*.test.js
git commit -m "test: route temp files to project tmp"
```

---

### Task 3: Add cleanup script and wire to test lifecycle

**Files:**
- Create: `scripts/cleanup_tmp.js`
- Modify: `package.json`
- Modify: `.gitignore`

**Step 1: Implement cleanup script**

```js
const fs = require('fs');
const path = require('path');
const { resolveProjectPaths } = require('./lib/config');

const paths = resolveProjectPaths(path.resolve(__dirname, '..'));
const tmpRoot = path.join(paths.primaryDir, 'tmp');

function removeIfExists(target) {
  if (fs.existsSync(target)) {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

function clearTmpRoot() {
  if (!fs.existsSync(tmpRoot)) return;
  for (const entry of fs.readdirSync(tmpRoot)) {
    removeIfExists(path.join(tmpRoot, entry));
  }
}

function clearLegacy() {
  const legacyRoot = paths.primaryDir;
  for (const entry of fs.readdirSync(legacyRoot)) {
    if (entry.startsWith('tmp-ui-config-')) {
      removeIfExists(path.join(legacyRoot, entry));
    }
  }
  removeIfExists(path.join(legacyRoot, 'scripts', 'ai', '__tmp__'));
}

clearTmpRoot();
clearLegacy();
```

**Step 2: Wire pretest/posttest**

`package.json`:
```json
"pretest": "node scripts/cleanup_tmp.js",
"posttest": "node scripts/cleanup_tmp.js"
```

**Step 3: Ignore tmp**

`.gitignore`:
```
tmp/
```

**Step 4: Run tests**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add scripts/cleanup_tmp.js package.json .gitignore
git commit -m "chore: auto-clean test tmp directory"
```

---

### Task 4: Full test suite

**Step 1: Run tests**

Run: `npm test`
Expected: PASS

**Step 2: Summarize changes**

Note: unified tmp root + auto cleanup.


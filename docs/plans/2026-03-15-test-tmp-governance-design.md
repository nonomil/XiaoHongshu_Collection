# 测试临时目录统一与自动清理 Design

**目标**
- 统一测试产生的临时目录到 `G:\UserCode\XiaoHongshu_Collection\tmp`。
- 避免在项目根目录生成 `tmp-ui-config-*`、`scripts/ai/__tmp__` 等杂散目录。
- 每次执行 `npm test` 自动清理临时目录（清空 tmp）。

**非目标**
- 不改变生产脚本的输出路径行为。
- 不引入环境变量覆盖临时目录位置。

**方案概述**
- 新增测试专用临时目录工具 `scripts/ai/__tests__/test_tmp.js`：
  - `resolveTestTmpRoot()`：返回固定临时根目录。
  - `createTempDir(prefix)`：在临时根目录下创建前缀目录。
  - `resolveTestTmpDir(name)`：在临时根目录下返回固定子目录路径。
- 统一替换测试代码中 `process.cwd()`、`os.tmpdir()`、`__tmp__` 的用法。
- 新增清理脚本 `scripts/cleanup_tmp.js`：
  - 清空 `tmp/` 目录内容（保留目录本身）。
  - 兼容清理旧遗留：根目录的 `tmp-ui-config-*` 与 `scripts/ai/__tmp__`。
- `package.json` 增加 `pretest`/`posttest`：每次测试前后自动清理。
- `.gitignore` 增加 `tmp/`。

**临时目录位置**
- 固定为 `G:\UserCode\XiaoHongshu_Collection\tmp`（通过 `resolveProjectPaths(...).primaryDir` 保证 worktree 也指向主目录）。

**受影响的测试文件（预期改动）**
- `scripts/ai/__tests__/ui_server.test.js`（tmp-ui-config-*）
- `scripts/ai/__tests__/ui_config.test.js`（__tmp__）
- `scripts/ai/__tests__/inbox_save.test.js`（__tmp__）
- `scripts/ai/__tests__/inbox_store.test.js`（__tmp__）
- `scripts/ai/__tests__/inbox_sync.test.js`（__tmp__）
- `scripts/ai/__tests__/output_naming.test.js`（__tmp__）
- `scripts/ai/__tests__/pushbullet_config.test.js`（__tmp__）
- `scripts/ai/__tests__/config.test.js`（os.tmpdir）
- `scripts/ai/__tests__/extract_v4.test.js`（os.tmpdir）
- `scripts/ai/__tests__/note_export.test.js`（os.tmpdir）

**清理策略**
- 每次 `npm test` 运行时自动清空 `tmp/`。
- 旧遗留目录也会清理，避免反复累积。


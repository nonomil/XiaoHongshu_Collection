const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  buildOpenFolderCommand,
  openFolder,
  resolveOutputFolder
} = require('../../lib/open_output');

test('resolveOutputFolder prefers the saved markdown directory from successful results', () => {
  const folderPath = resolveOutputFolder({
    projectDir: 'G:/UserCode/XiaoHongshu_Collection',
    defaultOutputDir: 'G:/UserCode/XiaoHongshu_Collection/output',
    report: {
      total: 1,
      successCount: 1,
      results: [
        {
          status: 'success',
          filepath: 'G:/UserCode/XiaoHongshu_Collection/output/单条笔记保存/测试标题.md'
        }
      ]
    },
    uiConfig: {}
  });

  assert.equal(folderPath, path.normalize('G:/UserCode/XiaoHongshu_Collection/output/单条笔记保存'));
});

test('resolveOutputFolder falls back to configured collection output root when report has no filepath', () => {
  const folderPath = resolveOutputFolder({
    projectDir: 'G:/UserCode/XiaoHongshu_Collection',
    defaultOutputDir: 'G:/UserCode/XiaoHongshu_Collection/output',
    report: {
      status: 'success',
      output: {
        steps: [
          { script: 'extract_v4.js', code: 0 },
          { script: 'ocr_and_write.js', code: 0 }
        ]
      }
    },
    uiConfig: {
      paths: {
        collectionOutputRoot: 'output/custom-collection'
      }
    }
  });

  assert.equal(folderPath, path.normalize('G:/UserCode/XiaoHongshu_Collection/output/custom-collection'));
});

test('openFolder delegates to spawn and returns the normalized folder path', async () => {
  const calls = [];
  const folderPath = await openFolder('G:/UserCode/XiaoHongshu_Collection/output/单条笔记保存', {
    pathExistsFn: () => true,
    spawnFn: (command, args, options) => {
      calls.push({ command, args, options });
      return {
        unref() {}
      };
    }
  });

  assert.equal(folderPath, path.normalize('G:/UserCode/XiaoHongshu_Collection/output/单条笔记保存'));
  assert.equal(calls.length, 1);
  assert.equal(typeof calls[0].command, 'string');
  assert.ok(Array.isArray(calls[0].args));
  assert.equal(calls[0].args.length >= 1, true);
});

test('buildOpenFolderCommand uses explorer on Windows', () => {
  const command = buildOpenFolderCommand('G:/UserCode/XiaoHongshu_Collection/output/AI', {
    platform: 'win32'
  });

  assert.equal(command.command, 'explorer.exe');
  assert.deepEqual(command.args, [path.normalize('G:/UserCode/XiaoHongshu_Collection/output/AI')]);
});

test('openFolder rejects when the system open command emits an error', async () => {
  await assert.rejects(
    () => openFolder('G:/UserCode/XiaoHongshu_Collection/output/AI', {
      pathExistsFn: () => true,
      spawnFn: () => {
        const { EventEmitter } = require('node:events');
        const child = new EventEmitter();
        child.unref = () => {};
        process.nextTick(() => child.emit('error', new Error('mock explorer failure')));
        return child;
      }
    }),
    /mock explorer failure/
  );
});

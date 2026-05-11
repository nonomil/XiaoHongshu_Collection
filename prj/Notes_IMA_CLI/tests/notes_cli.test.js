import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const project_root = path.resolve(__dirname, '..');

async function prepare_home_dir() {
  const home_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ima-cli-home-'));
  const config_dir = path.join(home_dir, '.config', 'ima');
  await fs.mkdir(config_dir, { recursive: true });
  await fs.writeFile(path.join(config_dir, 'client_id'), 'test-client', 'utf8');
  await fs.writeFile(path.join(config_dir, 'api_key'), 'test-key', 'utf8');
  return home_dir;
}

test('notes list prints note rows from mock response', async () => {
  const home_dir = await prepare_home_dir();
  const result = spawnSync(process.execPath, ['src/cli.js', 'notes', 'list'], {
    cwd: project_root,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: home_dir,
      USERPROFILE: home_dir,
      IMA_CLI_USE_MOCK: '1'
    }
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /doc-001/);
  assert.match(result.stdout, /示例笔记/);
});

test('notes folders prints folder rows from mock response', async () => {
  const home_dir = await prepare_home_dir();
  const result = spawnSync(process.execPath, ['src/cli.js', 'notes', 'folders'], {
    cwd: project_root,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: home_dir,
      USERPROFILE: home_dir,
      IMA_CLI_USE_MOCK: '1'
    }
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /folder-all/);
  assert.match(result.stdout, /全部笔记/);
});

test('notes search prints search rows from mock response', async () => {
  const home_dir = await prepare_home_dir();
  const result = spawnSync(process.execPath, ['src/cli.js', 'notes', 'search', '周报'], {
    cwd: project_root,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: home_dir,
      USERPROFILE: home_dir,
      IMA_CLI_USE_MOCK: '1'
    }
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /search-001/);
  assert.match(result.stdout, /周报总结/);
});

test('notes search supports content mode and limit', async () => {
  const home_dir = await prepare_home_dir();
  const result = spawnSync(
    process.execPath,
    ['src/cli.js', 'notes', 'search', '项目排期', '--content', '--limit', '1'],
    {
      cwd: project_root,
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: home_dir,
        USERPROFILE: home_dir,
        IMA_CLI_USE_MOCK: '1'
      }
    }
  );

  assert.equal(result.status, 0);
  assert.match(result.stdout, /content-001/);
  assert.doesNotMatch(result.stdout, /search-001/);
});

test('notes list supports folder id filter', async () => {
  const home_dir = await prepare_home_dir();
  const result = spawnSync(
    process.execPath,
    ['src/cli.js', 'notes', 'list', '--folder-id', 'folder-work'],
    {
      cwd: project_root,
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: home_dir,
        USERPROFILE: home_dir,
        IMA_CLI_USE_MOCK: '1'
      }
    }
  );

  assert.equal(result.status, 0);
  assert.match(result.stdout, /doc-folder-001/);
  assert.match(result.stdout, /文件夹内笔记/);
});

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

test('notes export with doc id writes markdown file', async () => {
  const home_dir = await prepare_home_dir();
  const output_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ima-cli-export-'));

  const result = spawnSync(
    process.execPath,
    ['src/cli.js', 'notes', 'export', '--doc-id', 'doc-001', '--output-dir', output_dir],
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
  assert.match(result.stdout, /已导出/);

  const files = await fs.readdir(output_dir);
  assert.equal(files.length, 1);

  const content = await fs.readFile(path.join(output_dir, files[0]), 'utf8');
  assert.match(content, /doc_id: doc-001/);
  assert.match(content, /# Untitled/);
  assert.match(content, /这是 doc-001 的正文内容。/);
});

test('notes export with doc id accepts explicit title and folder name', async () => {
  const home_dir = await prepare_home_dir();
  const output_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ima-cli-export-title-'));

  const result = spawnSync(
    process.execPath,
    [
      'src/cli.js',
      'notes',
      'export',
      '--doc-id',
      'doc-777',
      '--title',
      '自定义标题',
      '--folder-name',
      '研究',
      '--output-dir',
      output_dir
    ],
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

  const files = await fs.readdir(output_dir);
  assert.equal(files.length, 1);

  const content = await fs.readFile(path.join(output_dir, files[0]), 'utf8');
  assert.match(content, /title: 自定义标题/);
  assert.match(content, /folder_name: 研究/);
  assert.match(content, /# 自定义标题/);
});

test('notes export with query writes multiple markdown files', async () => {
  const home_dir = await prepare_home_dir();
  const output_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ima-cli-export-many-'));

  const result = spawnSync(
    process.execPath,
    ['src/cli.js', 'notes', 'export', '--query', '周报', '--output-dir', output_dir],
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
  const files = await fs.readdir(output_dir);
  assert.equal(files.length, 2);
});

test('notes export query supports content mode and limit', async () => {
  const home_dir = await prepare_home_dir();
  const output_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ima-cli-export-content-'));

  const result = spawnSync(
    process.execPath,
    [
      'src/cli.js',
      'notes',
      'export',
      '--query',
      '项目排期',
      '--content',
      '--limit',
      '1',
      '--output-dir',
      output_dir
    ],
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
  const files = await fs.readdir(output_dir);
  assert.equal(files.length, 1);

  const content = await fs.readFile(path.join(output_dir, files[0]), 'utf8');
  assert.match(content, /content-001/);
});

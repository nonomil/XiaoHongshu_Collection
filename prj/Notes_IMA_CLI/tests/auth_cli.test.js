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
  const home_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ima-cli-auth-home-'));
  const config_dir = path.join(home_dir, '.config', 'ima');
  await fs.mkdir(config_dir, { recursive: true });
  await fs.writeFile(path.join(config_dir, 'client_id'), 'test-client', 'utf8');
  await fs.writeFile(path.join(config_dir, 'api_key'), 'test-key', 'utf8');
  return home_dir;
}

test('auth check validates credentials and probe call in mock mode', async () => {
  const home_dir = await prepare_home_dir();
  const result = spawnSync(process.execPath, ['src/cli.js', 'auth', 'check'], {
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
  assert.match(result.stdout, /凭证检查通过/);
  assert.match(result.stdout, /接口探活通过/);
});

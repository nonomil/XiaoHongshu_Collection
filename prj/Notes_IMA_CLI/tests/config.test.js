import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { load_ima_credentials } from '../src/config.js';

test('load_ima_credentials prefers environment variables', async () => {
  const credentials = await load_ima_credentials({
    env: {
      IMA_OPENAPI_CLIENTID: 'env-client',
      IMA_OPENAPI_APIKEY: 'env-key'
    },
    home_dir: path.join(os.tmpdir(), 'ima-cli-config-missing-env')
  });

  assert.deepEqual(credentials, {
    client_id: 'env-client',
    api_key: 'env-key',
    source: 'env'
  });
});

test('load_ima_credentials falls back to config files', async () => {
  const home_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ima-cli-home-'));
  const config_dir = path.join(home_dir, '.config', 'ima');

  await fs.mkdir(config_dir, { recursive: true });
  await fs.writeFile(path.join(config_dir, 'client_id'), 'file-client', 'utf8');
  await fs.writeFile(path.join(config_dir, 'api_key'), 'file-key', 'utf8');

  const credentials = await load_ima_credentials({
    env: {},
    home_dir
  });

  assert.deepEqual(credentials, {
    client_id: 'file-client',
    api_key: 'file-key',
    source: 'file'
  });
});

test('load_ima_credentials throws when credentials are missing', async () => {
  const home_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ima-cli-empty-home-'));

  await assert.rejects(
    () =>
      load_ima_credentials({
        env: {},
        home_dir
      }),
    /缺少 ima openapi 凭证/i
  );
});

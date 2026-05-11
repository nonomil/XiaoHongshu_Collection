import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

function normalize_value(value) {
  const normalized = value?.trim() ?? '';
  return normalized.length > 0 ? normalized : '';
}

async function read_optional_utf8(file_path) {
  try {
    return normalize_value(await fs.readFile(file_path, 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return '';
    }

    throw error;
  }
}

export async function load_ima_credentials(options = {}) {
  const env = options.env ?? process.env;
  const home_dir = options.home_dir ?? os.homedir();

  const env_client_id = normalize_value(env.IMA_OPENAPI_CLIENTID);
  const env_api_key = normalize_value(env.IMA_OPENAPI_APIKEY);

  if (env_client_id && env_api_key) {
    return {
      client_id: env_client_id,
      api_key: env_api_key,
      source: 'env'
    };
  }

  const config_dir = path.join(home_dir, '.config', 'ima');
  const file_client_id = await read_optional_utf8(path.join(config_dir, 'client_id'));
  const file_api_key = await read_optional_utf8(path.join(config_dir, 'api_key'));

  if (file_client_id && file_api_key) {
    return {
      client_id: file_client_id,
      api_key: file_api_key,
      source: 'file'
    };
  }

  throw new Error('缺少 ima OpenAPI 凭证，请先配置 Client ID 和 API Key。');
}

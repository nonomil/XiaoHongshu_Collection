const default_base_url = 'https://ima.qq.com';

export function create_ima_api_client(options) {
  const {
    client_id,
    api_key,
    fetch_impl = globalThis.fetch,
    base_url = default_base_url
  } = options;

  if (!client_id || !api_key) {
    throw new Error('创建 ima API 客户端时缺少凭证。');
  }

  if (typeof fetch_impl !== 'function') {
    throw new Error('当前环境不支持 fetch，请提供 fetch 实现。');
  }

  return {
    async post(api_path, body) {
      const response = await fetch_impl(`${base_url}/${api_path}`, {
        method: 'POST',
        headers: {
          'ima-openapi-clientid': client_id,
          'ima-openapi-apikey': api_key,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body ?? {})
      });

      if (!response.ok) {
        throw new Error(`ima API 请求失败：HTTP ${response.status}`);
      }

      const payload = await response.json();

      if (typeof payload?.retcode === 'number' && payload.retcode !== 0) {
        const message = payload.message || payload.err_msg || '未知错误';
        throw new Error(`ima API 请求失败：${payload.retcode} ${message}`);
      }

      return payload;
    }
  };
}

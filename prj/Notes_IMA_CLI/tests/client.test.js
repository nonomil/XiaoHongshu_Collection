import test from 'node:test';
import assert from 'node:assert/strict';

import { create_ima_api_client } from '../src/ima_api/client.js';

test('create_ima_api_client sends post request with ima headers', async () => {
  const calls = [];
  const fetch_stub = async (url, options) => {
    calls.push({ url, options });

    return {
      ok: true,
      status: 200,
      async json() {
        return { retcode: 0, data: { ok: true } };
      }
    };
  };

  const client = create_ima_api_client({
    client_id: 'client-1',
    api_key: 'key-1',
    fetch_impl: fetch_stub
  });

  const response = await client.post('openapi/note/v1/search_note_book', {
    search_type: 0
  });

  assert.deepEqual(response, { retcode: 0, data: { ok: true } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://ima.qq.com/openapi/note/v1/search_note_book');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers['ima-openapi-clientid'], 'client-1');
  assert.equal(calls[0].options.headers['ima-openapi-apikey'], 'key-1');
  assert.equal(calls[0].options.headers['Content-Type'], 'application/json');
  assert.equal(calls[0].options.body, JSON.stringify({ search_type: 0 }));
});

test('create_ima_api_client throws when retcode is non-zero', async () => {
  const client = create_ima_api_client({
    client_id: 'client-1',
    api_key: 'key-1',
    fetch_impl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return { retcode: 20004, message: 'apikey 鉴权失败' };
      }
    })
  });

  await assert.rejects(
    () => client.post('openapi/note/v1/list_note_folder_by_cursor', { cursor: '0', limit: 1 }),
    /20004|鉴权失败/
  );
});

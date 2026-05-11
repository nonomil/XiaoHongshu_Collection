import test from 'node:test';
import assert from 'node:assert/strict';

import {
  get_note_content,
  list_notes,
  search_notes
} from '../src/ima_api/notes.js';

test('list_notes sends list_note_by_folder_id payload', async () => {
  const calls = [];
  const client = {
    async post(api_path, body) {
      calls.push({ api_path, body });
      return { docs: [] };
    }
  };

  await list_notes(client, { folder_id: 'folder-1', limit: 10, cursor: '' });

  assert.deepEqual(calls, [
    {
      api_path: 'openapi/note/v1/list_note_by_folder_id',
      body: {
        folder_id: 'folder-1',
        limit: 10,
        cursor: ''
      }
    }
  ]);
});

test('list_notes accepts official note_book_list response shape', async () => {
  const client = {
    async post() {
      return {
        note_book_list: [
          {
            basic_info: {
              basic_info: {
                docid: 'doc-official-1',
                title: '官方结构笔记',
                folder_name: '工作',
                modify_time: 1775577600000
              }
            }
          }
        ]
      };
    }
  };

  const response = await list_notes(client, {});

  assert.equal(response.note_book_list[0].basic_info.basic_info.docid, 'doc-official-1');
});

test('search_notes sends search_note_book payload', async () => {
  const calls = [];
  const client = {
    async post(api_path, body) {
      calls.push({ api_path, body });
      return { docs: [] };
    }
  };

  await search_notes(client, { query: '周报', search_type: 0, start: 0, end: 20 });

  assert.deepEqual(calls, [
    {
      api_path: 'openapi/note/v1/search_note_book',
      body: {
        search_type: 0,
        query_info: {
          title: '周报'
        },
        start: 0,
        end: 20
      }
    }
  ]);
});

test('search_notes supports content search and custom end range', async () => {
  const calls = [];
  const client = {
    async post(api_path, body) {
      calls.push({ api_path, body });
      return { docs: [] };
    }
  };

  await search_notes(client, { query: '项目排期', search_type: 1, start: 0, end: 5 });

  assert.deepEqual(calls, [
    {
      api_path: 'openapi/note/v1/search_note_book',
      body: {
        search_type: 1,
        query_info: {
          content: '项目排期'
        },
        start: 0,
        end: 5
      }
    }
  ]);
});

test('get_note_content requests plaintext content', async () => {
  const calls = [];
  const client = {
    async post(api_path, body) {
      calls.push({ api_path, body });
      return { content: '正文' };
    }
  };

  const response = await get_note_content(client, { doc_id: 'doc-1' });

  assert.deepEqual(response, { content: '正文' });
  assert.deepEqual(calls, [
    {
      api_path: 'openapi/note/v1/get_doc_content',
      body: {
        doc_id: 'doc-1',
        target_content_format: 0
      }
    }
  ]);
});

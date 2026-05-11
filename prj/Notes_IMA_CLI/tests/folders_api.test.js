import test from 'node:test';
import assert from 'node:assert/strict';

import { list_note_folders } from '../src/ima_api/notes.js';

test('list_note_folders sends list_note_folder_by_cursor payload', async () => {
  const calls = [];
  const client = {
    async post(api_path, body) {
      calls.push({ api_path, body });
      return { note_book_folders: [] };
    }
  };

  await list_note_folders(client, { cursor: '0', limit: 5 });

  assert.deepEqual(calls, [
    {
      api_path: 'openapi/note/v1/list_note_folder_by_cursor',
      body: {
        cursor: '0',
        limit: 5
      }
    }
  ]);
});

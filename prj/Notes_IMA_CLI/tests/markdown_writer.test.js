import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { write_note_markdown } from '../src/exporters/markdown_writer.js';

test('write_note_markdown writes utf8 markdown with front matter', async () => {
  const output_dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ima-cli-output-'));
  const file_path = await write_note_markdown({
    output_dir,
    note: {
      doc_id: 'doc-1',
      title: '示例笔记',
      folder_name: '工作',
      modify_time: 1775577600000,
      content: '这里是正文'
    }
  });

  const content = await fs.readFile(file_path, 'utf8');

  assert.match(content, /^---/);
  assert.match(content, /title: 示例笔记/);
  assert.match(content, /doc_id: doc-1/);
  assert.match(content, /# 示例笔记/);
  assert.match(content, /这里是正文/);
});

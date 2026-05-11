import fs from 'node:fs/promises';
import path from 'node:path';

import { sanitize_note_filename } from './filename.js';
import { to_iso_string } from '../utils/time.js';

function build_markdown(note) {
  const title = note.title || 'Untitled';
  const modify_time = to_iso_string(note.modify_time);
  const exported_at = new Date().toISOString();

  return [
    '---',
    `title: ${title}`,
    `doc_id: ${note.doc_id}`,
    `folder_name: ${note.folder_name ?? ''}`,
    `modify_time: ${modify_time}`,
    'source: ima',
    `exported_at: ${exported_at}`,
    '---',
    '',
    `# ${title}`,
    '',
    note.content ?? '',
    ''
  ].join('\n');
}

export async function write_note_markdown(options) {
  const { output_dir, note } = options;
  const base_name = sanitize_note_filename(note.title, note.doc_id);
  const file_name = `${base_name}-${note.doc_id}.md`;
  const file_path = path.join(output_dir, file_name);

  await fs.mkdir(output_dir, { recursive: true });
  await fs.writeFile(file_path, build_markdown(note), 'utf8');

  return file_path;
}

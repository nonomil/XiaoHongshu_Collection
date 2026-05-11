#!/usr/bin/env node

import { load_ima_credentials } from './config.js';
import { create_ima_api_client } from './ima_api/client.js';
import {
  get_note_content,
  list_note_folders,
  list_notes,
  search_notes
} from './ima_api/notes.js';
import { write_note_markdown } from './exporters/markdown_writer.js';

function build_help_text() {
  return [
    'ima-cli',
    '',
    '用法:',
    '  ima-cli auth check',
    '  ima-cli notes folders',
    '  ima-cli notes list',
    '  ima-cli notes search <query>',
    '  ima-cli notes export --doc-id <doc_id>',
    '  ima-cli notes export --query <query>',
    '  ima-cli notes export --folder-id <folder_id>'
  ].join('\n');
}

async function run_auth_check() {
  const credentials = await load_ima_credentials();
  const client = await create_runtime_client();
  const response = await list_note_folders(client, { cursor: '0', limit: 1 });
  const folder_count = (response.note_book_folders ?? []).length;
  console.log(`凭证检查通过，来源: ${credentials.source}`);
  console.log(`接口探活通过，已读取 ${folder_count} 个笔记本样本。`);
  return 0;
}

function create_mock_client() {
  return {
    async post(api_path, body) {
      if (api_path === 'openapi/note/v1/list_note_folder_by_cursor') {
        return {
          note_book_folders: [
            {
              folder: {
                basic_info: {
                  folder_id: 'folder-all',
                  name: '全部笔记',
                  note_number: 12,
                  modify_time: 1775577600000,
                  folder_type: 1
                }
              }
            },
            {
              folder: {
                basic_info: {
                  folder_id: 'folder-work',
                  name: '工作',
                  note_number: 5,
                  modify_time: 1775664000000,
                  folder_type: 0
                }
              }
            }
          ]
        };
      }

      if (api_path === 'openapi/note/v1/list_note_by_folder_id') {
        return {
          note_book_list: [
            {
              basic_info: {
                basic_info: {
                  docid: body.folder_id ? 'doc-folder-001' : 'doc-001',
                  title: body.folder_id ? '文件夹内笔记' : '示例笔记',
                  folder_name: body.folder_id ? '工作' : '默认笔记本',
                  modify_time: 1775577600000
                }
              }
            }
          ]
        };
      }

      if (api_path === 'openapi/note/v1/search_note_book') {
        if (body.search_type === 1) {
          const rows = [
            {
              doc: {
                basic_info: {
                  docid: 'content-001',
                  title: '项目排期复盘',
                  folder_name: '工作',
                  modify_time: 1775750400000
                }
              }
            },
            {
              doc: {
                basic_info: {
                  docid: 'content-002',
                  title: '项目排期补充',
                  folder_name: '工作',
                  modify_time: 1775836800000
                }
              }
            }
          ];

          return {
            docs: rows.slice(0, body.end ?? rows.length)
          };
        }

        return {
          docs: [
            {
              doc: {
                basic_info: {
                  docid: 'search-001',
                  title: '周报总结',
                  folder_name: '工作',
                  modify_time: 1775577600000
                }
              }
            },
            {
              doc: {
                basic_info: {
                  docid: 'search-002',
                  title: '周报行动项',
                  folder_name: '工作',
                  modify_time: 1775664000000
                }
              }
            }
          ]
        };
      }

      if (api_path === 'openapi/note/v1/get_doc_content') {
        return {
          content: `这是 ${body.doc_id} 的正文内容。`
        };
      }

      throw new Error(`未支持的 mock API: ${api_path}`);
    }
  };
}

async function create_runtime_client() {
  if (process.env.IMA_CLI_USE_MOCK === '1') {
    return create_mock_client();
  }

  const credentials = await load_ima_credentials();
  return create_ima_api_client(credentials);
}

function extract_note_basic_info(note) {
  return note?.doc?.basic_info ?? note?.basic_info?.basic_info ?? {};
}

function extract_folder_basic_info(folder) {
  return folder?.folder?.basic_info ?? folder?.basic_info?.basic_info ?? {};
}

function format_note_row(note) {
  const basic_info = extract_note_basic_info(note);
  return [
    basic_info.docid ?? '',
    basic_info.title ?? '',
    basic_info.folder_name ?? '',
    basic_info.modify_time ?? ''
  ].join('\t');
}

function map_note_basic_info(note) {
  const basic_info = extract_note_basic_info(note);
  return {
    doc_id: basic_info.docid ?? '',
    title: basic_info.title ?? '',
    folder_name: basic_info.folder_name ?? '',
    modify_time: basic_info.modify_time ?? 0
  };
}

function format_folder_row(folder) {
  const basic_info = extract_folder_basic_info(folder);
  return [
    basic_info.folder_id ?? '',
    basic_info.name ?? '',
    basic_info.folder_type ?? '',
    basic_info.note_number ?? '',
    basic_info.modify_time ?? ''
  ].join('\t');
}

function extract_note_rows(response) {
  return response.note_book_list ?? response.docs ?? [];
}

function extract_folder_rows(response) {
  return response.note_book_folders ?? [];
}

function parse_list_args(argv) {
  const parsed = {
    folder_id: '',
    limit: 20
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (current === '--folder-id') {
      parsed.folder_id = next ?? '';
      index += 1;
      continue;
    }

    if (current === '--limit') {
      parsed.limit = Number(next ?? '20') || 20;
      index += 1;
    }
  }

  return parsed;
}

function parse_search_args(argv) {
  const parsed = {
    query: '',
    search_type: 0,
    limit: 20
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (!current.startsWith('--') && !parsed.query) {
      parsed.query = current;
      continue;
    }

    if (current === '--content') {
      parsed.search_type = 1;
      continue;
    }

    if (current === '--limit') {
      parsed.limit = Number(next ?? '20') || 20;
      index += 1;
    }
  }

  return parsed;
}

async function run_notes_folders() {
  const client = await create_runtime_client();
  const response = await list_note_folders(client);
  const rows = extract_folder_rows(response);

  for (const row of rows) {
    console.log(format_folder_row(row));
  }

  return 0;
}

async function run_notes_list(argv) {
  const args = parse_list_args(argv);
  const client = await create_runtime_client();
  const response = await list_notes(client, {
    folder_id: args.folder_id,
    limit: args.limit
  });
  const rows = extract_note_rows(response);

  for (const row of rows) {
    console.log(format_note_row(row));
  }

  return 0;
}

async function run_notes_search(argv) {
  const args = parse_search_args(argv);
  const query = args.query;

  if (!query) {
    throw new Error('notes search 需要提供查询关键词。');
  }

  const client = await create_runtime_client();
  const response = await search_notes(client, {
    query,
    search_type: args.search_type,
    end: args.limit
  });
  const rows = extract_note_rows(response);

  for (const row of rows) {
    console.log(format_note_row(row));
  }

  return 0;
}

function parse_export_args(argv) {
  const parsed = {
    doc_id: '',
    query: '',
    folder_id: '',
    title: '',
    folder_name: '',
    search_type: 0,
    limit: 20,
    output_dir: 'output'
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (current === '--doc-id') {
      parsed.doc_id = next ?? '';
      index += 1;
      continue;
    }

    if (current === '--query') {
      parsed.query = next ?? '';
      index += 1;
      continue;
    }

    if (current === '--folder-id') {
      parsed.folder_id = next ?? '';
      index += 1;
      continue;
    }

    if (current === '--title') {
      parsed.title = next ?? '';
      index += 1;
      continue;
    }

    if (current === '--folder-name') {
      parsed.folder_name = next ?? '';
      index += 1;
      continue;
    }

    if (current === '--output-dir') {
      parsed.output_dir = next ?? 'output';
      index += 1;
      continue;
    }

    if (current === '--content') {
      parsed.search_type = 1;
      continue;
    }

    if (current === '--limit') {
      parsed.limit = Number(next ?? '20') || 20;
      index += 1;
    }
  }

  return parsed;
}

async function export_note(client, basic_note, output_dir) {
  const content_response = await get_note_content(client, {
    doc_id: basic_note.doc_id
  });

  const file_path = await write_note_markdown({
    output_dir,
    note: {
      ...basic_note,
      content: content_response.content ?? ''
    }
  });

  return file_path;
}

async function run_notes_export(argv) {
  const args = parse_export_args(argv);
  const client = await create_runtime_client();
  const notes = [];

  if (args.doc_id) {
    notes.push({
      doc_id: args.doc_id,
      title: args.title,
      folder_name: args.folder_name,
      modify_time: 0
    });
  } else if (args.query) {
    const response = await search_notes(client, {
      query: args.query,
      search_type: args.search_type,
      end: args.limit
    });
    notes.push(...extract_note_rows(response).map(map_note_basic_info));
  } else if (args.folder_id) {
    const response = await list_notes(client, {
      folder_id: args.folder_id,
      limit: args.limit
    });
    notes.push(...extract_note_rows(response).map(map_note_basic_info));
  } else {
    throw new Error('notes export 需要提供 --doc-id、--query 或 --folder-id 之一。');
  }

  for (const note of notes) {
    const file_path = await export_note(client, note, args.output_dir);
    console.log(`已导出: ${file_path}`);
  }

  return 0;
}

async function main(argv) {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    console.log(build_help_text());
    return 0;
  }

  const [scope, action] = argv;

  if (scope === 'auth' && action === 'check') {
    return run_auth_check();
  }

  if (scope === 'notes' && action === 'folders') {
    return run_notes_folders();
  }

  if (scope === 'notes' && action === 'list') {
    return run_notes_list(argv.slice(2));
  }

  if (scope === 'notes' && action === 'search') {
    return run_notes_search(argv.slice(2));
  }

  if (scope === 'notes' && action === 'export') {
    return run_notes_export(argv.slice(2));
  }

  console.error('不支持的命令。使用 --help 查看帮助。');
  return 1;
}

try {
  const exit_code = await main(process.argv.slice(2));
  process.exit(exit_code);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

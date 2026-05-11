export async function list_note_folders(client, options = {}) {
  return client.post('openapi/note/v1/list_note_folder_by_cursor', {
    cursor: options.cursor ?? '0',
    limit: options.limit ?? 20
  });
}

export async function list_notes(client, options = {}) {
  return client.post('openapi/note/v1/list_note_by_folder_id', {
    folder_id: options.folder_id ?? '',
    cursor: options.cursor ?? '',
    limit: options.limit ?? 20
  });
}

export async function search_notes(client, options) {
  const query = options.query ?? '';
  const search_type = options.search_type ?? 0;
  const query_key = search_type === 1 ? 'content' : 'title';

  return client.post('openapi/note/v1/search_note_book', {
    search_type,
    query_info: {
      [query_key]: query
    },
    start: options.start ?? 0,
    end: options.end ?? 20
  });
}

export async function get_note_content(client, options) {
  return client.post('openapi/note/v1/get_doc_content', {
    doc_id: options.doc_id,
    target_content_format: 0
  });
}

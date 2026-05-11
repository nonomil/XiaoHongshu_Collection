function collapse_spaces(value) {
  return value.replace(/\s+/g, ' ').trim();
}

export function sanitize_note_filename(title, doc_id) {
  const normalized_title = collapse_spaces(
    (title ?? '')
      .replace(/[<>:"/\\|?*]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
  );

  if (normalized_title) {
    return normalized_title.slice(0, 120);
  }

  return `untitled-${doc_id}`;
}

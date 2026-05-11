export function to_iso_string(timestamp_ms) {
  if (!timestamp_ms) {
    return '';
  }

  return new Date(timestamp_ms).toISOString();
}

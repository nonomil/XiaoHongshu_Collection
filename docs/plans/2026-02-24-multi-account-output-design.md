# 2026-02-24 multi-account output design

## Goal
Support per-account output folders under `output/`, named `{nickname}_{uid}`, with boards nested below and images stored under that account directory.

## Output Layout
- Notes: `output/{nickname_uid}/{boardName}/{noteTitle}.md`
- Images: `output/{nickname_uid}/_images/{noteId}/...`

## Account Identification
- Prefer `config/account.json` for explicit account mapping (supports multi-account runs).
- Fallback: auto-detect from current page via CDP (uid + nickname).

## Data Model
- Keep `data/raw_notes.json` as the merged store for dedupe/ resume.
- Store per-note `account` metadata: `{ uid, nickname, accountKey }`.

## Scope of Changes
- `scripts/extract_v4.js`: detect account info and attach to notes.
- `scripts/ocr_and_write.js`: read accountKey and write output to account folder.
- `config/account.example.json`: add example config; ignore real `config/account.json`.

## Error Handling
- If neither config nor auto-detect yields account info, default to `unknown_000000`.
- Sanitize nickname for path safety.

## Acceptance Criteria
- Notes for different accounts go into separate `output/{nickname_uid}` folders.
- Images stored under the same account folder.
- Existing pipeline remains functional for single-account usage.

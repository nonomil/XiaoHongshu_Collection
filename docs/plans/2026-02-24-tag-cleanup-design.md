# 2026-02-24 Tag Cleanup Design

## Goal
Remove garbled/invalid tags while keeping useful AI tags, and ensure minimum tag count via fallback.

## Scope
- Only affects tag generation in `scripts/ocr_and_write.js`.
- No changes to note body content.

## Rules
- Keep tags that contain Chinese characters or ASCII letters/digits.
- Drop tags containing replacement characters (e.g., `�`) or non-printable chars.
- Drop tags of length 1.
- De-duplicate after cleaning.
- If fewer than 3 tags remain, fill from fallback tags.

## Behavior
- AI tags are still used but cleaned.
- Fallback tags are only used to补齐不足.

## Acceptance Criteria
- Tags like `С����` are removed.
- Valid Chinese tags remain.
- Tag list has at least 3 items.

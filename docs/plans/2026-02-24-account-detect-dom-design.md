# 2026-02-24 Account Detection via DOM Design

## Goal
Extract nickname (and if available uid) directly from the personal profile page DOM, with network listener as fallback.

## Data Sources
1. **DOM fields** on profile page (nickname, intro, counts)
2. **URL or data attributes** for uid (if present)
3. **Network listener** for `user/me` as fallback

## Flow
- After CDP connection, attempt DOM extraction of profile fields.
- If uid found, build `{nickname}_{uid}` directly.
- If only nickname, use `{nickname}_unknown` temporarily while waiting for network listener to fill uid.

## Error Handling
- If no nickname found, keep `unknown_000000`.
- Log only minimal info; do not break extraction.

## Acceptance Criteria
- On profile page, nickname is captured reliably.
- When uid is available, accountKey becomes `{nickname}_{uid}`.
- If uid not available, accountKey at least uses nickname to avoid `unknown_000000`.

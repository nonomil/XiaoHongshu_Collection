# 2026-02-24 Account Detection via Network Design

## Goal
Improve account (uid/nickname) detection by capturing `user/me` API responses via CDP Network events, with DOM/localStorage fallback.

## Data Sources
1. **Network response capture** for `https://edith.xiaohongshu.com/api/sns/web/v2/user/me`
2. **DOM / __INITIAL_STATE__ / localStorage** fallback

## Flow
- Enable `Network` domain after CDP connection.
- Listen to `Network.responseReceived` and capture matching URL.
- Fetch response body via `Network.getResponseBody` to extract uid/nickname.
- Cache account info once found.
- If not found, fall back to existing DOM/localStorage detection.

## Error Handling
- If all methods fail, keep `unknown_000000`.
- Log a warning but do not block extraction.

## Acceptance Criteria
- When `user/me` is returned, uid/nickname are captured and used as `accountKey`.
- If network capture fails, fallback still works as before.
- No new failures in extraction flow.

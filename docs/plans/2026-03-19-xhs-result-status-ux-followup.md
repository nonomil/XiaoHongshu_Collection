# XiaoHongshu Result Status UX Follow-up

Date: 2026-03-19

## What changed

We extended the result panel so common failure classes are easier to scan without opening raw JSON.

Current short labels:

- `网页端不可见（300031）`
- `账号异常或需重新登录`
- `当前标签不是笔记详情页`
- `未找到小红书标签页`

Existing warning labels kept:

- `评论剩余内容需登录后查看`
- `评论未完整加载`
- `评论采集有提示`

## Files updated

- `ui/ui_helpers.js`
  - rewrote file as clean UTF-8
  - added `describeResultStatus`
  - expanded `buildErrorDisplay` login detection to include English `login` / `sign in`

- `ui/app.js`
  - failed rows now use short status labels first
  - full raw error stays in row `title` tooltip

- `scripts/ai/__tests__/ui_helpers.test.js`
  - added regression coverage for short failure labels

- `scripts/ai/__tests__/ui_app_warnings.test.js`
  - added UI rendering coverage for `300031` short label

## Why this helps

The result list now separates three different situations at a glance:

1. The note itself is not visible on the web.
2. The account or login state is unstable.
3. The note is openable, but comments are only partially accessible.

This reduces the need to read full error paragraphs for every row.

## Verification

Validated with:

- `node --test scripts/ai/__tests__/ui_helpers.test.js`
- `node --test scripts/ai/__tests__/ui_app_warnings.test.js`
- `node --test scripts/ai/__tests__/ui_app_error_banner.test.js scripts/ai/__tests__/ui_helpers.test.js scripts/ai/__tests__/ui_app_warnings.test.js scripts/ai/__tests__/ui_open_output.test.js scripts/ai/__tests__/ui_server.test.js`
- `node --test scripts/ai/__tests__/save_note.test.js`
- `npm test`

Latest full suite result at this checkpoint: `231/231` passing.

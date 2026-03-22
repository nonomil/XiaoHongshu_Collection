# Inbox Flow Layout Design

Date: 2026-03-21

## Context

Current UI exposes inbox sync actions in two places:

- top-right header buttons
- entry 03 external inbox card

That split creates a broken flow. Users can click sync in the header, but the follow-up action `收件箱解析保存` only exists inside entry 03, so the workflow feels incomplete and easy to lose.

The user also wants a faster sync mode for the most recent `10 / 20 / 30` messages instead of only the current `最新 / 全部` split.

## Options Considered

### Option 1: Keep header sync buttons and add helper copy

- Pros: smallest UI change
- Cons: preserves the main confusion because actions are still split across different areas

### Option 2: Remove header sync actions and make entry 03 a complete two-step inbox workflow

- Pros: one clear place to act, save button stays beside sync controls, lower cognitive load
- Cons: requires moderate HTML/CSS/app wiring changes

### Option 3: Move all inbox actions into a global toolbar

- Pros: visually centralized
- Cons: mixes three very different workflows together and makes the page flatter but less understandable

## Recommendation

Use Option 2.

## Final Design

### Layout

- Remove direct inbox sync buttons from the top header
- Keep header focused on page identity and settings
- Turn entry 03 into a clearer `外部收件箱` flow card
- Inside entry 03, present two visible steps:
  - Step 1: `同步到收件箱`
  - Step 2: `收件箱解析保存`

### Sync Range

- Add a select control in entry 03 for recent sync scope
- Options:
  - `最近 10 条`
  - `最近 20 条`
  - `最近 30 条`
- Keep a separate `同步全部` action for full import

### Sync Semantics

- New UI recent-sync action maps to a backend `recent` mode
- `recent` means: fetch the latest N Pushbullet messages globally, not "all unseen since last cursor"
- `recent` does not advance `lastModified`, avoiding cursor corruption when only part of the feed is pulled
- Existing backend `latest` mode can stay for compatibility, but UI no longer depends on it

### Result Feedback

- Sync result summary should show a readable mode label:
  - `全部`
  - `最近 10 条`
  - `最近 20 条`
  - `最近 30 条`
- Existing result panel behavior stays unchanged otherwise

## Testing Strategy

- HTML test for new entry 03 structure and range select
- App test for recent-sync request body carrying the selected limit
- Server test for `/api/inbox/sync` forwarding `mode=recent` and `limit`
- Sync logic test proving `recent` mode does not overwrite `lastModified`
- Pushbullet provider test proving `maxItems` truncates latest pulls
- Local Chrome screenshots for desktop and mobile

## Out of Scope

- Persisting sync range in settings
- Reworking Pushbullet config storage
- Auto-running inbox save immediately after sync

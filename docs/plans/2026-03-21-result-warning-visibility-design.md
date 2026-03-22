# Result Warning Visibility Design

Date: 2026-03-21

## Context

The result panel already groups items by final collection, surfaces failure rows first, and now has cleaner action hierarchy. The remaining high-value visibility gap is warnings. Rows can include important warnings such as incomplete comments or login-gated content, but users still need to visually scan group contents to find them.

## Options Considered

### Option 1: Only add a warning badge to group headers

- Pros: minimal change
- Cons: still requires opening or scanning multiple groups to focus only on warning rows

### Option 2: Add both a group warning badge and a `有提示` filter

- Pros: improves both overview and focused inspection
- Cons: adds one more filter option when warnings exist

### Option 3: Move all warnings into one separate summary block

- Pros: centralized
- Cons: disconnects warnings from their result rows and groups

## Recommendation

Use Option 2.

Behavior:

- if any result rows contain warnings, show a `有提示` filter chip
- when `有提示` is active, only render rows with warnings
- show a compact warning badge on each group header that has warning rows
- keep existing `全部 / 分类 / 失败` filters unchanged

## Testing Strategy

- add a failing warning-focused UI test
- add a failing CSS test for warning badge styling
- run focused UI tests
- run `npm test`

## Out of Scope

- warning severity levels
- changing warning text generation logic
- adding a separate warning-only page

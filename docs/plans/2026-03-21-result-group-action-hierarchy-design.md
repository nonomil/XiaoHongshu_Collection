# Result Group Action Hierarchy Design

Date: 2026-03-21

## Context

After the desktop empty-state and mobile result-priority improvements, the next visible friction point is the action density inside each result group. Every group currently shows:

- count
- run action
- copy links
- fill input
- export list

This is functional, but it makes the group header visually busy, especially when there are many groups or warnings.

## Options Considered

### Option 1: Keep all actions visible and only weaken secondary button styles

- Pros: lowest implementation cost
- Cons: still visually crowded; does not reduce scanning noise

### Option 2: Keep one primary action visible and move the rest behind a lightweight "更多" menu

- Pros: preserves all existing capabilities, improves hierarchy, small frontend-only change
- Cons: one extra click for copy/fill/export actions

### Option 3: Move all actions into a second expanded row under the summary

- Pros: simpler than a menu
- Cons: still consumes vertical space and does not reduce clutter enough

## Recommendation

Use Option 2.

The action hierarchy should be:

- primary visible action: `开始保存本组`
- secondary menu entry: `更多`
- secondary actions inside menu:
  - `复制本组链接`
  - `填入输入框`
  - `导出本组清单`

## Interaction Rules

- clicking `更多` should not collapse the outer result group
- secondary menu is hidden by default
- toggling one group menu should close other open group menus
- after running a secondary action, the menu can close again

## Testing Strategy

- add a failing DOM test that requires the new `更多` toggle and hidden secondary menu
- add a failing CSS markup test for the new hierarchy classes
- keep existing run/copy/fill/export behavior tests
- run focused tests and `npm test`

## Out of Scope

- backend changes
- permission changes
- replacing the result group layout entirely

# Mobile Result Priority Design

Date: 2026-03-21

## Context

The previous UI audit confirmed that the desktop empty-state issue was improved, but mobile still shows the input cards first and pushes the result panel below the first screen. That means users do not immediately see progress or failure feedback after returning to the page on a phone-sized viewport.

## Options Considered

### Option 1: Move the result card ahead of the input stack on small screens

- Pros: smallest change, no backend impact, directly improves visibility of progress and results
- Cons: the first visible card on mobile becomes feedback-first instead of input-first

### Option 2: Keep current order and add a floating jump link

- Pros: preserves current content order
- Cons: more interaction cost, more UI chrome, less reliable than just fixing layout order

### Option 3: Build a compact mobile-only result strip

- Pros: could keep both entry and status visible
- Cons: more code, more states, higher regression risk for a small benefit

## Recommendation

Use Option 1.

For viewports at `980px` and below:

- place `.result-card` before `.stack`
- reduce the empty-state height so the result card does not dominate the full mobile screen
- keep desktop layout unchanged

## Testing Strategy

- Add a CSS regression test that requires mobile ordering styles
- Run the focused UI markup tests
- Capture fresh mobile and desktop screenshots
- Run `npm test`

## Out of Scope

- changing backend payloads
- redesigning result-group actions
- adding a floating action button or jump navigation
